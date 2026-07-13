import { generateWeeklyReview } from '../_shared/weeklyReview.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import {
  checkCostBudget,
  ESTIMATED_WEEKLY_REVIEW_COST_USD,
  getDailyLimitUsd,
  getTodayCostUsd,
} from '../_shared/usageLedger.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const db = getServiceClient();
    const budget = await checkCostBudget(db, user.id, ESTIMATED_WEEKLY_REVIEW_COST_USD);

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

    const result = await generateWeeklyReview(db, user.id);

    return jsonResponse({
      ok: true,
      ...result,
      today_cost_usd: result.status === 'generated'
        ? await getTodayCostUsd(db, user.id)
        : undefined,
      daily_limit_usd: getDailyLimitUsd(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('weekly-review error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
