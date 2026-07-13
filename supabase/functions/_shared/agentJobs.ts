import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { callAnthropicJsonWithUsage } from './anthropic.ts';
import {
  ASK_TURN_SYSTEM,
  DEEPDIVE_SYSTEM,
  NOTE_CONNECTION_SYSTEM,
  RESEARCH_SYSTEM,
} from './prompts.ts';
import {
  agentResultSchema,
  askTurnResultSchema,
  noteConnectionResultSchema,
} from './schemas.ts';
import { recordUsage } from './usageLedger.ts';
import { sendPushToUser } from './pushNotify.ts';

type NoteRow = {
  id: string;
  user_id: string;
  raw_text: string;
  type: string | null;
  source_title: string | null;
  video_title: string | null;
};

type ThreadContext = {
  note: NoteRow;
  parentItem?: { id: string; question_type: string | null; body: string; kind: string } | null;
  threadSnippet: string;
};

async function loadContext(
  db: SupabaseClient,
  noteId: string,
  userId: string,
  parentItemId?: string | null,
): Promise<ThreadContext> {
  const { data: note, error: noteError } = await db
    .from('notes')
    .select('id, user_id, raw_text, type, source_title, video_title')
    .eq('id', noteId)
    .eq('user_id', userId)
    .single();

  if (noteError || !note) throw new Error('Note not found');

  let parentItem = null;
  if (parentItemId) {
    const { data } = await db
      .from('thread_items')
      .select('id, question_type, body, kind')
      .eq('id', parentItemId)
      .eq('note_id', noteId)
      .single();
    parentItem = data;
  }

  const { data: items } = await db
    .from('thread_items')
    .select('author, kind, body')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })
    .limit(12);

  const threadSnippet = (items ?? [])
    .map((item) => `[${item.author}/${item.kind}] ${item.body.slice(0, 180)}`)
    .join('\n');

  return { note: note as NoteRow, parentItem, threadSnippet };
}

function buildAgentUserPayload(
  ctx: ThreadContext,
  prompt: string,
  mode: 'research' | 'deepdive',
) {
  return JSON.stringify({
    mode,
    prompt,
    note: {
      raw_text: ctx.note.raw_text,
      type: ctx.note.type,
      title: ctx.note.source_title ?? ctx.note.video_title ?? undefined,
    },
    parent_item: ctx.parentItem
      ? {
          question_type: ctx.parentItem.question_type,
          body: ctx.parentItem.body,
          kind: ctx.parentItem.kind,
        }
      : undefined,
    thread_snippet: ctx.threadSnippet,
  });
}

export async function executeResearch(
  db: SupabaseClient,
  params: {
    noteId: string;
    userId: string;
    requestItemId: string;
    resultItemId: string;
    prompt: string;
    parentItemId?: string | null;
  },
): Promise<void> {
  const ctx = await loadContext(db, params.noteId, params.userId, params.parentItemId);

  try {
    const { data, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      RESEARCH_SYSTEM,
      buildAgentUserPayload(ctx, params.prompt, 'research'),
      agentResultSchema,
    );

    await db
      .from('thread_items')
      .update({ body: data.result, status: 'done' })
      .eq('id', params.resultItemId);

    await db.from('thread_items').insert({
      note_id: params.noteId,
      user_id: params.userId,
      author: 'ai',
      kind: 'question',
      question_type: data.new_question.question_type,
      body: data.new_question.body,
      parent_item_id: params.resultItemId,
      status: 'done',
    });

    await recordUsage(db, params.userId, 'run-research', inputTokens, outputTokens);

    await sendPushToUser(db, params.userId, {
      title: '調査が完了しました',
      body: 'スレッドに結果が届きました。',
      data: { note_id: params.noteId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '調査に失敗しました';
    await db
      .from('thread_items')
      .update({ body: message, status: 'error' })
      .eq('id', params.resultItemId);
    throw err;
  }
}

export async function executeDeepdive(
  db: SupabaseClient,
  params: {
    noteId: string;
    userId: string;
    requestItemId: string;
    resultItemId: string;
    prompt: string;
    parentItemId?: string | null;
  },
): Promise<void> {
  const ctx = await loadContext(db, params.noteId, params.userId, params.parentItemId);

  try {
    const { data, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      DEEPDIVE_SYSTEM,
      buildAgentUserPayload(ctx, params.prompt, 'deepdive'),
      agentResultSchema,
    );

    await db
      .from('thread_items')
      .update({ body: data.result, status: 'done' })
      .eq('id', params.resultItemId);

    await db.from('thread_items').insert({
      note_id: params.noteId,
      user_id: params.userId,
      author: 'ai',
      kind: 'question',
      question_type: data.new_question.question_type,
      body: data.new_question.body,
      parent_item_id: params.resultItemId,
      status: 'done',
    });

    await recordUsage(db, params.userId, 'run-deepdive', inputTokens, outputTokens);

    await sendPushToUser(db, params.userId, {
      title: '深掘りが完了しました',
      body: 'スレッドに結果が届きました。',
      data: { note_id: params.noteId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '深掘りに失敗しました';
    await db
      .from('thread_items')
      .update({ body: message, status: 'error' })
      .eq('id', params.resultItemId);
    throw err;
  }
}

export async function executeAskTurn(
  db: SupabaseClient,
  params: {
    noteId: string;
    userId: string;
    userItemId: string;
    text: string;
    parentItemId?: string | null;
  },
): Promise<void> {
  const ctx = await loadContext(db, params.noteId, params.userId, params.parentItemId);

  const { data, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
    ASK_TURN_SYSTEM,
    JSON.stringify({
      question: params.text,
      note: { raw_text: ctx.note.raw_text, type: ctx.note.type },
      thread_snippet: ctx.threadSnippet,
      parent_item: ctx.parentItem?.body,
    }),
    askTurnResultSchema,
  );

  await db.from('thread_items').insert({
    note_id: params.noteId,
    user_id: params.userId,
    author: 'ai',
    kind: 'answer',
    body: data.answer,
    parent_item_id: params.userItemId,
    status: 'done',
  });

  if (data.follow_up_question) {
    await db.from('thread_items').insert({
      note_id: params.noteId,
      user_id: params.userId,
      author: 'ai',
      kind: 'question',
      question_type: data.follow_up_question.question_type,
      body: data.follow_up_question.body,
      parent_item_id: params.userItemId,
      status: 'done',
    });
  }

  await recordUsage(db, params.userId, 'chat-turn-ask', inputTokens, outputTokens);
}

export async function executeNoteTurn(
  db: SupabaseClient,
  params: {
    noteId: string;
    userId: string;
    userItemId: string;
    text: string;
  },
): Promise<void> {
  const ctx = await loadContext(db, params.noteId, params.userId);

  const { data, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
    NOTE_CONNECTION_SYSTEM,
    JSON.stringify({
      note_text: params.text,
      root_memo: ctx.note.raw_text,
      thread_snippet: ctx.threadSnippet,
    }),
    noteConnectionResultSchema,
  );

  if (data.question) {
    await db.from('thread_items').insert({
      note_id: params.noteId,
      user_id: params.userId,
      author: 'ai',
      kind: 'question',
      question_type: data.question.question_type,
      body: data.question.body,
      parent_item_id: params.userItemId,
      status: 'done',
    });
  }

  await recordUsage(db, params.userId, 'chat-turn-note', inputTokens, outputTokens);
}
