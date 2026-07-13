import { useCallback, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';

const MAX_LENGTH = 200;

export function useQuestionThought(userId: string | undefined, onUpdated?: () => void) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [updatingThoughtId, setUpdatingThoughtId] = useState<string | null>(null);
  const [draftingQuestionId, setDraftingQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateBody = (text: string) => {
    const body = text.trim();
    if (!body) {
      setError('一言を入力してください。');
      return null;
    }
    if (body.length > MAX_LENGTH) {
      setError(`一言は${MAX_LENGTH}文字までです。`);
      return null;
    }
    return body;
  };

  const getClient = () => {
    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase が未設定です。');
      return null;
    }
    if (!userId) {
      setError('ログインが必要です。');
      return null;
    }
    return supabase;
  };

  const addThought = useCallback(
    async (itemId: string, noteId: string, text: string) => {
      const body = validateBody(text);
      if (!body) return false;

      const supabase = getClient();
      if (!supabase) return false;

      setSubmittingId(itemId);
      setError(null);

      const { error: insertError } = await supabase.from('thread_items').insert({
        note_id: noteId,
        user_id: userId!,
        author: 'user',
        kind: 'note',
        body,
        parent_item_id: itemId,
        status: 'done',
      });

      setSubmittingId(null);

      if (insertError) {
        setError(insertError.message);
        return false;
      }

      onUpdated?.();
      return true;
    },
    [onUpdated, userId],
  );

  const updateThought = useCallback(
    async (thoughtId: string, noteId: string, text: string) => {
      const body = validateBody(text);
      if (!body) return false;

      const supabase = getClient();
      if (!supabase) return false;

      setUpdatingThoughtId(thoughtId);
      setError(null);

      const { error: updateError } = await supabase
        .from('thread_items')
        .update({ body })
        .eq('id', thoughtId)
        .eq('note_id', noteId)
        .eq('user_id', userId!)
        .eq('kind', 'note')
        .eq('author', 'user');

      setUpdatingThoughtId(null);

      if (updateError) {
        setError(updateError.message);
        return false;
      }

      onUpdated?.();
      return true;
    },
    [onUpdated, userId],
  );

  const deleteThought = useCallback(
    async (thoughtId: string, noteId: string) => {
      const supabase = getClient();
      if (!supabase) return false;

      setUpdatingThoughtId(thoughtId);
      setError(null);

      const { error: deleteError } = await supabase
        .from('thread_items')
        .delete()
        .eq('id', thoughtId)
        .eq('note_id', noteId)
        .eq('user_id', userId!)
        .eq('kind', 'note')
        .eq('author', 'user');

      setUpdatingThoughtId(null);

      if (deleteError) {
        setError(deleteError.message);
        return false;
      }

      onUpdated?.();
      return true;
    },
    [onUpdated, userId],
  );

  const requestDraft = useCallback(
    async (questionId: string, noteId: string) => {
      setDraftingQuestionId(questionId);
      setError(null);

      try {
        const result = await invokeFunction<{ ok?: boolean; draft?: string; error?: string }>(
          'draft-thought',
          { note_id: noteId, question_item_id: questionId },
        );

        if (result.error || !result.draft) {
          setError(formatApiError(result.error ?? 'たたき台の生成に失敗しました', 'たたき台の生成に失敗しました'));
          return null;
        }

        return result.draft;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'たたき台の生成に失敗しました');
        return null;
      } finally {
        setDraftingQuestionId(null);
      }
    },
    [],
  );

  return {
    addThought,
    updateThought,
    deleteThought,
    requestDraft,
    submittingId,
    updatingThoughtId,
    draftingQuestionId,
    error,
    clearError: () => setError(null),
    maxLength: MAX_LENGTH,
  };
}
