const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)}\]]+$/, '');
}

/** メモ本文から URL を検出。source_url は最初の URL。raw_text は入力そのまま。 */
export function parseNoteInput(text: string): {
  raw_text: string;
  source_url: string | null;
  urls: string[];
} {
  const raw_text = text.trim();
  const matches = raw_text.match(URL_PATTERN) ?? [];
  const urls = matches.map(cleanUrl);
  return {
    raw_text,
    source_url: urls[0] ?? null,
    urls,
  };
}

export function hasUrl(text: string): boolean {
  return /https?:\/\/[^\s<>"']+/i.test(text.trim());
}
