import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

/**
 * RevenueCat Webhook → subscriptions 更新。
 *
 * Secrets:
 * - REVENUECAT_WEBHOOK_AUTH … Dashboard の Authorization header と完全一致
 *   （例: "Bearer sk_live_xxx" または任意の共有文字列）
 *
 * デプロイは JWT 検証オフ必須（さもなくばゲートで 401）:
 *   supabase functions deploy revenuecat-webhook --no-verify-jwt
 *
 * app_user_id はクライアントで Purchases.logIn(supabaseUserId) した UUID であること。
 */

type RcEvent = {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  store?: string | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  environment?: string | null;
};

type RcPayload = {
  api_version?: string;
  event?: RcEvent;
};

function planFromProductId(
  productId: string | undefined,
): 'monthly' | 'annual' | 'student_monthly' | 'student_annual' | null {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (id.includes('student') && id.includes('annual')) return 'student_annual';
  if (id.includes('student')) return 'student_monthly';
  if (id.includes('annual')) return 'annual';
  if (id.includes('monthly')) return 'monthly';
  return null;
}

function storeFromRc(store: string | null | undefined): string | null {
  if (!store) return null;
  const s = store.toUpperCase();
  if (s === 'APP_STORE' || s === 'MAC_APP_STORE') return 'apple';
  if (s === 'PLAY_STORE') return 'google';
  if (s === 'STRIPE') return 'stripe';
  if (s === 'PROMOTIONAL') return 'promotional';
  return store.toLowerCase();
}

function msToIso(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

const ACTIVE_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

const END_TYPES = new Set(['EXPIRATION', 'REFUND']);

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH')?.trim();
    if (!expected) {
      console.error('REVENUECAT_WEBHOOK_AUTH is not set');
      return jsonResponse({ error: 'misconfigured' }, 500);
    }
    const auth = req.headers.get('Authorization')?.trim() ?? '';
    if (auth !== expected) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    const payload = (await req.json()) as RcPayload;
    const event = payload.event;
    if (!event?.type || !event.app_user_id) {
      return jsonResponse({ error: 'invalid_payload' }, 400);
    }

    const userId = event.app_user_id;
    // RC の匿名 ID やテスト用は UUID 以外があり得る → 無視
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(userId)) {
      console.warn('revenuecat-webhook: skip non-uuid app_user_id', userId);
      return jsonResponse({ ok: true, skipped: true });
    }

    const db = getServiceClient();
    await db
      .from('subscriptions')
      .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });

    const type = event.type.toUpperCase();

    if (ACTIVE_TYPES.has(type)) {
      const plan = planFromProductId(event.product_id) ?? 'monthly';
      const periodEnd = msToIso(event.expiration_at_ms);
      const periodStart = msToIso(event.purchased_at_ms) ?? new Date().toISOString();
      const { error } = await db
        .from('subscriptions')
        .update({
          trial_state: 'subscribed',
          plan,
          store: storeFromRc(event.store),
          store_txn_id:
            event.original_transaction_id ?? event.transaction_id ?? null,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancelled_at: null,
        })
        .eq('user_id', userId);
      if (error) throw error;
      return jsonResponse({ ok: true, trial_state: 'subscribed', type });
    }

    if (type === 'CANCELLATION') {
      // 期間終了までは subscribed のまま。cancelled_at だけ刻む
      const patch: Record<string, string> = {
        cancelled_at: new Date().toISOString(),
      };
      const periodEnd = msToIso(event.expiration_at_ms);
      if (periodEnd) patch.current_period_end = periodEnd;
      const { error } = await db
        .from('subscriptions')
        .update(patch)
        .eq('user_id', userId);
      if (error) throw error;
      return jsonResponse({ ok: true, type });
    }

    if (END_TYPES.has(type)) {
      const { error } = await db
        .from('subscriptions')
        .update({
          trial_state: 'read_only',
          cancelled_at: new Date().toISOString(),
          current_period_end: msToIso(event.expiration_at_ms),
        })
        .eq('user_id', userId);
      if (error) throw error;
      return jsonResponse({ ok: true, trial_state: 'read_only', type });
    }

    // TRANSFER / SUBSCRIBER_ALIAS / TEST 等は無視
    return jsonResponse({ ok: true, ignored: type });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('revenuecat-webhook', message);
    return jsonResponse({ error: message }, 500);
  }
});
