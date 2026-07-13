import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { getAuthRedirectUrl, getSupabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithAppleNative(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase が未設定です。' };

  if (Platform.OS !== 'ios') {
    return signInWithOAuthProvider('apple');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    return { error: 'この端末では Apple でサインインできません。' };
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: 'Apple からトークンを取得できませんでした。' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) return { error: error.message };

    if (credential.fullName) {
      const parts = [
        credential.fullName.givenName,
        credential.fullName.middleName,
        credential.fullName.familyName,
      ].filter(Boolean);
      if (parts.length > 0) {
        await supabase.auth.updateUser({
          data: {
            full_name: parts.join(' '),
            given_name: credential.fullName.givenName,
            family_name: credential.fullName.familyName,
          },
        });
      }
    }

    return { error: null };
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code === 'ERR_REQUEST_CANCELED') {
      return { error: null };
    }
    return {
      error: err instanceof Error ? err.message : 'Apple でのサインインに失敗しました。',
    };
  }
}

export async function linkAppleNative(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase が未設定です。' };

  if (Platform.OS !== 'ios') {
    return linkOAuthProvider('apple');
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { error: 'Apple からトークンを取得できませんでした。' };
    }
    const { error } = await supabase.auth.linkIdentity({
      provider: 'apple',
      token: credential.identityToken,
    });
    return { error: error?.message ?? null };
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code === 'ERR_REQUEST_CANCELED') {
      return { error: null };
    }
    return {
      error: err instanceof Error ? err.message : 'Apple の連携に失敗しました。',
    };
  }
}

export async function signInWithOAuthProvider(
  provider: 'google' | 'apple',
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase が未設定です。' };

  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) return { error: error.message };
  if (!data.url) return { error: '認証 URL を取得できませんでした。' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    return { error: null };
  }

  return exchangeSessionFromUrl(result.url);
}

export async function linkOAuthProvider(
  provider: 'google' | 'apple',
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase が未設定です。' };

  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) return { error: error.message };
  if (!data.url) return { error: '認証 URL を取得できませんでした。' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    return { error: null };
  }

  return exchangeSessionFromUrl(result.url);
}

async function exchangeSessionFromUrl(url: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase が未設定です。' };

  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const paramString =
    hashIndex !== -1
      ? url.slice(hashIndex + 1)
      : queryIndex !== -1
        ? url.slice(queryIndex + 1)
        : '';
  if (!paramString) return { error: '認証コールバックが不正です。' };

  const params = new URLSearchParams(paramString);
  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error: error?.message ?? null };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return { error: 'セッション情報を取得できませんでした。' };
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return { error: error?.message ?? null };
}

export function identityProviderLabel(provider: string): string {
  switch (provider) {
    case 'apple':
      return 'Apple';
    case 'google':
      return 'Google';
    case 'email':
      return 'メール';
    default:
      return provider;
  }
}
