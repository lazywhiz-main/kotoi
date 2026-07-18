/** 今日の問い — クライアント用（JST 日付・ラベル） */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type RecallRhythm = 'off' | 'daily' | 'weekdays' | 'weekly';

export const RECALL_RHYTHM_OPTIONS: { id: RecallRhythm; label: string }[] = [
  { id: 'off', label: 'オフ' },
  { id: 'weekly', label: '週1' },
  { id: 'weekdays', label: '平日' },
  { id: 'daily', label: '毎日' },
];

export const WEEKDAY_OPTIONS = [
  { value: 0, label: '日' },
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' },
] as const;

/** 設定UI用の届く時刻（JST）。一覧外の値が保存されていれば呼び出し側で足す */
export const RECALL_HOUR_OPTIONS = [6, 7, 8, 9, 10, 12, 18, 21] as const;

export function recallHourChipOptions(currentHour?: number): number[] {
  const set = new Set<number>(RECALL_HOUR_OPTIONS);
  if (currentHour != null && currentHour >= 0 && currentHour <= 23) {
    set.add(currentHour);
  }
  return [...set].sort((a, b) => a - b);
}

export function recallHourLabel(hour: number): string {
  return `${hour}:00`;
}

/** 棚のオン誘導カードをスキップしたか（端末ローカル） */
const enableSkippedKey = (userId: string) =>
  `kotoi_daily_question_enable_skipped_${userId}`;

export async function isDailyQuestionEnableSkipped(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(enableSkippedKey(userId))) === '1';
}

export async function markDailyQuestionEnableSkipped(userId: string): Promise<void> {
  await AsyncStorage.setItem(enableSkippedKey(userId), '1');
}

export async function clearDailyQuestionEnableSkipped(userId: string): Promise<void> {
  await AsyncStorage.removeItem(enableSkippedKey(userId));
}

export type DailyQuestionStatus = 'active' | 'saved' | 'dismissed' | 'expired';

export type DailyQuestionDelivery = {
  id: string;
  user_id: string;
  question_type: 'dig' | 'con' | 'ref' | 'act' | 'exp';
  body: string;
  why_now: string | null;
  anchor_note_id: string;
  anchor_question_id: string | null;
  status: DailyQuestionStatus;
  delivered_on: string;
  saved_thread_item_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Asia/Tokyo の YYYY-MM-DD */
export function tokyoDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function recallRhythmLabel(rhythm: RecallRhythm): string {
  return RECALL_RHYTHM_OPTIONS.find((o) => o.id === rhythm)?.label ?? rhythm;
}
