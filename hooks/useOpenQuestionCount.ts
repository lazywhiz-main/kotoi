import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

/** タブ脈動など用の軽い件数取得。 */
export function useOpenQuestionCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setCount(0);
      return;
    }

    const { count: next, error } = await supabase
      .from('open_questions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      setCount(0);
      return;
    }

    setCount(next ?? 0);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { count, refresh };
}
