import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { callAnthropicJsonWithUsage } from './anthropic.ts';
import { assertWritableEntitlement } from './entitlements.ts';
import { DAILY_QUESTION_SYSTEM } from './prompts.ts';
import { dailyQuestionResultSchema } from './schemas.ts';
import { sendPushToUser } from './pushNotify.ts';
import { checkCostBudget, recordUsage, tokyoDayKey } from './usageLedger.ts';

export type RecallRhythm = 'off' | 'daily' | 'weekdays' | 'weekly';

export type DailyQuestionDeliveryRow = {
  id: string;
  user_id: string;
  question_type: string;
  body: string;
  why_now: string | null;
  anchor_note_id: string;
  anchor_question_id: string | null;
  status: string;
  delivered_on: string;
  saved_thread_item_id: string | null;
  created_at: string;
  updated_at: string;
};

const ESTIMATED_DAILY_QUESTION_COST_USD = 0.015;
const DISMISS_COOLDOWN_DAYS = 3;
const DISMISS_COOLDOWN_COUNT = 3;
const MATERIALS_DAYS = 30;

function getTokyoWeekday(date: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

function getTokyoHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  return Number(hour ?? 0);
}

export function rhythmMatchesToday(
  rhythm: RecallRhythm,
  recallWeekday: number,
  date = new Date(),
): boolean {
  if (rhythm === 'off') return false;
  if (rhythm === 'daily') return true;
  const dow = getTokyoWeekday(date);
  if (rhythm === 'weekdays') return dow >= 1 && dow <= 5;
  if (rhythm === 'weekly') return dow === recallWeekday;
  return false;
}

export function isRecallHourDue(recallHour: number, date = new Date()): boolean {
  return getTokyoHour(date) >= recallHour;
}

export async function expireStaleDeliveries(db: SupabaseClient, userId?: string): Promise<number> {
  const today = tokyoDayKey();
  let query = db
    .from('daily_question_deliveries')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('delivered_on', today);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query.select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

async function recentDismissCount(db: SupabaseClient, userId: string): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - DISMISS_COOLDOWN_DAYS);
  const sinceKey = tokyoDayKey(since);

  const { count, error } = await db
    .from('daily_question_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'dismissed')
    .gte('delivered_on', sinceKey);

  if (error) throw error;
  return count ?? 0;
}

async function gatherMaterials(db: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - MATERIALS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: openQuestions }, { data: notes }, { data: explorations }] = await Promise.all([
    db
      .from('thread_items')
      .select('id, note_id, question_type, body, created_at')
      .eq('user_id', userId)
      .eq('kind', 'question')
      .eq('answered', false)
      .not('question_type', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8),
    db
      .from('notes')
      .select('id, raw_text, type, is_video, video_title, created_at')
      .eq('user_id', userId)
      .in('type', ['seed', 'learn', 'feeling'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(8),
    db
      .from('explorations')
      .select('id, title, synthesis')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(3),
  ]);

  const open = openQuestions ?? [];
  const noteRows = notes ?? [];
  if (open.length === 0 && noteRows.length === 0) {
    return null;
  }

  return {
    open_questions: open.map((q) => ({
      id: q.id,
      note_id: q.note_id,
      question_type: q.question_type,
      body: q.body,
    })),
    notes: noteRows.map((n) => ({
      id: n.id,
      type: n.type,
      preview: (n.is_video && n.video_title
        ? n.video_title
        : n.raw_text.trim().slice(0, 120)) || 'メモ',
    })),
    explorations: (explorations ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      synthesis: e.synthesis?.slice(0, 200) ?? null,
    })),
    allowed_note_ids: [...new Set([...open.map((q) => q.note_id), ...noteRows.map((n) => n.id)])],
    allowed_question_ids: open.map((q) => q.id),
  };
}

async function validateAnchor(
  materials: NonNullable<Awaited<ReturnType<typeof gatherMaterials>>>,
  noteId: string,
  questionId: string | null,
): Promise<boolean> {
  if (!materials.allowed_note_ids.includes(noteId)) return false;
  if (questionId && !materials.allowed_question_ids.includes(questionId)) return false;
  return true;
}

