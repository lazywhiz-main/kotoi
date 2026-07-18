import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { callAnthropicJsonWithUsage } from './anthropic.ts';
import {
  GENERATE_FEELING_QUESTION_RETRY_SYSTEM,
  GENERATE_INITIAL_QUESTION_SYSTEM,
  GENERATE_MORE_QUESTION_SYSTEM,
  SUMMARIZE_SYSTEM,
  VIDEO_FALLBACK_QUESTIONS_SYSTEM,
} from './prompts.ts';
import {
  generateMoreQuestionResultSchema,
  generateQuestionsResultSchema,
  summarizeResultSchema,
  type GenerateQuestionsResult,
  type SummarizeResult,
} from './schemas.ts';
import { articleBodyForAi } from './articleBody.ts';
import { recordUsage } from './usageLedger.ts';
import { AI_TRANSCRIPT_CHARS } from './youtubeTranscript.ts';

type NoteRow = {
  id: string;
  user_id: string;
  raw_text: string;
  type: string | null;
  is_video: boolean;
  source_url: string | null;
  source_title: string | null;
  video_title: string | null;
  video_transcript: string | null;
  transcript_status: string | null;
  article_body?: string | null;
  article_status?: string | null;
};

function transcriptForAi(note: NoteRow): string | undefined {
  const text = note.video_transcript?.trim();
  if (!text) return undefined;
  if (text.length <= AI_TRANSCRIPT_CHARS) return text;
  return `${text.slice(0, AI_TRANSCRIPT_CHARS)}\n…（以下省略）`;
}

function summarizePendingLabel(note: NoteRow): string {
  if (note.is_video && note.video_transcript) return '文字起こし要約中…';
  if (note.article_body?.trim()) return '記事要約中…';
  if (note.article_status === 'pending') return '記事を読み取り中…';
  return '要約中…';
}

export function formatSummaryBody(result: SummarizeResult): string {
  const points = result.key_points.map((p) => `・${p}`).join('\n');
  return `${result.summary}\n\n${points}`;
}

