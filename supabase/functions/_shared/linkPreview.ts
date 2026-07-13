export type LinkPreview = {
  title: string | null;
  image_url: string | null;
  site_name: string | null;
};

const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/i;
const FETCH_TIMEOUT_MS = 8000;
const HTML_LIMIT = 120_000;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
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

function resolveImageUrl(imageUrl: string | null, pageUrl: string): string | null {
  if (!imageUrl) return null;
  try {
    return new URL(imageUrl, pageUrl).href;
  } catch {
    return null;
  }
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function fetchYouTubeOembed(url: string): Promise<LinkPreview | null> {
  const oembedUrl =
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;

  const data = await res.json();
  return {
    title: typeof data.title === 'string' ? data.title : null,
    image_url: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
    site_name: 'YouTube',
  };
}

async function fetchOpenGraph(url: string): Promise<LinkPreview> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'MONDO/1.0 (+https://mondo.app; link-preview)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });

  if (!res.ok) {
    return { title: null, image_url: null, site_name: hostnameFromUrl(url) };
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    return { title: null, image_url: null, site_name: hostnameFromUrl(url) };
  }

  const html = (await res.text()).slice(0, HTML_LIMIT);
  const title =
    pickMeta(html, 'og:title') ??
    pickMeta(html, 'twitter:title') ??
    pickTitleTag(html);
  const image_url = resolveImageUrl(
    pickMeta(html, 'og:image') ?? pickMeta(html, 'twitter:image'),
    url,
  );
  const site_name =
    pickMeta(html, 'og:site_name') ?? hostnameFromUrl(url);

  return { title, image_url, site_name };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  if (!isAllowedUrl(url)) {
    return { title: null, image_url: null, site_name: null };
  }

  try {
    if (YOUTUBE_RE.test(url)) {
      const youtube = await fetchYouTubeOembed(url);
      if (youtube) return youtube;
    }
    return await fetchOpenGraph(url);
  } catch {
    return { title: null, image_url: null, site_name: hostnameFromUrl(url) };
  }
}

export function linkPreviewFields(preview: LinkPreview, sourceUrl: string) {
  const fields: Record<string, string> = {};
  if (preview.title) {
    fields.source_title = preview.title;
    if (YOUTUBE_RE.test(sourceUrl)) {
      fields.video_title = preview.title;
    }
  }
  if (preview.image_url) {
    fields.source_image_url = preview.image_url;
  }
  return fields;
}
