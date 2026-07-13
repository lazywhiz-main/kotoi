import { useCallback, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

export function useQuestionArchive(onUpdated?: () => void) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const archiveQuestion = useCallback(
    async (itemId: string, noteId: string) => {
      const supabase = getSupabase();
      if (!supabase) {
        setError('Supabase が未設定です。');
        return false;
      }

      setUpdatingId(itemId);
      setError(null);

      const { error: updateError } = await supabase
        .from('thread_items')
        .update({
          answered: true,
          answered_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .eq('note_id', noteId)
        .eq('kind', 'question')
        .eq('answered', false);

      setUpdatingId(null);

      if (updateError) {
        setError(updateError.message);
        return false;
      }

      onUpdated?.();
      return true;
    },
    [onUpdated],
  );

  const unarchiveQuestion = useCallback(
    async (itemId: string, noteId: string) => {
      const supabase = getSupabase();
      if (!supabase) {
        setError('Supabase が未設定です。');
        return false;
      }

      setUpdatingId(itemId);
      setError(null);

      const { error: updateError } = await supabase
        .from('thread_items')
        .update({
          answered: false,
          answered_at: null,
        })
        .eq('id', itemId)
        .eq('note_id', noteId)
        .eq('kind', 'question')
        .eq('answered', true);

      setUpdatingId(null);

      if (updateError) {
        setError(updateError.message);
        return false;
      }

      onUpdated?.();
      return true;
    },
    [onUpdated],
  );

  return {
    archiveQuestion,
    unarchiveQuestion,
    updatingId,
    error,
    clearError: () => setError(null),
  };
}
