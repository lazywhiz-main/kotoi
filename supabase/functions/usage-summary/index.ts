import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { getDailyLimitUsd, getTodayCostUsd, tokyoDayKey } from '../_shared/usageLedger.ts';

type FnAgg = {
  fn: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  count: number;
};

type LedgerRow = {
  fn: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  day?: string;
  created_at?: string;
};

function aggregateByFn(rows: LedgerRow[]): {
  by_fn: FnAgg[];
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
} {
  const byFnMap = new Map<string, FnAgg>();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;

  for (const row of rows) {
    inputTokens += row.input_tokens ?? 0;
    outputTokens += row.output_tokens ?? 0;
    costUsd += Number(row.cost_usd ?? 0);
    const existing = byFnMap.get(row.fn) ?? {
      fn: row.fn,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      count: 0,
    };
    existing.input_tokens += row.input_tokens ?? 0;
    existing.output_tokens += row.output_tokens ?? 0;
    existing.cost_usd += Number(row.cost_usd ?? 0);
    existing.count += 1;
    byFnMap.set(row.fn, existing);
  }

  const by_fn = [...byFnMap.values()].sort((a, b) => b.cost_usd - a.cost_usd);
  return { by_fn, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd };
}

/** plan から期間長を推定して period_end から開始を逆算（列未整備時のフォールバック） */
function inferPeriodStart(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
  plan: string | null | undefined,
): string | null {
  if (periodStart) return periodStart;
  if (!periodEnd) return null;
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return null;
  const days = plan === 'annual' || plan === 'student_annual' ? 365 : 30;
  return new Date(end.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const db = getServiceClient();
    const today = tokyoDayKey();
    const monthKey = today.slice(0, 7);

    const [
      { data: todayRows, error: todayError },
      { data: lifeRows, error: lifeError },
      { data: sub },
      todayCost,
      dailyLimit,
    ] = await Promise.all([
      db
        .from('usage_ledger')
        .select('fn, input_tokens, output_tokens, cost_usd, day, created_at')
        .eq('user_id', user.id)
        .eq('day', today)
        .order('created_at', { ascending: false }),
      db
        .from('usage_ledger')
        .select('fn, input_tokens, output_tokens, cost_usd, day, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      db
        .from('subscriptions')
        .select('trial_state, plan, current_period_start, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle(),
      getTodayCostUsd(db, user.id),
      Promise.resolve(getDailyLimitUsd()),
    ]);

    if (todayError) throw todayError;
    if (lifeError) throw lifeError;

    const allRows = (lifeRows ?? []) as LedgerRow[];
    const todayAgg = aggregateByFn((todayRows ?? []) as LedgerRow[]);
    const lifeAgg = aggregateByFn(allRows);
    const monthRows = allRows.filter((row) => String(row.day ?? '').startsWith(monthKey));
    const monthAgg = aggregateByFn(monthRows);

    const periodStartIso = inferPeriodStart(
      sub?.current_period_start,
      sub?.current_period_end,
      sub?.plan,
    );
    const periodStartMs = periodStartIso ? new Date(periodStartIso).getTime() : null;
    const periodRows =
      periodStartMs != null && Number.isFinite(periodStartMs)
        ? allRows.filter((row) => {
            const t = row.created_at ? new Date(row.created_at).getTime() : NaN;
            return Number.isFinite(t) && t >= periodStartMs;
          })
        : [];
    const periodAgg = aggregateByFn(periodRows);

    return jsonResponse({
      ok: true,
      day: today,
      month: monthKey,
      timezone: 'Asia/Tokyo',
      today_cost_usd: todayCost,
      daily_limit_usd: dailyLimit,
      input_tokens: todayAgg.input_tokens,
      output_tokens: todayAgg.output_tokens,
      by_fn: todayAgg.by_fn,
      lifetime_cost_usd: lifeAgg.cost_usd,
      lifetime_by_fn: lifeAgg.by_fn,
      month_cost_usd: monthAgg.cost_usd,
      month_by_fn: monthAgg.by_fn,
      period_started_at: periodStartIso,
      period_cost_usd: periodAgg.cost_usd,
      period_by_fn: periodAgg.by_fn,
      is_subscribed: sub?.trial_state === 'subscribed',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
