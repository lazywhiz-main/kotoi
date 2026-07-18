/**
 * 記事URLの HTML から本文テキストを抽出する（Deno Edge 向け・依存なし）。
 * OG メタは linkPreview 側。ここでは要約用の本文を取る。
 */

const FETCH_TIMEOUT_MS = 12_000;
const HTML_LIMIT = 500_000;
/** DB 保存上限 */
export const STORE_ARTICLE_CHARS = 50_000;
/** AI に渡す上限（動画字幕と同程度） */
export const AI_ARTICLE_CHARS = 12_000;
const MIN_USEFUL_CHARS = 280;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function isAllowedHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^(10\.|127\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (host === '0.0.0.0' || host === '[::1]') return false;
    return true;
  } catch {
    return false;
  }
}

function pickMeta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function pickTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function stripNoiseTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(br|BR)\s*\/?>/g, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '・');
  const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(noTags)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractByTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = html.match(re);
  return match?.[1] ?? null;
}

function extractByClassHint(html: string): string | null {
  const hints = [
    'article-body',
    'article__body',
    'article-content',
    'post-content',
    'entry-content',
    'post-body',
    'story-body',
    'rich-text',
    'c-article__body',
    'articleBody',
  ];
  for (const hint of hints) {
    const re = new RegExp(
      `<([a-z0-9]+)[^>]*(?:class|id)=["'][^"']*${hint}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      'i',
    );
    const match = html.match(re);
    if (match?.[2] && htmlToText(match[2]).length >= MIN_USEFUL_CHARS) {
      return match[2];
    }
  }
  return null;
}

function extractJsonLdArticleBody(html: string): string | null {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let best: string | null = null;
  for (const match of html.matchAll(re)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;
        const body =
          (typeof obj.articleBody === 'string' && obj.articleBody) ||
          (typeof obj.text === 'string' && obj.text) ||
          null;
        if (body && body.trim().length >= MIN_USEFUL_CHARS) {
          if (!best || body.length > best.length) best = body.trim();
        }
        const graph = obj['@graph'];
        if (Array.isArray(graph)) {
          for (const node of graph) {
            if (!node || typeof node !== 'object') continue;
            const n = node as Record<string, unknown>;
            const nb =
              (typeof n.articleBody === 'string' && n.articleBody) ||
              (typeof n.text === 'string' && n.text) ||
              null;
            if (nb && nb.trim().length >= MIN_USEFUL_CHARS) {
              if (!best || nb.length > best.length) best = nb.trim();
            }
          }
        }
      }
    } catch {
      // JSON-LD が壊れていても無視
    }
  }
  return best;
}

function pickBestHtmlChunk(clean: string): string {
  const chunks = [
    extractByTag(clean, 'article'),
    extractByClassHint(clean),
    extractByTag(clean, 'main'),
    (() => {
      const m = clean.match(
        /<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i,
      );
      return m?.[1] ?? null;
    })(),
    extractByTag(clean, 'body'),
  ].filter((c): c is string => !!c);

  let best = '';
  for (const chunk of chunks) {
    const text = htmlToText(chunk);
    if (text.length > best.length) best = text;
  }
  return best;
}

export type ArticleFetchResult = {
  title: string | null;
  body: string | null;
  description: string | null;
};

export async function fetchArticleContent(url: string): Promise<ArticleFetchResult> {
  if (!isAllowedHttpUrl(url)) {
    return { title: null, body: null, description: null };
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; KOTOI/1.0; +https://kotoi.art; article-fetch)',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.8',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });

  if (!res.ok) {
    return { title: null, body: null, description: null };
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    return { title: null, body: null, description: null };
  }

  const html = (await res.text()).slice(0, HTML_LIMIT);
  const title =
    pickMeta(html, 'og:title') ??
    pickMeta(html, 'twitter:title') ??
    pickTitleTag(html);
  const description =
    pickMeta(html, 'og:description') ?? pickMeta(html, 'description');

  const clean = stripNoiseTags(html);
  const jsonLd = extractJsonLdArticleBody(clean);
  let bodyText = pickBestHtmlChunk(clean);

  if (jsonLd && jsonLd.length > bodyText.length) {
    bodyText = jsonLd;
  }

  if (bodyText.length < MIN_USEFUL_CHARS && description) {
    const combined = [title, description].filter(Boolean).join('\n\n');
    if (combined.length > bodyText.length) bodyText = combined;
  }

  if (bodyText.length < MIN_USEFUL_CHARS) {
    return { title, body: null, description };
  }

  const clipped =
    bodyText.length > STORE_ARTICLE_CHARS
      ? `${bodyText.slice(0, STORE_ARTICLE_CHARS)}\n…（以下省略）`
      : bodyText;

  return { title, body: clipped, description };
}

export function articleBodyForAi(body: string | null | undefined): string | undefined {
  const text = body?.trim();
  if (!text) return undefined;
  if (text.length <= AI_ARTICLE_CHARS) return text;
  return `${text.slice(0, AI_ARTICLE_CHARS)}\n…（以下省略）`;
}
