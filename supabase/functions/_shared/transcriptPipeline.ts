import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  runGenerateQuestions,
  runGenerateVideoFallbackQuestions,
  runSummarizeNote,
} from './pipeline.ts';
import { fetchYouTubeTranscriptText, isYouTubeUrl } from './youtubeTranscript.ts';

type NoteRow = {
  id: string;
  user_id: string;
  source_url: string | null;
  is_video: boolean;
  type: string | null;
  video_transcript?: string | null;
  transcript_status?: string | null;
};

export type TranscriptFetchResult = 'done' | 'error' | 'skipped';

/** waitUntil 切断などで残った pending / error の要約・問いを消して再開できるようにする */
export async function clearIncompleteAiItems(
  db: SupabaseClient,
  noteId: string,
): Promise<void> {
  await db
    .from('thread_items')
    .delete()
    .eq('note_id', noteId)
    .eq('author', 'ai')
    .in('kind', ['summary', 'question'])
    .in('status', ['pending', 'error']);
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

export async function runFetchTranscript(
  db: SupabaseClient,
  note: Pick<NoteRow, 'id' | 'source_url' | 'is_video' | 'video_transcript' | 'transcript_status'>,
  options?: { force?: boolean },
): Promise<TranscriptFetchResult> {
  if (!note.is_video || !note.source_url || !isYouTubeUrl(note.source_url)) {
    return 'skipped';
  }

  // 既に本文がある場合は再取得しない（再開時に時間を節約）
  if (
    !options?.force &&
    note.transcript_status === 'done' &&
    !!note.video_transcript?.trim()
  ) {
    return 'done';
  }

  await db
    .from('notes')
    .update({ transcript_status: 'pending' })
    .eq('id', note.id);

  try {
    const transcript = await fetchYouTubeTranscriptText(note.source_url);
    if (!transcript) {
      await db
        .from('notes')
        .update({ transcript_status: 'error' })
        .eq('id', note.id);
      return 'error';
    }

    await db
      .from('notes')
      .update({
        video_transcript: transcript,
        transcript_status: 'done',
      })
      .eq('id', note.id);

    return 'done';
  } catch (err) {
    console.error('runFetchTranscript error:', err);
    await db
      .from('notes')
      .update({ transcript_status: 'error' })
      .eq('id', note.id);
    return 'error';
  }
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

export async function runVideoNotePipeline(
  db: SupabaseClient,
  noteId: string,
  options?: { forceTranscript?: boolean },
): Promise<void> {
  try {
    const { data: note, error } = await db
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (error || !note) {
      console.error('runVideoNotePipeline: note not found', noteId);
      return;
    }

    // 途中切断で残った pending を掃除してから再開
    await clearIncompleteAiItems(db, noteId);

    const transcriptResult = await runFetchTranscript(db, note, {
      force: options?.forceTranscript,
    });

    const { data: updatedNote } = await db
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();

    if (!updatedNote) return;

    const canSummarize =
      !!updatedNote.video_transcript &&
      updatedNote.type !== 'task' &&
      updatedNote.type !== 'ref' &&
      updatedNote.type !== null;

    let summary: string | null = null;

    if (canSummarize && updatedNote.video_transcript) {
      if (await hasDoneSummary(db, noteId)) {
        summary = await loadDoneSummaryBody(db, noteId);
      } else {
        summary = await runSummarizeNote(db, updatedNote);
      }
    }

    if (transcriptResult === 'error') {
      if (!(await hasDoneQuestion(db, noteId))) {
        await runGenerateVideoFallbackQuestions(db, updatedNote);
      }
      return;
    }

    if ((canSummarize || updatedNote.type === 'feeling') && !(await hasDoneQuestion(db, noteId))) {
      await runGenerateQuestions(db, updatedNote, summary);
    }
  } catch (err) {
    console.error('runVideoNotePipeline error:', err);
    await failPendingAiItems(db, noteId);
    await db
      .from('notes')
      .update({ transcript_status: 'error' })
      .eq('id', noteId)
      .eq('transcript_status', 'pending');
  }
}
