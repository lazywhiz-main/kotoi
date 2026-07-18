import { useCallback, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';
import { formatNoteSourceLabel } from '@/lib/openQuestions';
import type { DailyQuestionDelivery } from '@/lib/dailyQuestion';
import { getSupabase } from '@/lib/supabase';
import type { Note } from '@/lib/types';

export type DailyQuestionView = DailyQuestionDelivery & {
  anchor_note_label: string;
  anchor_question_body: string | null;
};

type EnsureResponse = {
  ok: boolean;
  delivery: DailyQuestionDelivery | null;
};

async function loadAnchorContext(
  delivery: DailyQuestionDelivery,
): Promise<Pick<DailyQuestionView, 'anchor_note_label' | 'anchor_question_body'>> {
  const supabase = getSupabase();
  if (!supabase) {
    return { anchor_note_label: 'メモ', anchor_question_body: null };
  }

  const [{ data: note }, { data: question }] = await Promise.all([
    supabase
      .from('notes')
      .select('raw_text, is_video, video_title')
      .eq('id', delivery.anchor_note_id)
      .maybeSingle(),
    delivery.anchor_question_id
      ? supabase
          .from('thread_items')
          .select('body')
          .eq('id', delivery.anchor_question_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const anchorNote = note as Pick<Note, 'raw_text' | 'is_video' | 'video_title'> | null;

  return {
    anchor_note_label: anchorNote
      ? formatNoteSourceLabel({
          raw_text: anchorNote.raw_text,
          is_video: anchorNote.is_video,
          video_title: anchorNote.video_title,
        })
      : 'メモ',
    anchor_question_body: question?.body?.trim() ?? null,
  };
}

async function toView(delivery: DailyQuestionDelivery): Promise<DailyQuestionView> {
  const anchor = await loadAnchorContext(delivery);
  return { ...delivery, ...anchor };
}

export function useDailyQuestion(userId: string | undefined) {
  const [delivery, setDelivery] = useState<DailyQuestionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setDelivery(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invokeFunction<EnsureResponse>('daily-question', {
        action: 'ensure',
      });
      if (result.delivery?.status === 'active') {
        setDelivery(await toView(result.delivery));
      } else {
        setDelivery(null);
      }
    } catch (err) {
      setError(formatApiError(err));
      setDelivery(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const save = useCallback(async () => {
    if (!delivery) return null;
    setActing(true);
    setError(null);
    try {
      const result = await invokeFunction<{
        ok: boolean;
        thread_item_id: string;
      }>('daily-question', {
        action: 'save',
        delivery_id: delivery.id,
      });
      setDelivery(null);
      return result.thread_item_id;
    } catch (err) {
      setError(formatApiError(err));
      return null;
    } finally {
      setActing(false);
    }
  }, [delivery]);

  const dismiss = useCallback(async () => {
    if (!delivery) return;
    setActing(true);
    setError(null);
    try {
      await invokeFunction('daily-question', {
        action: 'dismiss',
        delivery_id: delivery.id,
      });
      setDelivery(null);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setActing(false);
    }
  }, [delivery]);

  return {
    delivery,
    loading,
    acting,
    error,
    refresh,
    save,
    dismiss,
    clearError: () => setError(null),
  };
}
