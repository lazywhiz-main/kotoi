import { executeGraphicRecJob, markGraphicRecPending } from '../_shared/graphicRec.ts';
import { assertGraphicRecAllowed } from '../_shared/entitlements.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import {
  checkCostBudget,
  ESTIMATED_GRAPHIC_REC_COST_USD,
  getDailyLimitUsd,
  getTodayCostUsd,
} from '../_shared/usageLedger.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const exploration_id = body.exploration_id as string | undefined;
    if (!exploration_id) return jsonResponse({ error: 'exploration_id is required' }, 400);

    const db = getServiceClient();

    const { data: existing } = await db
      .from('explorations')
      .select('graphic_rec_status')
      .eq('id', exploration_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) return jsonResponse({ error: '探究が見つかりません。' }, 404);

    if (existing.graphic_rec_status === 'pending') {
      return jsonResponse({
        ok: true,
        processing: true,
        graphic_rec_status: 'pending',
      });
    }

    const gate = await assertGraphicRecAllowed(db, user.id, exploration_id);
    if (!gate.ok) {
      return jsonResponse(
        {
          error: gate.code,
          trial_state: gate.sub.trial_state,
          reason: gate.code === 'paywall_required' ? 'second_graphic' : 'read_only',
        },
        402,
      );
    }

    const budget = await checkCostBudget(db, user.id, ESTIMATED_GRAPHIC_REC_COST_USD);
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
      await markGraphicRecPending(db, user.id, exploration_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'already_pending') {
        return jsonResponse({
          ok: true,
          processing: true,
          graphic_rec_status: 'pending',
        });
      }
      throw err;
    }

    EdgeRuntime.waitUntil(
      executeGraphicRecJob(db, user.id, exploration_id).catch((err) =>
        console.error('executeGraphicRecJob background error:', err),
      ),
    );

    return jsonResponse({
      ok: true,
      processing: true,
      graphic_rec_status: 'pending',
      today_cost_usd: await getTodayCostUsd(db, user.id),
      daily_limit_usd: getDailyLimitUsd(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('generate-exploration-graphic-rec error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
