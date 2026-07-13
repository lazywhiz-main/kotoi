import { useCallback, useState } from 'react';
import { router } from 'expo-router';

import { invokeFunction } from '@/lib/api';
import { parseNoteInput } from '@/lib/parseNoteInput';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export function useCaptureNote() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: string) => {
      if (!user) return null;

      const { raw_text, source_url } = parseNoteInput(input);
      if (!raw_text) {
        setError('メモを入力してください。');
        return null;
      }

      const supabase = getSupabase();
      if (!supabase) {
        setError('Supabase が未設定です。.env を確認してください。');
        return null;
      }

      setSubmitting(true);
      setError(null);

      const { data, error: insertError } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          raw_text,
          source_url,
        })
        .select('id')
        .single();

      setSubmitting(false);

      if (insertError || !data) {
        setError(insertError?.message ?? '保存に失敗しました。');
        return null;
      }

      void invokeFunction('classify-note', { note_id: data.id }).catch(() => {});
      router.push(`/note/${data.id}`);
      return data.id;
    },
    [user],
  );

  return { submit, submitting, error, clearError: () => setError(null) };
}
