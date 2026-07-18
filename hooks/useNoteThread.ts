import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { isArticleProcessing, noteLooksLikeArticle } from '@/lib/article';
import {
  isClassifyProcessing,
  isTranscriptProcessing,
  VIDEO_PIPELINE_STUCK_MS,
  videoPipelineAnchor,
} from '@/lib/video';
import type { Note, NoteType, ThreadItem } from '@/lib/types';

const POLL_MS = 2000;
const AWAIT_FIRST_QUESTION_MS = 120_000;
const STUCK_PENDING_MS = VIDEO_PIPELINE_STUCK_MS;

function canGrowQuestions(type: NoteType | null | undefined) {
  return type === 'seed' || type === 'learn' || type === 'feeling';
}

function itemAgeMs(item: ThreadItem): number {
  return Date.now() - new Date(item.created_at).getTime();
}

export function useNoteThread(noteId: string | undefined) {
  const [note, setNote] = useState<Note | null>(null);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!noteId) return;

    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase が未設定です。.env を確認してください。');
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    const [noteResult, itemsResult] = await Promise.all([
      supabase.from('notes').select('*').eq('id', noteId).single(),
      supabase
        .from('thread_items')
        .select('*')
        .eq('note_id', noteId)
        .order('created_at', { ascending: true }),
    ]);

    if (noteResult.error) {
      setError(noteResult.error.message);
      setNote(null);
      setItems([]);
    } else {
      setNote(noteResult.data as Note);
      setItems((itemsResult.data ?? []) as ThreadItem[]);
    }

    setLoading(false);
  }, [noteId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // waitUntil 切断で残った古い pending を error に落としてスピナーを止める
  useEffect(() => {
    if (!noteId || items.length === 0) return;
    const stuckIds = items
      .filter(
        (item) =>
          item.status === 'pending' &&
          (item.kind === 'summary' || item.kind === 'question') &&
          itemAgeMs(item) >= STUCK_PENDING_MS,
      )
      .map((item) => item.id);
    if (stuckIds.length === 0) return;

    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;
    void (async () => {
      await supabase
        .from('thread_items')
        .update({
          status: 'error',
          body: '処理が途中で止まりました。もう一度お試しください。',
        })
        .in('id', stuckIds);
      if (!cancelled) await fetchData(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [noteId, items, fetchData]);

  const hasQuestion = items.some((item) => item.kind === 'question' && item.status === 'done');
  const awaitingFirstQuestion =
    !!note &&
    canGrowQuestions(note.type) &&
    !hasQuestion &&
    !!note.classified_at &&
    Date.now() - new Date(note.classified_at).getTime() < AWAIT_FIRST_QUESTION_MS;

  const hasFreshPending = items.some(
    (item) => item.status === 'pending' && itemAgeMs(item) < STUCK_PENDING_MS,
  );

  const anchor = note ? videoPipelineAnchor(note) : null;
  const isProcessing =
    (!!note && isClassifyProcessing(note)) ||
    isTranscriptProcessing(
      note?.transcript_status ?? null,
      note?.is_video ?? false,
      anchor,
    ) ||
    isArticleProcessing(
      note?.article_status ?? null,
      !!note && noteLooksLikeArticle(note),
      anchor,
    ) ||
    hasFreshPending ||
    awaitingFirstQuestion;

  useEffect(() => {
    if (!isProcessing) return;
    const timer = setInterval(() => void fetchData(true), POLL_MS);
    return () => clearInterval(timer);
  }, [isProcessing, fetchData]);

  return { note, items, loading, error, refresh: fetchData, isProcessing };
}
