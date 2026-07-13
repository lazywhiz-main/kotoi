import { listNodeLabel } from '@/lib/mapLabel';
import { getSupabase } from '@/lib/supabase';
import type {
  QuestionType,
  ReviewAccumulation,
  ReviewCooldown,
  WeeklyReviewResult,
  WeeklyReviewStats,
} from '@/lib/types';

const COOLDOWN_DAYS = 7;
const MS_DAY = 24 * 60 * 60 * 1000;
const PREVIEW_LIMIT = 3;

type WeeklyReviewRow = {
  id: string;
  period_start: string;
  period_end: string;
  period_label: string;
  stats: WeeklyReviewStats;
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
  generated_at: string;
};

export function mapWeeklyReviewRow(row: WeeklyReviewRow): WeeklyReviewResult {
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
          question_type: row.hottest_question_type as QuestionType,
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

export function getReviewCooldown(review: WeeklyReviewResult | null): ReviewCooldown {
  if (!review) {
    return { eligible: true, next_eligible_at: null, days_remaining: 0 };
  }

  const nextEligible = new Date(
    new Date(review.generated_at).getTime() + COOLDOWN_DAYS * MS_DAY,
  );
  if (Date.now() >= nextEligible.getTime()) {
    return { eligible: true, next_eligible_at: null, days_remaining: 0 };
  }

  return {
    eligible: false,
    next_eligible_at: nextEligible.toISOString(),
    days_remaining: Math.ceil((nextEligible.getTime() - Date.now()) / MS_DAY),
  };
}

export async function fetchWeeklyReviewHistory(
  userId: string,
  limit = 10,
): Promise<WeeklyReviewResult[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => mapWeeklyReviewRow(row as WeeklyReviewRow));
}

export async function fetchLatestWeeklyReview(
  userId: string,
): Promise<WeeklyReviewResult | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapWeeklyReviewRow(data as WeeklyReviewRow);
}

export async function fetchReviewAccumulation(
  userId: string,
  sinceAt: string,
): Promise<ReviewAccumulation> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase が未設定です。.env を確認してください。');
  }

  const sinceIso = new Date(sinceAt).toISOString();

  const [
    { count: newNotes },
    { count: newQuestions },
    { count: answeredQuestions },
    { count: explorationUpdates },
    { data: notes },
    { data: questions },
    { data: answered },
    { data: explorations },
  ] = await Promise.all([
    supabase
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', sinceIso),
    supabase
      .from('thread_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'question')
      .gt('created_at', sinceIso),
    supabase
      .from('thread_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'question')
      .eq('answered', true)
      .gt('answered_at', sinceIso),
    supabase
      .from('explorations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('updated_at', sinceIso),
    supabase
      .from('notes')
      .select('id, raw_text')
      .eq('user_id', userId)
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_LIMIT),
    supabase
      .from('thread_items')
      .select('id, note_id, question_type, body')
      .eq('user_id', userId)
      .eq('kind', 'question')
      .not('question_type', 'is', null)
      .eq('answered', false)
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_LIMIT),
    supabase
      .from('thread_items')
      .select('id, note_id, question_type, body')
      .eq('user_id', userId)
      .eq('kind', 'question')
      .eq('answered', true)
      .gt('answered_at', sinceIso)
      .order('answered_at', { ascending: false })
      .limit(PREVIEW_LIMIT),
    supabase
      .from('explorations')
      .select('id, title')
      .eq('user_id', userId)
      .gt('updated_at', sinceIso)
      .order('updated_at', { ascending: false })
      .limit(PREVIEW_LIMIT),
  ]);

  const stats: WeeklyReviewStats = {
    new_notes: newNotes ?? 0,
    new_questions: newQuestions ?? 0,
    answered_questions: answeredQuestions ?? 0,
    new_explorations: explorationUpdates ?? 0,
  };

  const hasActivity =
    stats.new_notes > 0 ||
    stats.new_questions > 0 ||
    stats.answered_questions > 0 ||
    stats.new_explorations > 0;

  return {
    since_at: sinceIso,
    stats,
    notes: (notes ?? []).map((note) => ({
      id: note.id as string,
      preview: listNodeLabel((note.raw_text as string) ?? ''),
    })),
    questions: (questions ?? []).map((row) => ({
      id: row.id as string,
      note_id: row.note_id as string,
      body: row.body as string,
      question_type: row.question_type as QuestionType,
    })),
    answered: (answered ?? []).map((row) => ({
      id: row.id as string,
      note_id: row.note_id as string,
      body: row.body as string,
      question_type: row.question_type as QuestionType,
    })),
    exploration_updates: (explorations ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
    })),
    has_activity: hasActivity,
  };
}

export function formatReviewDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(iso));
}
