import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getLastAuthMethod,
  setLastAuthMethod,
  type AuthMethod,
} from '@/lib/auth/lastMethod';
import {
  clearPasswordOfferPending,
  completePasswordOffer,
  isPasswordOfferPending,
  queuePasswordOffer,
  skipPasswordOffer,
} from '@/lib/auth/passwordOffer';
import {
  identityProviderLabel,
  linkAppleNative,
  linkOAuthProvider,
  signInWithAppleNative,
  signInWithOAuthProvider,
} from '@/lib/auth/social';
import { getAuthRedirectUrl, getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { identifyPurchasesUser } from '@/lib/purchases';
import { notifyExplicitLogout } from '@/lib/opening/logoutBridge';
import { trackSessionStarted } from '@/lib/analytics';

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  lastAuthMethod: AuthMethod | null;
  passwordOfferPending: boolean;
  linkedProviders: string[];
  signInWithEmail: (email: string) => Promise<AuthResult>;
  verifyEmailOtp: (email: string, token: string) => Promise<AuthResult>;
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>;
  signUpWithPassword: (email: string, password: string) => Promise<AuthResult>;
  setPassword: (password: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  verifyRecoveryOtp: (email: string, token: string) => Promise<AuthResult>;
  finishPasswordOffer: (mode: 'set' | 'skip') => Promise<void>;
  signInWithApple: () => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  linkApple: () => Promise<AuthResult>;
  linkGoogle: () => Promise<AuthResult>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  providerLabel: (provider: string) => string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function createSessionFromUrl(url: string) {
  const supabase = getSupabase();
  if (!supabase) return;

  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const paramString =
    hashIndex !== -1
      ? url.slice(hashIndex + 1)
      : queryIndex !== -1
        ? url.slice(queryIndex + 1)
        : '';
  if (!paramString) return;

  const params = new URLSearchParams(paramString);
  const code = params.get('code');
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    return;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return;

  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}

function providersFromUser(user: User | null): string[] {
  const identities = user?.identities ?? [];
  const set = new Set(identities.map((row) => row.provider));
  return [...set];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAuthMethod, setLastMethodState] = useState<AuthMethod | null>(null);
  const [passwordOfferPending, setPasswordOfferPending] = useState(false);

  const remember = useCallback(async (method: AuthMethod) => {
    await setLastAuthMethod(method);
    setLastMethodState(method);
  }, []);

  useEffect(() => {
    void getLastAuthMethod().then(setLastMethodState);
    void isPasswordOfferPending().then(setPasswordOfferPending);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      void identifyPurchasesUser(data.session?.user?.id ?? null);
      if (data.session) trackSessionStarted(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      void identifyPurchasesUser(nextSession?.user?.id ?? null);
      if (nextSession) trackSessionStarted(false);
    });

    const handleUrl = (event: { url: string }) => {
      void createSessionFromUrl(event.url);
    };

    void Linking.getInitialURL().then((url) => {
      if (url) void createSessionFromUrl(url);
    });

    const linkingSubscription = Linking.addEventListener('url', handleUrl);

    return () => {
      subscription.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
    }

    const { error } = await getSupabase()!.auth.signInWithOtp({
      email: email.trim(),
    });

    return { error: error?.message ?? null };
  }, []);

  const verifyEmailOtp = useCallback(
    async (email: string, token: string) => {
      if (!isSupabaseConfigured) {
        return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
      }

      // セッション確立より先に pending を立て、タブへ飛ばないようにする
      const queued = await queuePasswordOffer();
      if (queued) setPasswordOfferPending(true);

      const { error } = await getSupabase()!.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'email',
      });

      if (error) {
        if (queued) {
          await clearPasswordOfferPending();
          setPasswordOfferPending(false);
        }
        return { error: error.message };
      }

      await remember('email_otp');
      return { error: null };
    },
    [remember],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured) {
        return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
      }

      const { error } = await getSupabase()!.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!error) {
        await remember('email_password');
        return { error: null };
      }

      const raw = error.message ?? '';
      if (/invalid login credentials/i.test(raw)) {
        return {
          error:
            'メールまたはパスワードが違います。パスワード未設定なら確認コードで入るか、入ったあと設定でパスワードを付けてください。',
        };
      }
      return { error: raw };
    },
    [remember],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured) {
        return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
      }

      const { data, error } = await getSupabase()!.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) return { error: error.message };

      if (data.session) {
        await remember('email_password');
        return { error: null };
      }

      return {
        error:
          '確認メールを送った場合は、届いたコード／リンクで完了してください。すでに登録済みならパスワードでログインしてください。',
      };
    },
    [remember],
  );

  const setPassword = useCallback(
    async (password: string) => {
      if (!isSupabaseConfigured) {
        return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
      }
      if (password.length < 6) {
        return { error: 'パスワードは6文字以上にしてください。' };
      }

      const { error } = await getSupabase()!.auth.updateUser({ password });
      if (!error) await remember('email_password');
      return { error: error?.message ?? null };
    },
    [remember],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
    }
    if (!email.trim()) {
      return { error: 'メールアドレスを入力してください。' };
    }

    const { error } = await getSupabase()!.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthRedirectUrl(),
    });
    return { error: error?.message ?? null };
  }, []);

  const verifyRecoveryOtp = useCallback(async (email: string, token: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
    }

    const { error } = await getSupabase()!.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    return { error: error?.message ?? null };
  }, []);

  const finishPasswordOffer = useCallback(async (mode: 'set' | 'skip') => {
    if (mode === 'skip') {
      await skipPasswordOffer();
    } else {
      await completePasswordOffer();
    }
    setPasswordOfferPending(false);
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
    }
    const result = await signInWithAppleNative();
    if (!result.error) {
      const { data } = await getSupabase()!.auth.getSession();
      if (data.session) await remember('apple');
    }
    return result;
  }, [remember]);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase の環境変数が未設定です。.env を確認してください。' };
    }
    const result = await signInWithOAuthProvider('google');
    if (!result.error) {
      const { data } = await getSupabase()!.auth.getSession();
      if (data.session) await remember('google');
    }
    return result;
  }, [remember]);

  const linkApple = useCallback(async () => {
    const result = await linkAppleNative();
    if (!result.error) {
      const { data } = await getSupabase()!.auth.getUser();
      if (data.user) setSession((prev) => (prev ? { ...prev, user: data.user! } : prev));
    }
    return result;
  }, []);

  const linkGoogle = useCallback(async () => {
    const result = await linkOAuthProvider('google');
    if (!result.error) {
      const { data } = await getSupabase()!.auth.getUser();
      if (data.user) setSession((prev) => (prev ? { ...prev, user: data.user! } : prev));
    }
    return result;
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await getSupabase()?.auth.getUser() ?? { data: { user: null } };
    if (data.user) {
      setSession((prev) => (prev ? { ...prev, user: data.user! } : prev));
    }
  }, []);

  const signOut = useCallback(async () => {
    await identifyPurchasesUser(null);
    await getSupabase()?.auth.signOut();
    notifyExplicitLogout();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      lastAuthMethod,
      passwordOfferPending,
      linkedProviders: providersFromUser(session?.user ?? null),
      signInWithEmail,
      verifyEmailOtp,
      signInWithPassword,
      signUpWithPassword,
      setPassword,
      requestPasswordReset,
      verifyRecoveryOtp,
      finishPasswordOffer,
      signInWithApple,
      signInWithGoogle,
      linkApple,
      linkGoogle,
      refreshUser,
      signOut,
      providerLabel: identityProviderLabel,
    }),
    [
      session,
      loading,
      lastAuthMethod,
      passwordOfferPending,
      signInWithEmail,
      verifyEmailOtp,
      signInWithPassword,
      signUpWithPassword,
      setPassword,
      requestPasswordReset,
      verifyRecoveryOtp,
      finishPasswordOffer,
      signInWithApple,
      signInWithGoogle,
      linkApple,
      linkGoogle,
      refreshUser,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
