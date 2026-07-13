import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import type { OpenQuestionRow } from '@/lib/types';

export function useOpenQuestions(userId: string | undefined) {
  const [questions, setQuestions] = useState<OpenQuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    if (!userId) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('open_questions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setQuestions([]);
    } else {
      setQuestions((data ?? []) as OpenQuestionRow[]);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchQuestions();
  }, [fetchQuestions]);

  return { questions, loading, error, refresh: fetchQuestions };
}
