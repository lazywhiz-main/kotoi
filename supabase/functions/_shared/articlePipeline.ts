import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { fetchArticleContent } from './articleBody.ts';
import {
  runGenerateQuestions,
  runGenerateVideoFallbackQuestions,
  runSummarizeNote,
} from './pipeline.ts';
import {
  clearIncompleteAiItems,
} from './transcriptPipeline.ts';
import { isYouTubeUrl } from './youtubeTranscript.ts';

type NoteRow = {
  id: string;
  user_id: string;
  source_url: string | null;
  source_title: string | null;
  is_video: boolean;
  type: string | null;
  article_body?: string | null;
  article_status?: string | null;
};

export type ArticleFetchResultStatus = 'done' | 'error' | 'skipped';

function shouldFetchArticle(
  note: Pick<NoteRow, 'source_url' | 'type'>,
): boolean {
  if (!note.source_url || isYouTubeUrl(note.source_url)) return false;
  return note.type === 'learn' || note.type === 'seed';
}

async function hasDoneSummary(db: SupabaseClient, noteId: string): Promise<boolean> {
  const { count } = await db
    .from('thread_items')
    .select('id', { count: 'exact', head: true })
    .eq('note_id', noteId)
    .eq('kind', 'summary')
    .eq('status', 'done');
  return (count ?? 0) > 0;
}

async function hasDoneQuestion(db: SupabaseClient, noteId: string): Promise<boolean> {
  const { count } = await db
    .from('thread_items')
    .select('id', { count: 'exact', head: true })
    .eq('note_id', noteId)
    .eq('kind', 'question')
    .eq('status', 'done');
  return (count ?? 0) > 0;
}

async function loadDoneSummaryBody(
  db: SupabaseClient,
  noteId: string,
): Promise<string | null> {
  const { data } = await db
    .from('thread_items')
    .select('body')
    .eq('note_id', noteId)
    .eq('kind', 'summary')
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.body ?? null;
}

async function failPendingAiItems(db: SupabaseClient, noteId: string): Promise<void> {
  await db
    .from('thread_items')
    .update({
      status: 'error',
      body: '処理が途中で止まりました。もう一度お試しください。',
    })
    .eq('note_id', noteId)
    .eq('author', 'ai')
    .eq('status', 'pending')
    .in('kind', ['summary', 'question']);
}

export async function runFetchArticle(
  db: SupabaseClient,
  note: Pick<
    NoteRow,
    'id' | 'source_url' | 'source_title' | 'type' | 'article_body' | 'article_status'
  >,
  options?: { force?: boolean },
): Promise<ArticleFetchResultStatus> {
  if (!shouldFetchArticle(note) || !note.source_url) {
    return 'skipped';
  }

  if (
    !options?.force &&
    note.article_status === 'done' &&
    !!note.article_body?.trim()
  ) {
    return 'done';
  }

  await db
    .from('notes')
    .update({ article_status: 'pending' })
    .eq('id', note.id);

  try {
    const fetched = await fetchArticleContent(note.source_url);
    if (!fetched.body) {
      await db
        .from('notes')
        .update({ article_status: 'error' })
        .eq('id', note.id);
      return 'error';
    }

    const updates: Record<string, string> = {
      article_body: fetched.body,
      article_status: 'done',
    };
    if (fetched.title && !note.source_title) {
      updates.source_title = fetched.title;
    }

    await db.from('notes').update(updates).eq('id', note.id);
    return 'done';
  } catch (err) {
    console.error('runFetchArticle error:', err);
    await db
      .from('notes')
      .update({ article_status: 'error' })
      .eq('id', note.id);
    return 'error';
  }
}

/**
 * 記事URLメモ: 本文取得 → 要約 → 問い。
 * 本文が取れなくても raw_text / タイトルで要約・問いを試みる。
 */
export async function runArticleNotePipeline(
  db: SupabaseClient,
  noteId: string,
  options?: { forceArticle?: boolean },
): Promise<void> {
  try {
    const { data: note, error } = await db
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (error || !note) {
      console.error('runArticleNotePipeline: note not found', noteId);
      return;
    }

    if (!shouldFetchArticle(note)) {
      return;
    }

    await clearIncompleteAiItems(db, noteId);

    const articleResult = await runFetchArticle(db, note, {
      force: options?.forceArticle,
    });

    const { data: updatedNote } = await db
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (!updatedNote) return;

    const canSummarize =
      updatedNote.type === 'learn' || updatedNote.type === 'seed';

    let summary: string | null = null;

    if (canSummarize) {
      if (await hasDoneSummary(db, noteId)) {
        summary = await loadDoneSummaryBody(db, noteId);
      } else {
        summary = await runSummarizeNote(db, updatedNote);
      }
    }

    // 本文取得失敗でも、タイトル／メモからの問いは出す（動画フォールバックに近い）
    if (articleResult === 'error' && !updatedNote.article_body) {
      if (!(await hasDoneQuestion(db, noteId))) {
        if (summary) {
          await runGenerateQuestions(db, updatedNote, summary);
        } else {
          await runGenerateVideoFallbackQuestions(db, updatedNote);
        }
      }
      return;
    }

    if ((canSummarize || updatedNote.type === 'feeling') && !(await hasDoneQuestion(db, noteId))) {
      await runGenerateQuestions(db, updatedNote, summary);
    }
  } catch (err) {
    console.error('runArticleNotePipeline error:', err);
    await failPendingAiItems(db, noteId);
    await db
      .from('notes')
      .update({ article_status: 'error' })
      .eq('id', noteId)
      .eq('article_status', 'pending');
  }
}

export function noteWantsArticleFetch(note: {
  source_url: string | null;
  type: string | null;
}): boolean {
  return shouldFetchArticle(note);
}
