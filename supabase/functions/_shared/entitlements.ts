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

/** 無料1枠を「使い切った」とみなす状態（成功して渡したもの） */
function isSuccessfulGiftStatus(
  status: string | null | undefined,
  storagePath: string | null | undefined,
): boolean {
  return status === 'done' || status === 'stale' || !!storagePath;
}

export function entitlementOf(sub: Pick<SubscriptionRow, 'trial_state'>): Entitlement {
  if (sub.trial_state === 'subscribed') return 'full';
  if (sub.trial_state === 'active' || sub.trial_state === 'achieved') return 'full';
  return 'read_only';
}

/** 見取り図の新規生成。同探究の更新は free 枠の延長として allow。 */
export function canStartGraphicRec(
  sub: Pick<SubscriptionRow, 'trial_state' | 'free_graphic_rec_exploration_id'>,
  explorationId: string,
): GraphicRecGate {
  if (sub.trial_state === 'subscribed') return 'allow';

  // 無料1枠未使用（成功記録なし）なら、安全弁後でも1枚目は渡す
  if (!sub.free_graphic_rec_exploration_id) return 'allow';

  // 同探究の作り直し／stale 更新は1枠の延長
  if (sub.free_graphic_rec_exploration_id === explorationId) return 'allow';

  // 2枚目を押したときは常にペイウォール
  return 'paywall';
}

async function countSuccessfulGifts(
  db: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await db
    .from('explorations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .or(
      'graphic_rec_status.eq.done,graphic_rec_status.eq.stale,graphic_rec_storage_path.not.is.null',
    );
  if (error) throw error;
  return count ?? 0;
}

async function countBlockingOthers(
  db: SupabaseClient,
  userId: string,
  explorationId: string,
): Promise<number> {
  // 他探究の「成功」または「生成中」は2枚目扱い。error は含めない（失敗は枠未消費）
  const { count, error } = await db
    .from('explorations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('id', explorationId)
    .or(
      'graphic_rec_status.eq.done,graphic_rec_status.eq.stale,graphic_rec_status.eq.pending,graphic_rec_storage_path.not.is.null',
    );
  if (error) throw error;
  return count ?? 0;
}

/**
 * 成功した見取り図が1枚も無いのに free / achieved が残っていたら戻す。
 * （失敗後・データ不整合の修復）
 */
export async function reconcileFreeGraphicSlot(
  db: SupabaseClient,
  userId: string,
): Promise<SubscriptionRow> {
  const sub = await ensureSubscription(db, userId);
  if (sub.trial_state === 'subscribed') return sub;

  const successful = await countSuccessfulGifts(db, userId);
  if (successful > 0) return sub;

  const needsClear =
    !!sub.free_graphic_rec_exploration_id || sub.trial_state === 'achieved';
  if (!needsClear) return sub;

  const patch: Record<string, unknown> = {
    free_graphic_rec_exploration_id: null,
  };
  // 成功ゼロなのに achieved だけ残っているのは失敗後の食い違い
  if (sub.trial_state === 'achieved') {
    patch.trial_state = 'active';
    patch.trial_achieved_at = null;
  }

  const { data: updated, error } = await db
    .from('subscriptions')
    .update(patch)
    .eq('user_id', userId)
    .select(
      'user_id, trial_state, trial_started_at, trial_achieved_at, paywall_shown_at, free_graphic_rec_exploration_id, plan, current_period_start, current_period_end',
    )
    .single();
  if (error) throw error;
  return updated as SubscriptionRow;
}

/**
 * サーバ正本。
 *
 * - 無料1枠は「成功して渡した」ときだけ消費（done / stale / storage）
 * - error は未消費。同じ／別探究でやり直せる
 * - 他探究が pending のあいだは2枚目開始を止め、レースを防ぐ
 */
export async function assertGraphicRecAllowed(
  db: SupabaseClient,
  userId: string,
  explorationId: string,
): Promise<
  | { ok: true; sub: SubscriptionRow }
  | { ok: false; code: 'paywall_required' | 'read_only'; sub: SubscriptionRow }
> {
  let sub = await reconcileFreeGraphicSlot(db, userId);
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

  // 同探究にすでに渡した見取り図がある → 更新・作り直しは常に可
  if (
    isSuccessfulGiftStatus(
      exploration.graphic_rec_status,
      exploration.graphic_rec_storage_path,
    )
  ) {
    return { ok: true, sub };
  }

  const blockingOthers = await countBlockingOthers(db, userId, explorationId);
  if (blockingOthers > 0) {
    const now = new Date().toISOString();
    if (!sub.paywall_shown_at) {
      await db
        .from('subscriptions')
        .update({ paywall_shown_at: now })
        .eq('user_id', userId);
      sub = { ...sub, paywall_shown_at: now };
    }
    return { ok: false, code: 'paywall_required', sub };
  }

  // 成功も他探究の pending もない → まだ1枚目の権利あり（error 後の再挑戦含む）
  return { ok: true, sub };
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

/** 1枚目が done になったときだけ呼ぶ。失敗では呼ばない。 */
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
    .eq('user_id', userId)
    .is('free_graphic_rec_exploration_id', null);
}

/**
 * 生成失敗時。成功した見取り図がまだ無ければ無料枠を未使用に戻す。
 */
export async function releaseFreeGraphicSlotOnFailure(
  db: SupabaseClient,
  userId: string,
): Promise<void> {
  await reconcileFreeGraphicSlot(db, userId);
}
