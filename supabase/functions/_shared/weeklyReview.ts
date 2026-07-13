import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { callAnthropicJsonWithUsage } from './anthropic.ts';
import { WEEKLY_REVIEW_SYSTEM } from './prompts.ts';
import { weeklyReviewAiSchema } from './schemas.ts';
import { recordUsage } from './usageLedger.ts';
import { sendPushToUser } from './pushNotify.ts';

type QuestionRow = {
  id: string;
  note_id: string;
  question_type: string;
  body: string;
  created_at: string;
  weeks_ago?: number;
};

type NoteRow = {
  id: string;
  raw_text: string;
  type: string | null;
  created_at: string;
};

type ExplorationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type LatestReviewRow = {
  id: string;
  period_start: string;
  period_end: string;
  period_label: string;
  stats: {
    new_notes: number;
    new_questions: number;
    answered_questions: number;
    new_explorations: number;
  };
  recurring_theme: string;
  hottest_question_id: string | null;
  hottest_question_note_id: string | null;
  hottest_question_body: string | null;
  hottest_question_type: string | null;
  recall_question_id: string | null;
  recall_question_note_id: string | null;
  recall_prompt: string | null;
  recall_weeks_ago: number | null;
  exploration_id: string | null;
  activity_watermark: string;
  generated_at: string;
};

export type WeeklyReviewResponse = {
  id: string;
  period_start: string;
  period_end: string;
  week_label: string;
  generated_at: string;
  stats: {
    new_notes: number;
    new_questions: number;
    answered_questions: number;
    new_explorations: number;
  };
  recurring_theme: string;
  hottest_question: {
    id: string;
    note_id: string;
    body: string;
    question_type: string;
  } | null;
  recall: {
    id: string;
    note_id: string;
    body: string;
    weeks_ago: number;
    prompt: string;
  } | null;
  exploration_id: string | null;
};

export type GenerateWeeklyReviewResult = {
  status: 'generated' | 'cooldown';
  review: WeeklyReviewResponse;
  next_eligible_at: string | null;
  days_remaining: number;
};

const JST = 'Asia/Tokyo';
const COOLDOWN_DAYS = 7;
const MAX_PERIOD_DAYS = 7;
const MS_DAY = 24 * 60 * 60 * 1000;
const MAX_NOTE_SNIPPET = 100;
const MAX_QUESTION_BODY = 160;

function startOfDayJst(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return new Date(`${year}-${month}-${day}T00:00:00+09:00`);
}

