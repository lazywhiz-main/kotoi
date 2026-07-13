import { useCallback, useEffect, useState } from 'react';

import { formatApiError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';
import type { UserSettings } from '@/lib/types';

const DEFAULT_SETTINGS = {
  notify_agent_done: true,
  notify_weekly_review: true,
};

export function useUserSettings(userId: string | undefined) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
    async (
      key: 'notify_agent_done' | 'notify_weekly_review' | 'appearance',
      value: boolean | UserSettings['appearance'],
    ) => {
      if (!userId) return;

      const supabase = getSupabase();
      if (!supabase) return;

      setSaving(true);
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
        setSaving(false);
      }
    },
    [userId, settings],
  );

  return {
    settings,
    loading,
    saving,
    error,
    refresh: load,
    updateSetting,
  };
}
