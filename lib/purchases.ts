import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

/** OS の購読管理画面（showManageSubscriptions が使えないときのフォールバック） */
const IOS_MANAGE_SUBSCRIPTIONS_URL =
  'https://apps.apple.com/account/subscriptions';
const ANDROID_MANAGE_SUBSCRIPTIONS_URL =
  'https://play.google.com/store/account/subscriptions?package=app.kotoi';

/** RevenueCat Entitlement ID（ダッシュボードと一致させる） */
export const RC_ENTITLEMENT_PRO = 'pro';

export type PaywallPlanChoice = 'annual' | 'monthly' | 'student_annual' | 'student_monthly';

let configured = false;
let skippedInExpoGo = false;

function iosApiKey(): string {
  return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() ?? '';
}

function androidApiKey(): string {
  return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() ?? '';
}

/** Expo Go には StoreKit / Play Billing がなく、appl_/goog_ キーは拒否される */
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export function isPurchasesAvailable(): boolean {
  if (Platform.OS === 'web' || isExpoGo()) return false;
  if (Platform.OS === 'ios') return iosApiKey().length > 0;
  if (Platform.OS === 'android') return androidApiKey().length > 0;
  return false;
}

/**
 * 開発ビルド / TestFlight / 本番で一度。
 * キー無し・Expo Go・web は no-op（LogBox の Invalid API key を出さない）。
 */
export async function configurePurchases(): Promise<void> {
  if (configured || Platform.OS === 'web') return;
  if (isExpoGo()) {
    if (__DEV__ && !skippedInExpoGo) {
      skippedInExpoGo = true;
      console.info(
        'Purchases: skipped in Expo Go (use a dev/TestFlight build, or RC Test Store key).',
      );
    }
    return;
  }
  const apiKey = Platform.OS === 'ios' ? iosApiKey() : androidApiKey();
  if (!apiKey) return;

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey });
    configured = true;
  } catch (err) {
    console.warn('Purchases.configure failed', err);
  }
}

/** Supabase user id を RevenueCat app_user_id に紐づける（Webhook 連携の前提） */
export async function identifyPurchasesUser(userId: string | null): Promise<void> {
  await configurePurchases();
  if (!configured) return;

  try {
    if (userId) {
      await Purchases.logIn(userId);
    } else {
      await Purchases.logOut();
    }
  } catch (err) {
    console.warn('Purchases identify failed', err);
  }
}

function packageForPlan(
  plan: PaywallPlanChoice,
  pkgs: PurchasesPackage[],
): PurchasesPackage | null {
  if (plan === 'annual') {
    const byType = pkgs.find((p) => p.packageType === 'ANNUAL');
    if (byType && !pIdLooksStudent(byType.product.identifier)) return byType;
  }
  if (plan === 'monthly') {
    const byType = pkgs.find((p) => p.packageType === 'MONTHLY');
    if (byType && !pIdLooksStudent(byType.product.identifier)) return byType;
  }

  const needles: string[] =
    plan === 'student_annual'
      ? ['student', 'annual']
      : plan === 'student_monthly'
        ? ['student', 'monthly']
        : plan === 'annual'
          ? ['annual']
          : ['monthly'];

  return (
    pkgs.find((p) => {
      const id = p.product.identifier.toLowerCase();
      if (needles.includes('student') && !id.includes('student')) return false;
      if (!needles.includes('student') && id.includes('student')) return false;
      return needles.every((n) => n === 'student' || id.includes(n));
    }) ?? null
  );
}

function pIdLooksStudent(id: string): boolean {
  return id.toLowerCase().includes('student');
}

export async function getPackageForPlan(
  plan: PaywallPlanChoice,
): Promise<PurchasesPackage | null> {
  await configurePurchases();
  if (!configured) return null;

  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return null;
  return packageForPlan(plan, current.availablePackages);
}

/** ペイウォール表示用。価格文字列は Store / RevenueCat から取得（ハードコードしない） */
export type PaywallDisplayPrices = {
  monthly: string | null;
  annual: string | null;
  /** 年額を月換算した目安（計算できるときだけ） */
  annualPerMonthHint: string | null;
};