export async function generateDailyQuestionForUser(
  db: SupabaseClient,
  userId: string,
  deliveredOn: string,
): Promise<DailyQuestionDeliveryRow | null> {
  const writable = await assertWritableEntitlement(db, userId);
  if (!writable.ok) return null;

  const materials = await gatherMaterials(db, userId);
  if (!materials) return null;

  if ((await recentDismissCount(db, userId)) >= DISMISS_COOLDOWN_COUNT) {
    return null;
  }

  const budget = await checkCostBudget(db, userId, ESTIMATED_DAILY_QUESTION_COST_USD);
  if (!budget.ok) return null;

  const { data: result, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
    DAILY_QUESTION_SYSTEM,
    JSON.stringify({ materials }),
    dailyQuestionResultSchema,
  );

  const anchorOk = await validateAnchor(
    materials,
    result.anchor.note_id,
    result.anchor.question_id,
  );
  if (!anchorOk) return null;

  const { data: inserted, error } = await db
    .from('daily_question_deliveries')
    .insert({
      user_id: userId,
      question_type: result.question_type,
      body: result.body.trim(),
      why_now: result.why_now.trim(),
      anchor_note_id: result.anchor.note_id,
      anchor_question_id: result.anchor.question_id,
      delivered_on: deliveredOn,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }

  await recordUsage(db, userId, 'generate-daily-question', inputTokens, outputTokens);
  return inserted as DailyQuestionDeliveryRow;
}

export async function getTodayDelivery(
  db: SupabaseClient,
  userId: string,
): Promise<DailyQuestionDeliveryRow | null> {
  const today = tokyoDayKey();
  const { data, error } = await db
    .from('daily_question_deliveries')
    .select('*')
    .eq('user_id', userId)
    .eq('delivered_on', today)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return (data as DailyQuestionDeliveryRow | null) ?? null;
}

export type UserRecallSettings = {
  recall_rhythm: RecallRhythm;
  recall_weekday: number;
  recall_hour: number;
  notify_daily_question: boolean;
};

export async function ensureTodayDelivery(
  db: SupabaseClient,
  userId: string,
  settings: UserRecallSettings,
): Promise<DailyQuestionDeliveryRow | null> {
  await expireStaleDeliveries(db, userId);

  const existing = await getTodayDelivery(db, userId);
  if (existing) return existing;

  if (settings.recall_rhythm === 'off') return null;
  if (!rhythmMatchesToday(settings.recall_rhythm, settings.recall_weekday)) return null;
  // プッシュ配信と同じく、設定時刻（JST）前は新規生成しない（既存の今日分は上で返す）
  if (!isRecallHourDue(settings.recall_hour)) return null;

  return await generateDailyQuestionForUser(db, userId, tokyoDayKey());
}

export async function saveDailyQuestion(
  db: SupabaseClient,
  userId: string,
  deliveryId: string,
): Promise<{ delivery: DailyQuestionDeliveryRow; thread_item_id: string }> {
  const { data: delivery, error } = await db
    .from('daily_question_deliveries')
    .select('*')
    .eq('id', deliveryId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error || !delivery) throw new Error('delivery_not_found');

  const row = delivery as DailyQuestionDeliveryRow;

  const { data: threadItem, error: insertError } = await db
    .from('thread_items')
    .insert({
      note_id: row.anchor_note_id,
      user_id: userId,
      author: 'ai',
      kind: 'question',
      question_type: row.question_type,
      body: row.body,
      parent_item_id: row.anchor_question_id,
      status: 'done',
      answered: false,
    })
    .select('id')
    .single();

  if (insertError || !threadItem) throw insertError ?? new Error('insert_failed');

  const { data: updated, error: updateError } = await db
    .from('daily_question_deliveries')
    .update({
      status: 'saved',
      saved_thread_item_id: threadItem.id,
    })
    .eq('id', deliveryId)
    .select('*')
    .single();

  if (updateError || !updated) throw updateError ?? new Error('update_failed');

  return {
    delivery: updated as DailyQuestionDeliveryRow,
    thread_item_id: threadItem.id as string,
  };
}

export async function dismissDailyQuestion(
  db: SupabaseClient,
  userId: string,
  deliveryId: string,
): Promise<DailyQuestionDeliveryRow> {
  const { data, error } = await db
    .from('daily_question_deliveries')
    .update({ status: 'dismissed' })
    .eq('id', deliveryId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .select('*')
    .single();

  if (error || !data) throw new Error('delivery_not_found');
  return data as DailyQuestionDeliveryRow;
}

export async function runScheduledDailyQuestions(
  db: SupabaseClient,
  options: { sendPush: boolean },
): Promise<{ expired: number; generated: number; pushed: number }> {
  const today = tokyoDayKey();
  const now = new Date();

  const expired = await expireStaleDeliveries(db);

  const { data: settingsRows, error } = await db
    .from('user_settings')
    .select('user_id, recall_rhythm, recall_weekday, recall_hour, notify_daily_question')
    .neq('recall_rhythm', 'off');

  if (error) throw error;

  let generated = 0;
  let pushed = 0;

  for (const settings of settingsRows ?? []) {
    const rhythm = settings.recall_rhythm as RecallRhythm;
    const weekday = settings.recall_weekday ?? 0;
    const hour = settings.recall_hour ?? 8;

    if (!rhythmMatchesToday(rhythm, weekday, now)) continue;
    if (!isRecallHourDue(hour, now)) continue;

    const userId = settings.user_id as string;
    const existing = await getTodayDelivery(db, userId);
    if (existing) continue;

    const delivery = await generateDailyQuestionForUser(db, userId, today);
    if (!delivery) continue;
    generated += 1;

    if (options.sendPush && settings.notify_daily_question !== false) {
      const preview =
        delivery.body.length > 48 ? `${delivery.body.slice(0, 48)}…` : delivery.body;
      await sendPushToUser(
        db,
        userId,
        {
          title: '今日の問い',
          body: preview,
          data: {
            screen: 'shelf',
            delivery_id: delivery.id,
          },
        },
        'notify_daily_question',
      );
      pushed += 1;
    }
  }

  return { expired, generated, pushed };
}