function formatJstMonthDay(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

function weeksAgoFromNow(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const diffMs = Date.now() - created;
  return Math.max(1, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

function mapReviewRow(row: LatestReviewRow): WeeklyReviewResponse {
  return {
    id: row.id,
    period_start: row.period_start,
    period_end: row.period_end,
    week_label: row.period_label,
    generated_at: row.generated_at,
    stats: row.stats,
    recurring_theme: row.recurring_theme,
    hottest_question:
      row.hottest_question_id &&
        row.hottest_question_note_id &&
        row.hottest_question_body &&
        row.hottest_question_type
        ? {
          id: row.hottest_question_id,
          note_id: row.hottest_question_note_id,
          body: row.hottest_question_body,
          question_type: row.hottest_question_type,
        }
        : null,
    recall:
      row.recall_question_id && row.recall_question_note_id && row.recall_prompt
        ? {
          id: row.recall_question_id,
          note_id: row.recall_question_note_id,
          body: row.recall_prompt,
          weeks_ago: row.recall_weeks_ago ?? 1,
          prompt: row.recall_prompt,
        }
        : null,
    exploration_id: row.exploration_id,
  };
}

async function getLatestReviewRow(
  db: SupabaseClient,
  userId: string,
): Promise<LatestReviewRow | null> {
  const { data, error } = await db
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as LatestReviewRow | null) ?? null;
}

function getCooldown(lastReview: LatestReviewRow | null): {
  eligible: boolean;
  nextEligibleAt: string | null;
  daysRemaining: number;
} {
  if (!lastReview) {
    return { eligible: true, nextEligibleAt: null, daysRemaining: 0 };
  }

  const nextEligible = new Date(
    new Date(lastReview.generated_at).getTime() + COOLDOWN_DAYS * MS_DAY,
  );
  if (Date.now() >= nextEligible.getTime()) {
    return { eligible: true, nextEligibleAt: null, daysRemaining: 0 };
  }

  const daysRemaining = Math.ceil((nextEligible.getTime() - Date.now()) / MS_DAY);
  return {
    eligible: false,
    nextEligibleAt: nextEligible.toISOString(),
    daysRemaining,
  };
}

function resolvePeriod(
  lastReview: LatestReviewRow | null,
  now = new Date(),
): { periodStart: Date; periodEnd: Date; periodLabel: string } {
  const periodEnd = now;
  let periodStart: Date;

  if (!lastReview) {
    periodStart = new Date(startOfDayJst(now).getTime() - (MAX_PERIOD_DAYS - 1) * MS_DAY);
  } else {
    periodStart = new Date(lastReview.period_end);
    const maxStart = new Date(periodEnd.getTime() - MAX_PERIOD_DAYS * MS_DAY);
    if (periodStart.getTime() < maxStart.getTime()) {
      periodStart = maxStart;
    }
  }

  const periodLabel =
    `${formatJstMonthDay(periodStart)}〜${formatJstMonthDay(startOfDayJst(periodEnd))}`;

  return { periodStart, periodEnd, periodLabel };
}

async function computeActivityWatermark(
  db: SupabaseClient,
  userId: string,
): Promise<string> {
  const [
    { data: noteRow },
    { data: itemCreatedRow },
    { data: itemAnsweredRow },
    { data: explorationRow },
  ] = await Promise.all([
    db
      .from('notes')
      .select('updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('thread_items')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('thread_items')
      .select('answered_at')
      .eq('user_id', userId)
      .eq('answered', true)
      .not('answered_at', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('explorations')
      .select('updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const timestamps = [
    noteRow?.updated_at,
    itemCreatedRow?.created_at,
    itemAnsweredRow?.answered_at,
    explorationRow?.updated_at,
  ].filter((value): value is string => !!value);

  if (timestamps.length === 0) {
    return new Date(0).toISOString();
  }

  const maxMs = Math.max(...timestamps.map((value) => new Date(value).getTime()));
  return new Date(maxMs).toISOString();
}

function fallbackRecurringTheme(
  notes: NoteRow[],
  explorations: ExplorationRow[],
): string {
  if (explorations.length > 0) {
    return `「${explorations[0].title}」。この期間に立ち上がった探究の方向に、問いが集まっています。`;
  }
  if (notes.length > 0) {
    const snippet = notes[0].raw_text.trim().slice(0, 24);
    return snippet
      ? `「${snippet}${notes[0].raw_text.length > 24 ? '…' : ''}」など、${notes.length}件のメモが残りました。`
      : `この期間に${notes.length}件のメモが残りました。`;
  }
  return 'この期間はまだメモが少ないようです。放り込むと、ここにテーマが見えてきます。';
}

function buildRecallPrompt(question: QuestionRow): string {
  const weeks = question.weeks_ago ?? weeksAgoFromNow(question.created_at);
  return `${weeks}週間前の問い「${question.body}」——まだ生きてる？`;
}

export async function generateWeeklyReview(
  db: SupabaseClient,
  userId: string,
): Promise<GenerateWeeklyReviewResult> {
  const lastReview = await getLatestReviewRow(db, userId);
  const cooldown = getCooldown(lastReview);

  if (!cooldown.eligible && lastReview) {
    return {
      status: 'cooldown',
      review: mapReviewRow(lastReview),
      next_eligible_at: cooldown.nextEligibleAt,
      days_remaining: cooldown.daysRemaining,
    };
  }

  const { periodStart, periodEnd, periodLabel } = resolvePeriod(lastReview);
  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  const recallStart = new Date(Date.now() - 35 * MS_DAY).toISOString();
  const recallEnd = new Date(Date.now() - 10 * MS_DAY).toISOString();

  const [
    { count: newNotes },
    { count: newQuestions },
    { count: answeredQuestions },
    { count: newExplorations },
    { data: periodNotes },
    { data: periodExplorations },
    { data: openQuestions },
    { data: recallCandidates },
    { data: latestExploration },
  ] = await Promise.all([
    db
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso),
    db
      .from('thread_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'question')
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso),
    db
      .from('thread_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'question')
      .eq('answered', true)
      .gte('answered_at', periodStartIso)
      .lte('answered_at', periodEndIso),
    db
      .from('explorations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso),
    db
      .from('notes')
      .select('id, raw_text, type, created_at')
      .eq('user_id', userId)
      .gte('created_at', periodStartIso)
      .lte('created_at', periodEndIso)
      .order('created_at', { ascending: false })
      .limit(12),
    db
      .from('explorations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', userId)
      .gte('updated_at', periodStartIso)
      .lte('updated_at', periodEndIso)
      .order('updated_at', { ascending: false })
      .limit(5),
    db
      .from('thread_items')
      .select('id, note_id, question_type, body, created_at')
      .eq('user_id', userId)
      .eq('kind', 'question')
      .eq('answered', false)
      .not('question_type', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from('thread_items')
      .select('id, note_id, question_type, body, created_at')
      .eq('user_id', userId)
      .eq('kind', 'question')
      .eq('answered', false)
      .not('question_type', 'is', null)
      .gte('created_at', recallStart)
      .lte('created_at', recallEnd)
      .order('created_at', { ascending: true })
      .limit(8),
    db
      .from('explorations')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const stats = {
    new_notes: newNotes ?? 0,
    new_questions: newQuestions ?? 0,
    answered_questions: answeredQuestions ?? 0,
    new_explorations: newExplorations ?? 0,
  };

  const notes = (periodNotes ?? []) as NoteRow[];
  const explorations = (periodExplorations ?? []) as ExplorationRow[];
  const open = (openQuestions ?? []) as QuestionRow[];
  const recallPool = ((recallCandidates ?? []) as QuestionRow[]).map((row) => ({
    ...row,
    weeks_ago: weeksAgoFromNow(row.created_at),
  }));

  let recurringTheme = fallbackRecurringTheme(notes, explorations);
  let hottestId: string | null = open[0]?.id ?? null;
  let recallId: string | null = recallPool[0]?.id ?? null;
  let recallPrompt: string | null = recallPool[0] ? buildRecallPrompt(recallPool[0]) : null;

  const hasAiInput = notes.length > 0 || open.length > 0 || recallPool.length > 0;
  if (hasAiInput) {
    const payload = {
      stats,
      week_notes: notes.map((note) => ({
        id: note.id,
        type: note.type,
        raw_text: note.raw_text.slice(0, MAX_NOTE_SNIPPET),
      })),
      week_explorations: explorations.map((row) => ({
        id: row.id,
        title: row.title,
      })),
      open_questions: open.map((row) => ({
        id: row.id,
        question_type: row.question_type,
        body: row.body.slice(0, MAX_QUESTION_BODY),
      })),
      recall_candidates: recallPool.map((row) => ({
        id: row.id,
        weeks_ago: row.weeks_ago,
        question_type: row.question_type,
        body: row.body.slice(0, MAX_QUESTION_BODY),
      })),
    };

    const { data: ai, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      WEEKLY_REVIEW_SYSTEM,
      JSON.stringify(payload),
      weeklyReviewAiSchema,
      { maxTokens: 1024 },
    );

    await recordUsage(db, userId, 'weekly-review', inputTokens, outputTokens);

    recurringTheme = ai.recurring_theme.trim() || recurringTheme;

    const openIds = new Set(open.map((row) => row.id));
    if (ai.hottest_question_id && openIds.has(ai.hottest_question_id)) {
      hottestId = ai.hottest_question_id;
    }

    const recallIds = new Set(recallPool.map((row) => row.id));
    if (ai.recall_question_id && recallIds.has(ai.recall_question_id)) {
      recallId = ai.recall_question_id;
      recallPrompt = ai.recall_prompt?.trim() || buildRecallPrompt(
        recallPool.find((row) => row.id === ai.recall_question_id)!,
      );
    }
  }

  const hottest = hottestId ? open.find((row) => row.id === hottestId) ?? null : null;
  const recallRow = recallId ? recallPool.find((row) => row.id === recallId) ?? null : null;
  const activityWatermark = await computeActivityWatermark(db, userId);

  const { data: inserted, error: insertError } = await db
    .from('weekly_reviews')
    .insert({
      user_id: userId,
      period_start: periodStartIso,
      period_end: periodEndIso,
      period_label: periodLabel,
      stats,
      recurring_theme: recurringTheme,
      hottest_question_id: hottest?.id ?? null,
      hottest_question_note_id: hottest?.note_id ?? null,
      hottest_question_body: hottest?.body ?? null,
      hottest_question_type: hottest?.question_type ?? null,
      recall_question_id: recallRow?.id ?? null,
      recall_question_note_id: recallRow?.note_id ?? null,
      recall_prompt: recallPrompt,
      recall_weeks_ago: recallRow?.weeks_ago ?? null,
      exploration_id: latestExploration?.id ?? null,
      activity_watermark: activityWatermark,
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    throw insertError ?? new Error('Failed to insert weekly review');
  }

  await sendPushToUser(
    db,
    userId,
    {
      title: '今週のふりかえりができました',
      body: periodLabel,
    },
    'notify_weekly_review',
  );

  return {
    status: 'generated',
    review: mapReviewRow(inserted as LatestReviewRow),
    next_eligible_at: new Date(
      new Date((inserted as LatestReviewRow).generated_at).getTime() + COOLDOWN_DAYS * MS_DAY,
    ).toISOString(),
    days_remaining: COOLDOWN_DAYS,
  };
}
