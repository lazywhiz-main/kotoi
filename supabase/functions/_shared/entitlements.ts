import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type TrialState = 'active' | 'achieved' | 'expired' | 'subscribed' | 'read_only';

export type SubscriptionRow = {
  user_id: string;
  trial_state: TrialState;
  trial_started_at: string;
  trial_achieved_at: string | null;
  paywall_shown_at: string | null;
  free_graphic_rec_exploration_id: string | null;
  plan: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

export type Entitlement = 'full' | 'read_only';
export type GraphicRecGate = 'allow' | 'paywall' | 'read_only';

const SAFETY_DAYS = 90;
const SAFETY_NOTES = 60;
const SAFETY_COST_USD = 2;

export function entitlementOf(sub: Pick<SubscriptionRow, 'trial_state'>): Entitlement {
  if (sub.trial_state === 'subscribed') return 'full';
  if (sub.trial_state === 'active' || sub.trial_state === 'achieved') return 'full';
  return 'read_only';
}

export function canStartGraphicRec(
  sub: Pick<SubscriptionRow, 'trial_state' | 'free_graphic_rec_exploration_id'>,
  explorationId: string,
): GraphicRecGate {
  if (sub.trial_state === 'subscribed') return 'allow';

  // 無料1枠が未使用なら、安全弁後でも1枚目は渡す
  if (!sub.free_graphic_rec_exploration_id) return 'allow';

  // 同探究の作り直し／stale 更新は1枠の延長
  if (sub.free_graphic_rec_exploration_id === explorationId) return 'allow';

  // 2枚目を押したときは常にペイウォール（安全弁後の自動ポップとは別）
  return 'paywall';
}

/**
 * サーバ正本。DB上の完成見取り図の有無で1枚目を判定する。
 * free_graphic_rec_exploration_id だけだと、バックフィル食い違いで
 * 「この画面では未作成なのに弾かれる」が起きる。
 */
export async function assertGraphicRecAllowed(
  db: SupabaseClient,
  userId: string,
  explorationId: string,
): Promise<
  | { ok: true; sub: SubscriptionRow }
  | { ok: false; code: 'paywall_required' | 'read_only'; sub: SubscriptionRow }
> {
  const sub = await ensureSubscription(db, userId);
  if (sub.trial_state === 'subscribed') return { ok: true, sub };

  const { data: exploration, error: explorationError } = await db
    .from('explorations')
    .select('id, graphic_rec_status, graphic_rec_storage_path')
    .eq('id', explorationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (explorationError) throw explorationError;
  if (!exploration) {
    return { ok: false, code: 'read_only', sub };
  }

  const thisAlreadyGifted =
    exploration.graphic_rec_status === 'done' ||
    exploration.graphic_rec_status === 'stale' ||
    !!exploration.graphic_rec_storage_path;

  // 同探究の更新は常に可（安全弁後も、渡した1枚の延長）
  if (thisAlreadyGifted) return { ok: true, sub };

  const { count: giftedCount, error: countError } = await db
    .from('explorations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .or(
      'graphic_rec_status.eq.done,graphic_rec_status.eq.stale,graphic_rec_storage_path.not.is.null',
    );
  if (countError) throw countError;

  // アカウントでまだ1枚も受け取っていない → 安全弁後でも1枚目を渡す
  if ((giftedCount ?? 0) === 0) {
    if (sub.free_graphic_rec_exploration_id) {
      await db
        .from('subscriptions')
        .update({ free_graphic_rec_exploration_id: null })
        .eq('user_id', userId);
      sub.free_graphic_rec_exploration_id = null;
    }
    return { ok: true, sub };
  }

  // すでに他探究で受け取っている＝2枚目。ユーザーが生成を押した操作なのでペイウォールへ。
  // （安全弁の自動ポップとは別。意図した「続き」の入口）
  const now = new Date().toISOString();
  if (!sub.paywall_shown_at) {
    await db
      .from('subscriptions')
      .update({ paywall_shown_at: now })
      .eq('user_id', userId);
    sub.paywall_shown_at = now;
  }
  return { ok: false, code: 'paywall_required', sub };
}

export async function ensureSubscription(
  db: SupabaseClient,
  userId: string,
): Promise<SubscriptionRow> {
  const { data: existing, error } = await db
    .from('subscriptions')
    .select(
      'user_id, trial_state, trial_started_at, trial_achieved_at, paywall_shown_at, free_graphic_rec_exploration_id, plan, current_period_start, current_period_end',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  if (!existing) {
    const { data: created, error: insertError } = await db
      .from('subscriptions')
      .insert({ user_id: userId })
      .select(
        'user_id, trial_state, trial_started_at, trial_achieved_at, paywall_shown_at, free_graphic_rec_exploration_id, plan, current_period_start, current_period_end',
      )
      .single();
    if (insertError) throw insertError;
    return created as SubscriptionRow;
  }

  return (await maybeApplySafetyValve(db, existing as SubscriptionRow)) as SubscriptionRow;
}

async function maybeApplySafetyValve(
  db: SupabaseClient,
  sub: SubscriptionRow,
): Promise<SubscriptionRow> {
  if (sub.trial_state !== 'active' && sub.trial_state !== 'achieved') {
    return sub;
  }

  const [{ count: noteCount }, { data: costRows }] = await Promise.all([
    db.from('notes').select('id', { count: 'exact', head: true }).eq('user_id', sub.user_id),
    db.from('usage_ledger').select('cost_usd').eq('user_id', sub.user_id),
  ]);

  const totalCost = (costRows ?? []).reduce(
    (sum, row) => sum + (Number(row.cost_usd) || 0),
    0,
  );
  const daysElapsed =
    (Date.now() - new Date(sub.trial_started_at).getTime()) / (1000 * 60 * 60 * 24);

  const tripped =
    daysElapsed >= SAFETY_DAYS ||
    (noteCount ?? 0) >= SAFETY_NOTES ||
    totalCost >= SAFETY_COST_USD;

  if (!tripped) return sub;

  const now = new Date().toISOString();
  const { data: updated, error } = await db
    .from('subscriptions')
    .update({
      trial_state: 'expired',
      paywall_shown_at: sub.paywall_shown_at ?? now,
    })
    .eq('user_id', sub.user_id)
    .select(
      'user_id, trial_state, trial_started_at, trial_achieved_at, paywall_shown_at, free_graphic_rec_exploration_id, plan, current_period_start, current_period_end',
    )
    .single();

  if (error) throw error;
  return updated as SubscriptionRow;
}

/** AI 書き込み前。read_only / expired ならエラーコードを返す。 */
export async function assertWritableEntitlement(
  db: SupabaseClient,
  userId: string,
): Promise<{ ok: true; sub: SubscriptionRow } | { ok: false; code: 'read_only'; sub: SubscriptionRow }> {
  const sub = await ensureSubscription(db, userId);
  if (entitlementOf(sub) === 'read_only') {
    return { ok: false, code: 'read_only', sub };
  }
  return { ok: true, sub };
}

/** 1枚目が done になったとき呼ぶ。安全弁後でも枠を消費記録する。 */
export async function recordFirstGraphicRecDone(
  db: SupabaseClient,
  userId: string,
  explorationId: string,
): Promise<void> {
  const sub = await ensureSubscription(db, userId);
  if (sub.trial_state === 'subscribed') return;
  if (sub.free_graphic_rec_exploration_id) return;

  const now = new Date().toISOString();
  const nextState =
    sub.trial_state === 'active'
      ? 'achieved'
      : sub.trial_state; // expired / read_only / achieved はそのまま

  await db
    .from('subscriptions')
    .update({
      free_graphic_rec_exploration_id: explorationId,
      trial_state: nextState,
      trial_achieved_at: sub.trial_achieved_at ?? now,
    })
    .eq('user_id', userId);
}
