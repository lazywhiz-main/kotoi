import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  type AppearancePreference,
  type ColorPalette,
  type ColorSchemeName,
  darkPalette,
  lightPalette,
} from '@/lib/theme';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

const APPEARANCE_STORAGE_KEY = 'kotoi_appearance';

type ThemeContextValue = {
  preference: AppearancePreference;
  scheme: ColorSchemeName;
  colors: ColorPalette;
  setPreference: (next: AppearancePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { user } = useAuth();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');
  const [_ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
      if (cancelled) return;

      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const supabase = getSupabase();
    if (!supabase) return;

    void (async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('appearance')
        .eq('user_id', user.id)
        .maybeSingle();

      // appearance カラム未適用の環境では黙ってローカル設定を使う
      if (error) return;

      if (data?.appearance === 'light' || data?.appearance === 'dark' || data?.appearance === 'system') {
        setPreferenceState(data.appearance);
        await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, data.appearance);
      }
    })();
  }, [user?.id]);

  const scheme: ColorSchemeName =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const colors = scheme === 'dark' ? darkPalette : lightPalette;

  const setPreference = useCallback(
    async (next: AppearancePreference) => {
      setPreferenceState(next);
      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, next);

      if (!user?.id) return;

      const supabase = getSupabase();
      if (!supabase) return;

      const { error } = await supabase.from('user_settings').upsert({
        user_id: user.id,
        appearance: next,
      });
      // appearance カラム未適用時はローカルのみ（AsyncStorage）で保持
      if (error) {
        console.warn('appearance sync skipped:', error.message);
      }
    },
    [user?.id],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme,
      colors,
      setPreference,
    }),
    [preference, scheme, colors, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export function useColors(): ColorPalette {
  return useTheme().colors;
}
