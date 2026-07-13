import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

/**
 * 開発・検証用の課金／トライアル状態切替。
 * Secrets: ALLOW_TRIAL_DEV_OVERRIDE=1
 *
 * 【実課金差し替えポイント】
 * - クライアント: 設定の「課金モード」Switch / paywall の購入ボタン
 *   → StoreKit / Play Billing の購入成功コールバックに置き換え
 * - ここ (subscribe): Receipt 検証 Edge Function が
 *   trial_state / plan / current_period_end / store / store_txn_id を書く
 * - UI は subscriptions 行を読むだけ（planDisplay.ts）なので触らなくてよい
 *
 * actions:
 * - subscribe: 課金モード ON（仮）。body.plan = monthly|annual（default monthly）
 * - reset_trial: 課金モード OFF → 無料トライアル
 * - force_expire: 安全弁後（閲覧のみ）
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (Deno.env.get('ALLOW_TRIAL_DEV_OVERRIDE') !== '1') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = (body as { action?: string }).action ?? 'subscribe';
    const planInput = (body as { plan?: string }).plan;
    const db = getServiceClient();

    const { error: ensureError } = await db
      .from('subscriptions')
      .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (ensureError) throw ensureError;

    if (action === 'subscribe') {
      const plan =
        planInput === 'annual' ||
        planInput === 'student_monthly' ||
        planInput === 'student_annual'
          ? planInput
          : 'monthly';
      const days =
        plan === 'annual' || plan === 'student_annual' ? 365 : 30;
      const periodStart = new Date();
      const periodEnd = new Date(periodStart.getTime() + days * 24 * 60 * 60 * 1000);

      const { error } = await db
        .from('subscriptions')
        .update({
          trial_state: 'subscribed',
          plan,
          store: 'dev',
          store_txn_id: `dev_${Date.now()}`,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancelled_at: null,
        })
        .eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({
        ok: true,
        trial_state: 'subscribed',
        plan,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        store: 'dev',
      });
    }

    if (action === 'reset_trial') {
      const { error } = await db
        .from('subscriptions')
        .update({
          trial_state: 'active',
          trial_started_at: new Date().toISOString(),
          trial_achieved_at: null,
          paywall_shown_at: null,
          free_graphic_rec_exploration_id: null,
          plan: null,
          store: null,
          store_txn_id: null,
          current_period_start: null,
          current_period_end: null,
          cancelled_at: null,
        })
        .eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ ok: true, trial_state: 'active' });
    }

    if (action === 'force_expire') {
      const now = new Date().toISOString();
      const { error } = await db
        .from('subscriptions')
        .update({
          trial_state: 'expired',
          paywall_shown_at: now,
          plan: null,
          store: null,
          store_txn_id: null,
          current_period_start: null,
          current_period_end: null,
          cancelled_at: null,
        })
        .eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ ok: true, trial_state: 'expired' });
    }

    return jsonResponse({ error: 'unknown_action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
