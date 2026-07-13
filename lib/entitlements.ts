/**
 * 到達トライアル / 見取り図枠の判定（クライアント・ドキュメント用）。
 * Edge 側の正本は supabase/functions/_shared/entitlements.ts
 */

export type TrialState = 'active' | 'achieved' | 'expired' | 'subscribed' | 'read_only';
export type PlanKind = 'monthly' | 'annual' | 'student_monthly' | 'student_annual';

export type Entitlement = 'full' | 'read_only';
export type GraphicRecGate = 'allow' | 'paywall' | 'read_only';

export type SubscriptionRow = {
  user_id: string;
  trial_state: TrialState;
  trial_started_at: string;
  trial_achieved_at: string | null;
  paywall_shown_at: string | null;
  free_graphic_rec_exploration_id: string | null;
  plan: PlanKind | null;
  is_student: boolean;
  student_verified_at: string | null;
  store: string | null;
  store_txn_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

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
  // 無料1枠未使用なら、expired / read_only でも1枚目は渡す
  if (!sub.free_graphic_rec_exploration_id) return 'allow';
  if (sub.free_graphic_rec_exploration_id === explorationId) return 'allow';
  // 2枚目を押したときは常にペイウォール（安全弁後も）
  return 'paywall';
}
