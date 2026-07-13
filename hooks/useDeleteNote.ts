import { useCallback, useState } from 'react';

import { formatApiError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';

export function useDeleteNote() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteNote = useCallback(async (noteId: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase が未設定です。.env を確認してください。');
      return false;
    }

    setDeleting(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase.from('notes').delete().eq('id', noteId);
      if (deleteError) throw deleteError;
      return true;
    } catch (err) {
      setError(formatApiError(err, 'メモの削除に失敗しました'));
      return false;
    } finally {
      setDeleting(false);
    }
  }, []);

  return {
    deleteNote,
    deleting,
    error,
    clearError: () => setError(null),
  };
}
