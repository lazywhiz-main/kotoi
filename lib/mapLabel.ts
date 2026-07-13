/** 一覧・出典表示用（長め） */
export function listNodeLabel(text: string, max = 28): string {
  const trimmed = text.trim();
  if (!trimmed) return 'メモ';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/** 問いの地図ノード用（円内に収める短い2行） */
export function mapNodeLines(label: string, fallback: string): string[] {
  const compact = (label.trim() || fallback).replace(/\s+/g, ' ');
  if (!compact) return [fallback];

  if (compact.length <= 5) return [compact];
  if (compact.length <= 10) {
    return [compact.slice(0, 5), compact.slice(5)].filter(Boolean);
  }

  return [compact.slice(0, 4) + '…', compact.slice(4, 8) + '…'];
}
