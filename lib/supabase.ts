import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('YOUR-PROJECT') &&
    supabaseAnonKey !== 'YOUR_ANON_KEY',
);

let client: SupabaseClient | null = null;

function resolveWebSocketTransport(): typeof WebSocket | undefined {
  // iOS / Android / ブラウザはネイティブ WebSocket あり。Node 用 ws はバンドルに含めない。
  if (typeof WebSocket !== 'undefined') {
    return WebSocket;
  }
  return undefined;
}

/** 未設定・WebSocket 未準備時は null */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!client) {
    const transport = resolveWebSocketTransport();
    if (!transport) {
      return null;
    }

    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      realtime: {
        transport,
      },
    });
  }

  return client;
}

export function getAuthRedirectUrl() {
  return Linking.createURL('auth/callback');
}
