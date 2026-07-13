const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)}\]]+$/, '');
}

export function extractSourceUrl(rawText: string, sourceUrl: string | null): string | null {
  if (sourceUrl) return sourceUrl;
  const match = rawText.match(URL_PATTERN);
  return match ? cleanUrl(match[0]) : null;
}
