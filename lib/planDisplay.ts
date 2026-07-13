/**
 * 課金表示用ラベル。
 * 実 Store 購読が入ったら、Receipt / productId から plan を埋める側だけ差し替え。
 * UI はこの関数群を見続ける。
 */
import type { PlanKind } from '@/lib/entitlements';

export const PLAN_LABEL: Record<PlanKind, string> = {
  monthly: '月額',
  annual: '年額',
  student_monthly: '学割・月額',
  student_annual: '学割・年額',
};

export function planDisplayName(plan: PlanKind | null | undefined): string {
  if (!plan) return 'プラン';
  return PLAN_LABEL[plan] ?? plan;
}

export function formatRenewalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

/** 開発用ストア印。本番 IAP では 'app_store' / 'play' 等に置き換わる想定 */
export function isDevBillingStore(store: string | null | undefined): boolean {
  return store === 'dev';
}
