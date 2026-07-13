const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/i;
/** DB 保存用の上限 */
const MAX_TRANSCRIPT_CHARS = 50_000;
/** 要約・問い生成に渡す上限（長尺で Edge 壁時計を食い潰さない） */
export const AI_TRANSCRIPT_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 20_000;

type FetchFn = typeof fetch;

let innertubeFetch: FetchFn | null = null;

function getInnertubeFetch(): FetchFn {
  if (innertubeFetch) return innertubeFetch;

  const proxyUrl = Deno.env.get('YOUTUBE_TRANSCRIPT_PROXY_URL')?.trim();
  if (!proxyUrl) return fetch;

  if (typeof Deno.createHttpClient !== 'function') {
    console.error('YOUTUBE_TRANSCRIPT_PROXY_URL is set but Deno.createHttpClient is unavailable');
    return fetch;
  }

  const client = Deno.createHttpClient({ proxy: { url: proxyUrl } });
  innertubeFetch = (input, init) => fetch(input, { ...init, client });
  console.log('youtube transcript: using proxy for innertube requests');
  return innertubeFetch;
}

function getSupadataApiKey(): string | null {
  return (
    Deno.env.get('YOUTUBE_TRANSCRIPT_SUPADATA_API_KEY')?.trim() ||
    Deno.env.get('SUPADATA_API_KEY')?.trim() ||
    null
  );
}

type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
};

type Json3Event = {
  segs?: { utf8?: string }[];
};

type InnertubeClient = {
  name: string;
  version: string;
  ua: string;
  clientName: string;
  apiKey: string;
};

// クライアント種別ごとに正しい API キーをペアリング（yt-dlp 準拠）
const INNERTUBE_CLIENTS: InnertubeClient[] = [
  {
    name: 'ANDROID',
    version: '20.10.38',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
    clientName: '3',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KHWQFEUWOwk7aw',
  },
  {
    name: 'ANDROID',
    version: '21.05.032',
    ua: 'com.google.android.youtube/21.05.032 (Linux; U; Android 14) gzip',
    clientName: '3',
    apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KHWQFEUWOwk7aw',
  },
  {
    name: 'IOS',
    version: '20.10.38',
    ua: 'com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 18_0 like Mac OS X)',
    clientName: '5',
    apiKey: 'AIzaSyB-63vPrdThhZFurzO4qo573lXk8X1xCg',
  },
  {
    name: 'IOS',
    version: '21.05.032',
    ua: 'com.google.ios.youtube/21.05.032 (iPhone16,2; U; CPU iOS 18_0 like Mac OS X)',
    clientName: '5',
    apiKey: 'AIzaSyB-63vPrdThhZFurzO4qo573lXk8X1xCg',
  },
  {
    name: 'ANDROID',
    version: '20.10.38',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
    clientName: '3',
    apiKey: 'AIzaSyAO_FJ2SlqU8Q4EcREe5l7OmEegfm2k2aQ',
  },
  {
    name: 'ANDROID',
    version: '20.10.38',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip',
    clientName: '3',
    apiKey: 'AIzaSyCfcOSZ-oLHaZzHp_2aFjVw0F7E0xg1Q1g',
  },
];

const PREFERRED_LANGS = ['ja', 'en', 'ko', 'zh-Hans', 'zh-Hant'];

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_RE.test(url);
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id || null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const fromQuery = parsed.searchParams.get('v');
      if (fromQuery) return fromQuery;

      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' && parts[1]) return parts[1];
      if (parts[0] === 'embed' && parts[1]) return parts[1];
    }

    return null;
  } catch {
    return null;
  }
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;

  for (const lang of PREFERRED_LANGS) {
    const exact = tracks.filter((track) => track.languageCode === lang);
    const manual = exact.find((track) => track.kind !== 'asr');
    if (manual) return manual;
    if (exact[0]) return exact[0];

    const prefix = tracks.filter((track) => track.languageCode.startsWith(`${lang}-`));
    const prefixManual = prefix.find((track) => track.kind !== 'asr');
    if (prefixManual) return prefixManual;
    if (prefix[0]) return prefix[0];
  }

  const anyManual = tracks.find((track) => track.kind !== 'asr');
  return anyManual ?? tracks[0];
}

function captionUrlWithFmt(baseUrl: string, fmt: string): string {
  const url = new URL(baseUrl);
  url.searchParams.delete('fmt');
  url.searchParams.set('fmt', fmt);
  return url.toString();
}