export async function runSummarizeNote(
  db: SupabaseClient,
  note: NoteRow,
): Promise<string | null> {
  const { data: pending, error: insertError } = await db
    .from('thread_items')
    .insert({
      note_id: note.id,
      user_id: note.user_id,
      author: 'ai',
      kind: 'summary',
      body: summarizePendingLabel(note),
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !pending) throw insertError ?? new Error('Failed to create summary item');

  try {
    const { data: result, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      SUMMARIZE_SYSTEM,
      JSON.stringify({
        raw_text: note.raw_text,
        video_transcript: transcriptForAi(note),
        article_body: articleBodyForAi(note.article_body),
        source_url: note.source_url ?? undefined,
        source_title: note.source_title ?? note.video_title ?? undefined,
      }),
      summarizeResultSchema,
    );

    const body = formatSummaryBody(result);
    await db
      .from('thread_items')
      .update({ body, status: 'done' })
      .eq('id', pending.id);

    await recordUsage(db, note.user_id, 'summarize-note', inputTokens, outputTokens);
    return body;
  } catch (err) {
    await db
      .from('thread_items')
      .update({ body: '要約に失敗しました。', status: 'error' })
      .eq('id', pending.id);
    throw err;
  }
}

async function loadRecentMemos(db: SupabaseClient, note: NoteRow) {
  const { data: recentMemos } = await db
    .from('notes')
    .select('id, raw_text')
    .eq('user_id', note.user_id)
    .neq('id', note.id)
    .order('created_at', { ascending: false })
    .limit(5);

  return (recentMemos ?? []).map((m) => ({
    id: m.id,
    raw_text: m.raw_text.slice(0, 200),
  }));
}

async function countThreadQuestions(db: SupabaseClient, noteId: string): Promise<number> {
  const { count } = await db
    .from('thread_items')
    .select('id', { count: 'exact', head: true })
    .eq('note_id', noteId)
    .eq('kind', 'question')
    .neq('status', 'pending');

  return count ?? 0;
}

async function insertPendingQuestion(
  db: SupabaseClient,
  note: NoteRow,
): Promise<string> {
  const { data: pending, error } = await db
    .from('thread_items')
    .insert({
      note_id: note.id,
      user_id: note.user_id,
      author: 'ai',
      kind: 'question',
      question_type: 'dig',
      body: '問いを生成中…',
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !pending) throw error ?? new Error('Failed to create pending question');
  return pending.id;
}

async function loadThreadQuestions(db: SupabaseClient, noteId: string) {
  const { data } = await db
    .from('thread_items')
    .select('id, body, question_type')
    .eq('note_id', noteId)
    .eq('kind', 'question')
    .order('created_at', { ascending: true });

  return data ?? [];
}

async function loadThoughtsByQuestion(db: SupabaseClient, noteId: string, questionIds: string[]) {
  if (questionIds.length === 0) return new Map<string, string[]>();

  const { data } = await db
    .from('thread_items')
    .select('parent_item_id, body')
    .eq('note_id', noteId)
    .eq('kind', 'note')
    .eq('author', 'user')
    .in('parent_item_id', questionIds)
    .order('created_at', { ascending: true });

  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (!row.parent_item_id) continue;
    const list = map.get(row.parent_item_id) ?? [];
    list.push(row.body);
    map.set(row.parent_item_id, list);
  }
  return map;
}

async function insertQuestions(
  db: SupabaseClient,
  note: NoteRow,
  questions: { question_type: string; body: string }[],
): Promise<void> {
  if (questions.length === 0) return;

  const rows = questions.map((q) => ({
    note_id: note.id,
    user_id: note.user_id,
    author: 'ai' as const,
    kind: 'question' as const,
    question_type: q.question_type,
    body: q.body,
    status: 'done' as const,
  }));

  const { error } = await db.from('thread_items').insert(rows);
  if (error) throw error;
}

export async function runGenerateQuestions(
  db: SupabaseClient,
  note: NoteRow,
  summary?: string | null,
  pendingItemId?: string | null,
): Promise<GenerateQuestionsResult> {
  if (note.type === 'task' || note.type === 'ref') {
    if (pendingItemId) {
      await db.from('thread_items').delete().eq('id', pendingItemId);
    }
    return { questions: [] };
  }

  const existingCount = await countThreadQuestions(db, note.id);
  if (existingCount > 0) {
    if (pendingItemId) {
      await db.from('thread_items').delete().eq('id', pendingItemId);
    }
    return { questions: [] };
  }

  const pendingId = pendingItemId ?? (await insertPendingQuestion(db, note));

  try {
    const recentMemos = await loadRecentMemos(db, note);
    const userPayload = JSON.stringify({
      raw_text: note.raw_text,
      summary: summary ?? undefined,
      type: note.type,
      recent_memos: recentMemos,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    const first = await callAnthropicJsonWithUsage(
      GENERATE_INITIAL_QUESTION_SYSTEM,
      userPayload,
      generateQuestionsResultSchema,
    );
    inputTokens += first.inputTokens;
    outputTokens += first.outputTokens;

    let questions =
      note.type === 'feeling'
        ? first.data.questions.filter((q) => q.question_type !== 'ref').slice(0, 1)
        : first.data.questions.slice(0, 1);

    // feeling: 反証(ref)だけ返ってフィルタで空になったときは、ref禁止で1回だけ再試行
    if (note.type === 'feeling' && questions.length === 0) {
      const retry = await callAnthropicJsonWithUsage(
        GENERATE_FEELING_QUESTION_RETRY_SYSTEM,
        userPayload,
        generateQuestionsResultSchema,
      );
      inputTokens += retry.inputTokens;
      outputTokens += retry.outputTokens;
      questions = retry.data.questions
        .filter((q) => q.question_type !== 'ref')
        .slice(0, 1);
    }

    const result = { questions };

    if (result.questions.length === 0) {
      await db.from('thread_items').delete().eq('id', pendingId);
    } else {
      const [firstQ, ...rest] = result.questions;
      await db
        .from('thread_items')
        .update({
          body: firstQ.body,
          question_type: firstQ.question_type,
          status: 'done',
        })
        .eq('id', pendingId);
      await insertQuestions(db, note, rest);
    }

    if (inputTokens > 0 || outputTokens > 0) {
      await recordUsage(db, note.user_id, 'generate-questions', inputTokens, outputTokens);
    }
    return result;
  } catch (err) {
    await db
      .from('thread_items')
      .update({ body: '問いの生成に失敗しました。', status: 'error' })
      .eq('id', pendingId);
    throw err;
  }
}

async function countDoneQuestions(db: SupabaseClient, noteId: string): Promise<number> {
  const { count } = await db
    .from('thread_items')
    .select('id', { count: 'exact', head: true })
    .eq('note_id', noteId)
    .eq('kind', 'question')
    .eq('status', 'done');
  return count ?? 0;
}

/** feeling の問い上限（クライアント lib/feelingQuestions.ts と同値） */
const FEELING_MAX_QUESTIONS = 3;

export async function runGenerateMoreQuestion(
  db: SupabaseClient,
  note: NoteRow,
  summary?: string | null,
): Promise<GenerateQuestionsResult> {
  if (note.type === 'task' || note.type === 'ref') {
    return { questions: [] };
  }

  if (note.type === 'feeling') {
    const doneCount = await countDoneQuestions(db, note.id);
    if (doneCount >= FEELING_MAX_QUESTIONS) {
      return { questions: [] };
    }
  }

  const existingQuestions = await loadThreadQuestions(db, note.id);
  const thoughtsByQuestion = await loadThoughtsByQuestion(
    db,
    note.id,
    existingQuestions.map((q) => q.id),
  );

  const userPayload = JSON.stringify({
    raw_text: note.raw_text,
    summary: summary ?? undefined,
    type: note.type,
    existing_questions: existingQuestions.map((q) => ({
      question_type: q.question_type,
      body: q.body,
      user_thoughts: thoughtsByQuestion.get(q.id) ?? [],
    })),
  });

  let inputTokens = 0;
  let outputTokens = 0;

  const first = await callAnthropicJsonWithUsage(
    GENERATE_MORE_QUESTION_SYSTEM,
    userPayload,
    generateMoreQuestionResultSchema,
  );
  inputTokens += first.inputTokens;
  outputTokens += first.outputTokens;

  let question = first.data.question ?? null;
  if (note.type === 'feeling' && question?.question_type === 'ref') {
    question = null;
  }

  if (note.type === 'feeling' && !question) {
    const retry = await callAnthropicJsonWithUsage(
      GENERATE_FEELING_QUESTION_RETRY_SYSTEM,
      userPayload,
      generateQuestionsResultSchema,
    );
    inputTokens += retry.inputTokens;
    outputTokens += retry.outputTokens;
    const picked = retry.data.questions
      .filter((q) => q.question_type !== 'ref')
      .slice(0, 1)[0];
    question = picked ?? null;
  }

  if (!question) {
    return { questions: [] };
  }

  await insertQuestions(db, note, [question]);
  if (inputTokens > 0 || outputTokens > 0) {
    await recordUsage(db, note.user_id, 'generate-questions-more', inputTokens, outputTokens);
  }
  return { questions: [question] };
}

export async function runGenerateVideoFallbackQuestions(
  db: SupabaseClient,
  note: NoteRow,
  pendingItemId?: string | null,
): Promise<GenerateQuestionsResult> {
  if (note.type === 'task' || note.type === 'ref') {
    if (pendingItemId) {
      await db.from('thread_items').delete().eq('id', pendingItemId);
    }
    return { questions: [] };
  }

  const existingCount = await countThreadQuestions(db, note.id);
  if (existingCount > 0) {
    if (pendingItemId) {
      await db.from('thread_items').delete().eq('id', pendingItemId);
    }
    return { questions: [] };
  }

  const pendingId = pendingItemId ?? (await insertPendingQuestion(db, note));

  try {
    const { data: result, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      VIDEO_FALLBACK_QUESTIONS_SYSTEM,
      JSON.stringify({
        raw_text: note.raw_text,
        title: note.source_title ?? note.video_title ?? undefined,
        source_url: note.source_url ?? undefined,
        type: note.type,
      }),
      generateQuestionsResultSchema,
    );

    const questions = result.questions.slice(0, 1);
    if (questions.length === 0) {
      await db.from('thread_items').delete().eq('id', pendingId);
    } else {
      const [first, ...rest] = questions;
      await db
        .from('thread_items')
        .update({
          body: first.body,
          question_type: first.question_type,
          status: 'done',
        })
        .eq('id', pendingId);
      await insertQuestions(db, note, rest);
    }

    if (inputTokens > 0 || outputTokens > 0) {
      await recordUsage(
        db,
        note.user_id,
        'generate-questions-video-fallback',
        inputTokens,
        outputTokens,
      );
    }
    return { questions };
  } catch (err) {
    await db
      .from('thread_items')
      .update({ body: '問いの生成に失敗しました。', status: 'error' })
      .eq('id', pendingId);
    throw err;
  }
}
