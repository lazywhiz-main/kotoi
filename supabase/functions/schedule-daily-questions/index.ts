import { runScheduledDailyQuestions } from '../_shared/dailyQuestion.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const expected = Deno.env.get('DAILY_QUESTION_CRON_AUTH')?.trim();
    if (expected) {
      const auth = req.headers.get('Authorization')?.trim() ?? '';
      if (auth !== expected) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
    }

    const db = getServiceClient();
    const result = await runScheduledDailyQuestions(db, { sendPush: true });

    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('schedule-daily-questions error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