function parseJson3Transcript(body: string): string {
  const data = JSON.parse(body) as { events?: Json3Event[] };
  return (data.events ?? [])
    .filter((event) => event.segs?.length)
    .map((event) => event.segs!.map((seg) => decodeHtml(seg.utf8 ?? '')).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVttTranscript(body: string): string {
  const lines = body.split('\n');
  const chunks: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === 'WEBVTT') continue;
    if (trimmed.startsWith('Kind:') || trimmed.startsWith('Language:')) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (trimmed.includes('-->')) continue;
    const cleaned = trimmed.replace(/<[^>]+>/g, ' ');
    chunks.push(decodeHtml(cleaned));
  }

  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

function parseXmlTranscript(body: string): string {
  const chunks: string[] = [];
  const patterns = [
    /<text[^>]*>([^<]*)<\/text>/g,
    /<p[^>]*>([^<]*)<\/p>/g,
  ];

  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const text = decodeHtml(match[1] ?? '');
      if (text) chunks.push(text);
    }
    if (chunks.length > 0) break;
  }

  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

function parseCaptionBody(body: string, fmt: string): string {
  if (!body.trim()) return '';

  if (fmt === 'json3') {
    try {
      return parseJson3Transcript(body);
    } catch {
      return '';
    }
  }

  if (fmt === 'vtt') return parseVttTranscript(body);
  if (fmt === 'srv3' || fmt === 'ttml') return parseXmlTranscript(body);

  return '';
}

async function fetchWithRetry(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    lastResponse = response;

    if (response.status !== 429) return response;
    if (attempt < retries) {
      await sleep(1000 * (attempt + 1));
    }
  }

  return lastResponse!;
}

type PlayerResult = {
  tracks: CaptionTrack[];
  playability?: { status?: string; reason?: string };
  loginRequired: boolean;
};

async function fetchCaptionTracksWithClient(
  fetchFn: FetchFn,
  videoId: string,
  client: InnertubeClient,
): Promise<PlayerResult> {
  const response = await fetchWithRetry(
    fetchFn,
    `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.ua,
        'X-YouTube-Client-Name': client.clientName,
        'X-YouTube-Client-Version': client.version,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: client.name,
            clientVersion: client.version,
            hl: 'ja',
            gl: 'JP',
            androidSdkVersion: 30,
          },
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Innertube player failed (${client.name}): ${response.status}`);
  }

  const data = await response.json();
  const tracks =
    (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks as CaptionTrack[]) ?? [];
  const status = data?.playabilityStatus?.status;
  const reason = data?.playabilityStatus?.reason;

  return {
    tracks,
    playability: { status, reason },
    loginRequired: status === 'LOGIN_REQUIRED',
  };
}

async function fetchCaptionTracks(
  fetchFn: FetchFn,
  videoId: string,
): Promise<{ tracks: CaptionTrack[]; client: InnertubeClient; loginRequired: boolean }> {
  let lastPlayability: { status?: string; reason?: string } | undefined;
  let loginRequired = false;

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const result = await fetchCaptionTracksWithClient(fetchFn, videoId, client);
      lastPlayability = result.playability;
      if (result.loginRequired) loginRequired = true;
      const { tracks } = result;
      if (tracks.length > 0) {
        console.log(
          'caption tracks found',
          videoId,
          client.name,
          client.version,
          tracks.map((t) => `${t.languageCode}:${t.kind ?? 'manual'}`).join(','),
        );
        return { tracks, client, loginRequired: false };
      }
      console.error(
        'caption tracks empty',
        videoId,
        client.name,
        result.playability?.status,
        result.playability?.reason ?? '',
      );
    } catch (err) {
      console.error('caption tracks error', videoId, client.name, err);
    }
  }

  console.error(
    'fetchCaptionTracks: all clients failed',
    videoId,
    lastPlayability?.status,
    lastPlayability?.reason ?? '',
    loginRequired ? '(datacenter IP blocked — set YOUTUBE_TRANSCRIPT_PROXY_URL or YOUTUBE_TRANSCRIPT_SUPADATA_API_KEY)' : '',
  );

  return { tracks: [], client: INNERTUBE_CLIENTS[0], loginRequired };
}

