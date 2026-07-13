const FN_LABELS: Record<string, string> = {
  'classify-note': 'メモの分類',
  'summarize-note': '要約',
  'generate-questions': '問い',
  'generate-questions-more': '問い',
  'generate-questions-video-fallback': '問い',
  'run-research': '調べる',
  'run-deepdive': '深掘り',
  'chat-turn-ask': 'AIに質問',
  'chat-turn-note': '追記への問い',
  'draft-thought': '考えの下書き',
  'cluster-explorations': '探究の整理',
  'rebuild-explorations': '探究の作り直し',
  'generate-exploration-graphic-rec': '見取り図',
  'generate-exploration-graphic-rec-openai': '見取り図',
  'weekly-review': '今週のふりかえり',
};

/** 表示上まとめるキー（見取り図の Claude + 画像など） */
const DISPLAY_MERGE: Record<string, string> = {
  'generate-exploration-graphic-rec': 'graphic-rec',
  'generate-exploration-graphic-rec-openai': 'graphic-rec',
  'generate-questions': 'questions',
  'generate-questions-more': 'questions',
  'generate-questions-video-fallback': 'questions',
};

const MERGE_LABELS: Record<string, string> = {
  'graphic-rec': '見取り図',
  questions: '問い',
};

export type UsageBreakdownRow = {
  key: string;
  label: string;
  cost_usd: number;
  count: number;
};

export function usageFnLabel(fn: string): string {
  return FN_LABELS[fn] ?? fn;
}

/** 設定画面向け: 同一行為の fn を1行にまとめる */
export function mergeUsageBreakdown(
  rows: { fn: string; cost_usd: number; count: number }[],
): UsageBreakdownRow[] {
  const map = new Map<string, UsageBreakdownRow>();

  for (const row of rows) {
    const mergeKey = DISPLAY_MERGE[row.fn] ?? row.fn;
    const label = MERGE_LABELS[mergeKey] ?? usageFnLabel(row.fn);
    const existing = map.get(mergeKey);
    if (existing) {
      existing.cost_usd += row.cost_usd;
      // 見取り図は Claude+画像で1回。問い系は呼び出し回数を合算。
      if (mergeKey === 'graphic-rec') {
        existing.count = Math.max(existing.count, row.count);
      } else {
        existing.count += row.count;
      }
    } else {
      map.set(mergeKey, {
        key: mergeKey,
        label,
        cost_usd: row.cost_usd,
        count: row.count,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd);
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
