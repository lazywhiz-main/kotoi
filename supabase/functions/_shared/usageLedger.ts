import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;

export const ESTIMATED_RESEARCH_COST_USD = 0.04;
export const ESTIMATED_DEEPDIVE_COST_USD = 0.03;
export const ESTIMATED_WEEKLY_REVIEW_COST_USD = 0.02;
export const ESTIMATED_GRAPHIC_REC_COST_USD = 0.08;

/** 設定「今日」・日次上限の区切り（日本時間） */
export function tokyoDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getDailyLimitUsd(): number {
  const raw = Deno.env.get('DAILY_COST_LIMIT_USD');
  const parsed = raw ? Number.parseFloat(raw) : 2;
  return Number.isFinite(parsed) ? parsed : 2;
}

export function estimateTokenCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * INPUT_COST_PER_M + outputTokens * OUTPUT_COST_PER_M) / 1_000_000;
}

export async function getTodayCostUsd(db: SupabaseClient, userId: string): Promise<number> {
  const today = tokyoDayKey();
  const { data, error } = await db
    .from('usage_ledger')
    .select('cost_usd')
    .eq('user_id', userId)
    .eq('day', today);

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
}

export async function checkCostBudget(
  db: SupabaseClient,
  userId: string,
  estimatedCost: number,
): Promise<{ ok: boolean; todayCost: number; dailyLimit: number }> {
  const todayCost = await getTodayCostUsd(db, userId);
  const dailyLimit = getDailyLimitUsd();
  return {
    ok: todayCost + estimatedCost <= dailyLimit,
    todayCost,
    dailyLimit,
  };
}

export async function recordUsage(
  db: SupabaseClient,
  userId: string,
  fn: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const costUsd = estimateTokenCost(inputTokens, outputTokens);
  const { error } = await db.from('usage_ledger').insert({
    user_id: userId,
    fn,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
    day: tokyoDayKey(),
  });
  if (error) throw error;
}

export async function recordFlatUsage(
  db: SupabaseClient,
  userId: string,
  fn: string,
  costUsd: number,
): Promise<void> {
  const { error } = await db.from('usage_ledger').insert({
    user_id: userId,
    fn,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: costUsd,
    day: tokyoDayKey(),
  });
  if (error) throw error;
}