async function fetchCaptionText(
  fetchFn: FetchFn,
  track: CaptionTrack,
  videoId: string,
  client: InnertubeClient,
): Promise<string | null> {
  const formats = ['json3', 'vtt', 'srv3'] as const;
  const referer = `https://www.youtube.com/watch?v=${videoId}`;

  for (const fmt of formats) {
    const url = captionUrlWithFmt(track.baseUrl, fmt);
    const response = await fetchWithRetry(fetchFn, url, {
      headers: {
        'User-Agent': client.ua,
        Referer: referer,
        Origin: 'https://www.youtube.com',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      console.error('caption fetch failed', videoId, fmt, response.status);
      continue;
    }

    const body = await response.text();
    const text = parseCaptionBody(body, fmt);
    if (text) {
      console.log('caption fetched', videoId, track.languageCode, fmt, text.length);
      return text.slice(0, MAX_TRANSCRIPT_CHARS);
    }

    console.error('caption empty parse', videoId, fmt, body.length);
  }

  return null;
}

type InnertubeTranscriptResult = {
  text: string | null;
  loginRequired: boolean;
};

async function fetchInnertubeTranscriptOnce(url: string): Promise<InnertubeTranscriptResult> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return { text: null, loginRequired: false };

  const fetchFn = getInnertubeFetch();
  const { tracks, client, loginRequired } = await fetchCaptionTracks(fetchFn, videoId);
  if (tracks.length === 0) return { text: null, loginRequired };

  const preferred = pickCaptionTrack(tracks);
  const candidates = preferred
    ? [preferred, ...tracks.filter((track) => track.baseUrl !== preferred.baseUrl)]
    : tracks;

  for (const track of candidates) {
    try {
      const text = await fetchCaptionText(fetchFn, track, videoId, client);
      if (text) return { text, loginRequired: false };
    } catch (err) {
      console.error('fetchCaptionText error:', videoId, track.languageCode, err);
    }
  }

  return { text: null, loginRequired };
}

async function fetchSupadataTranscript(url: string, videoId: string): Promise<string | null> {
  const apiKey = getSupadataApiKey();
  if (!apiKey) return null;

  const langCandidates = ['ja', 'en', 'ko'];
  for (const lang of langCandidates) {
    const params = new URLSearchParams({ url, text: 'true', lang });
    const response = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?${params}`,
      {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.error('supadata transcript failed', videoId, lang, response.status);
      continue;
    }

    const data = await response.json();
    const content = data?.content;
    if (typeof content === 'string' && content.trim()) {
      console.log('supadata transcript ok', videoId, lang, content.length);
      return content.trim().slice(0, MAX_TRANSCRIPT_CHARS);
    }

    if (Array.isArray(content)) {
      const text = content
        .map((chunk: { text?: string }) => chunk.text ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        console.log('supadata transcript ok', videoId, lang, text.length);
        return text.slice(0, MAX_TRANSCRIPT_CHARS);
      }
    }
  }

  const autoParams = new URLSearchParams({ url, text: 'true' });
  const autoResponse = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?${autoParams}`,
    {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!autoResponse.ok) {
    console.error('supadata transcript failed', videoId, 'auto', autoResponse.status);
    return null;
  }

  const autoData = await autoResponse.json();
  const autoContent = autoData?.content;
  if (typeof autoContent === 'string' && autoContent.trim()) {
    console.log('supadata transcript ok', videoId, autoData?.lang ?? 'auto', autoContent.length);
    return autoContent.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  }

  return null;
}

export async function fetchYouTubeTranscriptText(url: string): Promise<string | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  try {
    // Edge の DC IP では Innertube が LOGIN_REQUIRED になりやすい。
    // Supadata があるときは先に試し、無駄なリトライと error ログを避ける。
    if (getSupadataApiKey()) {
      const preferred = await fetchSupadataTranscript(url, videoId);
      if (preferred) return preferred;
      console.error('fetchYouTubeTranscriptText: supadata empty, trying innertube', videoId);
    }

    const innertube = await fetchInnertubeTranscriptOnce(url);
    if (innertube.text) return innertube.text;

    if (innertube.loginRequired) {
      // キー無しで Innertube だけ失敗した場合のヒント
      if (!getSupadataApiKey() && !Deno.env.get('YOUTUBE_TRANSCRIPT_PROXY_URL')) {
        console.error(
          'fetchYouTubeTranscriptText: blocked on datacenter IP — configure YOUTUBE_TRANSCRIPT_SUPADATA_API_KEY or YOUTUBE_TRANSCRIPT_PROXY_URL',
          videoId,
        );
      } else {
        console.error('fetchYouTubeTranscriptText: innertube LOGIN_REQUIRED after fallbacks', videoId);
      }
    } else {
      console.error('fetchYouTubeTranscriptText: no caption tracks', videoId);
    }

    return null;
  } catch (err) {
    console.error('fetchYouTubeTranscriptText error:', videoId, err);
    return null;
  }
}
