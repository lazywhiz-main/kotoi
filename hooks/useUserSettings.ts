import { useCallback, useEffect, useState } from 'react';

import { formatApiError } from '@/lib/errors';
import type { RecallRhythm } from '@/lib/dailyQuestion';
import { getSupabase } from '@/lib/supabase';
import type { UserSettings } from '@/lib/types';

const DEFAULT_SETTINGS = {
  notify_agent_done: true,
  notify_weekly_review: true,
  notify_daily_question: true,
  recall_rhythm: 'off' as RecallRhythm,
  recall_weekday: 0,
  recall_hour: 8,
};

type SettingKey =
  | 'notify_agent_done'
  | 'notify_weekly_review'
  | 'notify_daily_question'
  | 'appearance'
  | 'recall_rhythm'
  | 'recall_weekday'
  | 'recall_hour';

export function useUserSettings(userId: string | undefined) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setSettings(null);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setSettings(data as UserSettings);
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('user_settings')
        .insert({ user_id: userId, ...DEFAULT_SETTINGS })
        .select('*')
        .single();

      if (insertError) throw insertError;
      setSettings(inserted as UserSettings);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateSetting = useCallback(
    async (key: SettingKey, value: boolean | UserSettings['appearance'] | RecallRhythm | number) => {
      if (!userId) return;

      const supabase = getSupabase();
      if (!supabase) return;

      setSavingKey(key);
      setError(null);

      const previous = settings;
      setSettings((current) =>
        current ? { ...current, [key]: value } : current,
      );

      try {
        const { data, error: updateError } = await supabase
          .from('user_settings')
          .upsert({ user_id: userId, [key]: value })
          .select('*')
          .single();

        if (updateError) throw updateError;
        setSettings(data as UserSettings);
      } catch (err) {
        setSettings(previous);
        setError(formatApiError(err));
      } finally {
        setSavingKey(null);
      }
    },
    [userId, settings],
  );

  return {
    settings,
    loading,
    saving: savingKey !== null,
    savingKey,
    error,
    refresh: load,
    updateSetting,
  };
}
