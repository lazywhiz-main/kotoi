import {
  executeExplorationsJob,
  markExplorationsJobPending,
} from '../_shared/explorationsJob.ts';
import type { ClusterMode } from '../_shared/clusterExplorations.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { assertWritableEntitlement } from '../_shared/entitlements.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import {
  checkCostBudget,
  ESTIMATED_RESEARCH_COST_USD,
  getDailyLimitUsd,
  getTodayCostUsd,
} from '../_shared/usageLedger.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

function formatCaughtError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      const code = typeof record.code === 'string' ? ` (${record.code})` : '';
      const details =
        typeof record.details === 'string' && record.details ? `: ${record.details}` : '';
      return `${record.message}${code}${details}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err ?? 'Unknown error');
}

function parseMode(body: unknown): ClusterMode {
  if (!body || typeof body !== 'object') return 'incremental';
  const mode = (body as { mode?: unknown }).mode;
  return mode === 'rebuild' ? 'rebuild' : 'incremental';
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const db = getServiceClient();

    let mode: ClusterMode = 'incremental';
    try {
      const body = await req.json();
      mode = parseMode(body);
    } catch {
      mode = 'incremental';
    }

    const writable = await assertWritableEntitlement(db, user.id);
    if (!writable.ok) {
      return jsonResponse({ error: writable.code }, 402);
    }

    const { data: settings } = await db
      .from('user_settings')
      .select('explorations_job_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settings?.explorations_job_status === 'pending') {
      return jsonResponse({
        ok: true,
        processing: true,
        mode,
        explorations_job_status: 'pending',
      });
    }

    const budget = await checkCostBudget(db, user.id, ESTIMATED_RESEARCH_COST_USD);
    if (!budget.ok) {
      return jsonResponse(
        {
          error: 'daily_limit_exceeded',
          today_cost_usd: budget.todayCost,
          daily_limit_usd: budget.dailyLimit,
        },
        429,
      );
    }

    try {
      await markExplorationsJobPending(db, user.id, mode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'already_pending') {
        return jsonResponse({
          ok: true,
          processing: true,
          mode,
          explorations_job_status: 'pending',
        });
      }
      throw err;
    }

    EdgeRuntime.waitUntil(
      executeExplorationsJob(db, user.id, mode).catch((err) =>
        console.error('executeExplorationsJob background error:', err),
      ),
    );

    return jsonResponse({
      ok: true,
      processing: true,
      mode,
      explorations_job_status: 'pending',
      today_cost_usd: await getTodayCostUsd(db, user.id),
      daily_limit_usd: getDailyLimitUsd(),
    });
  } catch (err) {
    const message = formatCaughtError(err);
    console.error('cluster-explorations error:', message, err);
    return jsonResponse({ error: message }, 500);
  }
});
