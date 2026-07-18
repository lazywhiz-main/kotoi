import {
  dismissDailyQuestion,
  ensureTodayDelivery,
  saveDailyQuestion,
} from '../_shared/dailyQuestion.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = (body as { action?: string }).action ?? 'ensure';
    const deliveryId = (body as { delivery_id?: string }).delivery_id;

    const db = getServiceClient();

    if (action === 'save') {
      if (!deliveryId) return jsonResponse({ error: 'delivery_id is required' }, 400);
      const result = await saveDailyQuestion(db, user.id, deliveryId);
      return jsonResponse({
        ok: true,
        delivery: result.delivery,
        thread_item_id: result.thread_item_id,
      });
    }

    if (action === 'dismiss') {
      if (!deliveryId) return jsonResponse({ error: 'delivery_id is required' }, 400);
      const delivery = await dismissDailyQuestion(db, user.id, deliveryId);
      return jsonResponse({ ok: true, delivery });
    }

    if (action === 'ensure') {
      const { data: settings, error: settingsError } = await db
        .from('user_settings')
        .select('recall_rhythm, recall_weekday, recall_hour, notify_daily_question')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settingsError) throw settingsError;

      const rhythm = (settings?.recall_rhythm ?? 'off') as 'off' | 'daily' | 'weekdays' | 'weekly';
      const delivery = await ensureTodayDelivery(db, user.id, {
        recall_rhythm: rhythm,
        recall_weekday: settings?.recall_weekday ?? 0,
        recall_hour: settings?.recall_hour ?? 8,
        notify_daily_question: settings?.notify_daily_question ?? true,
      });

      return jsonResponse({ ok: true, delivery });
    }

    return jsonResponse({ error: 'unknown_action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('daily-question error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