export async function getPaywallDisplayPrices(): Promise<PaywallDisplayPrices> {
  const empty: PaywallDisplayPrices = {
    monthly: null,
    annual: null,
    annualPerMonthHint: null,
  };
  await configurePurchases();
  if (!configured) return empty;

  try {
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings.current?.availablePackages ?? [];
    const monthlyPkg = packageForPlan('monthly', pkgs);
    const annualPkg = packageForPlan('annual', pkgs);

    let annualPerMonthHint: string | null = null;
    const annualPrice = annualPkg?.product.price;
    if (typeof annualPrice === 'number' && annualPrice > 0) {
      const per = annualPrice / 12;
      try {
        annualPerMonthHint = new Intl.NumberFormat('ja-JP', {
          style: 'currency',
          currency: annualPkg?.product.currencyCode ?? 'JPY',
          maximumFractionDigits: 0,
        }).format(per);
      } catch {
        annualPerMonthHint = `¥${Math.round(per).toLocaleString('ja-JP')}`;
      }
    }

    return {
      monthly: monthlyPkg?.product.priceString ?? null,
      annual: annualPkg?.product.priceString ?? null,
      annualPerMonthHint,
    };
  } catch (err) {
    console.warn('getPaywallDisplayPrices failed', err);
    return empty;
  }
}

export type PurchaseResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; message: string };

export async function purchasePlan(plan: PaywallPlanChoice): Promise<PurchaseResult> {
  await configurePurchases();
  if (!configured) {
    return {
      ok: false,
      cancelled: false,
      message: '課金の準備ができていません。しばらくしてから再度お試しください。',
    };
  }

  try {
    const pkg = await getPackageForPlan(plan);
    if (!pkg) {
      return {
        ok: false,
        cancelled: false,
        message: 'プラン情報を取得できませんでした。',
      };
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = Boolean(customerInfo.entitlements.active[RC_ENTITLEMENT_PRO]);
    if (!active) {
      return {
        ok: false,
        cancelled: false,
        message: '購入は完了しましたが、反映に時間がかかっています。復元を試すか、少し待ってください。',
      };
    }
    return { ok: true };
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as { code: string }).code
        : undefined;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { ok: false, cancelled: true, message: '' };
    }
    const message =
      err instanceof Error ? err.message : '購入に失敗しました';
    return { ok: false, cancelled: false, message };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  await configurePurchases();
  if (!configured) {
    return {
      ok: false,
      cancelled: false,
      message: '課金の準備ができていません。',
    };
  }

  try {
    const info = await Purchases.restorePurchases();
    const active = Boolean(info.entitlements.active[RC_ENTITLEMENT_PRO]);
    if (!active) {
      return {
        ok: false,
        cancelled: false,
        message: '復元できる購入が見つかりませんでした。',
      };
    }
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '復元に失敗しました';
    return { ok: false, cancelled: false, message };
  }
}

/** Webhook 反映待ち。check が true を返したら成功 */
export async function waitForSubscribed(
  check: () => Promise<boolean>,
  attempts = 8,
  delayMs = 750,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return check();
}

export type ManageSubscriptionsResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * OS の購読管理画面を開く（解約・支払い方法の変更）。
 * iOS: StoreKit シート（失敗時は App Store URL）。
 * Android: Play の購読一覧 URL。
 */
export async function openManageSubscriptions(): Promise<ManageSubscriptionsResult> {
  if (Platform.OS === 'web') {
    return {
      ok: false,
      message: '購読の管理は App Store または Google Play のアプリから行えます。',
    };
  }

  await configurePurchases();

  if (Platform.OS === 'ios' && configured) {
    try {
      await Purchases.showManageSubscriptions();
      return { ok: true };
    } catch (err) {
      console.warn('showManageSubscriptions failed, falling back to URL', err);
    }
  }

  const url =
    Platform.OS === 'android'
      ? ANDROID_MANAGE_SUBSCRIPTIONS_URL
      : IOS_MANAGE_SUBSCRIPTIONS_URL;

  try {
    await Linking.openURL(url);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'ストアの購読画面を開けませんでした',
    };
  }
}
