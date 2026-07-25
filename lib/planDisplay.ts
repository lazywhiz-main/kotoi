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

/** 表示用（一般） */
export const PLAN_PRICE_COPY = {
  monthly: '¥1,200 / 月',
  annual: '¥10,000 / 年',
  annualPerMonth: '約 ¥833',
  student_monthly: '¥600 / 月',
  student_annual: '¥5,000 / 年',
  studentAnnualPerMonth: '約 ¥417',
} as const;

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

/** 月額系 → 年額へアップグレード可能なとき true */
export function canUpgradeToAnnual(plan: PlanKind | null | undefined): boolean {
  return plan === 'monthly' || plan === 'student_monthly';
}

/** アップグレード先の plan_kind（購入・dev override 用） */
export function annualUpgradeTarget(
  plan: PlanKind | null | undefined,
): 'annual' | 'student_annual' | null {
  if (plan === 'monthly') return 'annual';
  if (plan === 'student_monthly') return 'student_annual';
  return null;
}

export function annualUpgradeHint(plan: PlanKind | null | undefined): string | null {
  if (plan === 'monthly') {
    return '年払いに切り替えると、月あたりの負担を抑えられます。価格は購入画面の表示に従います。';
  }
  if (plan === 'student_monthly') {
    return '学割の年払いに切り替えると、月あたりの負担を抑えられます。価格は購入画面の表示に従います。';
  }
  return null;
}
