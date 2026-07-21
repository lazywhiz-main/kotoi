import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEGAL_URLS } from '@/lib/legal';
import { getLegalAgreed, setLegalAgreed } from '@/lib/legalConsent';
import { type ColorPalette, loginPalette } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useOpeningGate } from '@/providers/OpeningGateProvider';

const c = loginPalette;

export default function LoginScreen() {
  const router = useRouter();
  const { resetOpening } = useOpeningGate();
  const {
    configured,
    lastAuthMethod,
    signInWithEmail,
    verifyEmailOtp,
    signInWithPassword,
    signInWithApple,
    signInWithGoogle,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPasswordField] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [step, setStep] = useState<'main' | 'otp'>('main');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const styles = useMemo(() => createStyles(c), []);

  useEffect(() => {
    setPasswordOpen(lastAuthMethod === 'email_password');
  }, [lastAuthMethod]);

  useEffect(() => {
    void getLegalAgreed().then(setAgreed);
  }, []);

  const toggleAgreed = (value: boolean) => {
    setAgreed(value);
    void setLegalAgreed(value);
  };
  const requireAgreement = () => {
    if (agreed) return true;
    setError('利用規約とプライバシーポリシーへの同意が必要です。');
    return false;
  };

  const showOtp = () => {
    setPasswordOpen(false);
    setPasswordField('');
    setError(null);
    setMessage(null);
  };

  const showPassword = () => {
    setPasswordOpen(true);
    setError(null);
    setMessage(null);
  };

  const run = async (action: () => Promise<{ error: string | null }>) => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const result = await action();
    if (result.error) setError(result.error);
    setSubmitting(false);
    return result;
  };

  const handleSendOtp = async () => {
    if (!email.trim()) {
      setError('メールアドレスを入力してください。');
      return;
    }
    if (!requireAgreement()) return;
    await run(async () => {
      const result = await signInWithEmail(email);
      if (!result.error) {
        setStep('otp');
        setMessage('メールに届いた確認コードを入力してください。');
      }
      return result;
    });
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      setError('確認コードを入力してください。');
      return;
    }
    await run(() => verifyEmailOtp(email, otp));
  };

  const handlePasswordContinue = async () => {
    if (!email.trim() || !password) {
      setError('メールとパスワードを入力してください。');
      return;
    }
    if (!requireAgreement()) return;
    const result = await run(() => signInWithPassword(email, password));
    if (result.error) {
      setMessage('初回や未設定のときは、確認コードで入れます。');
    }
  };

  const handleSocial = async (action: () => Promise<{ error: string | null }>) => {
    if (!requireAgreement()) return;
    await run(action);
  };

  const handleForgotPassword = () => {
    showOtp();
    setMessage('確認コードで入れます。下のボタンからコードを送ってください。');
  };

  const goMain = () => {
    setStep('main');
    setOtp('');
    setError(null);
    setMessage(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.brand}>KOTOI</Text>
            <Text style={styles.tagline}>問いが増える</Text>
            <View style={styles.hairline} />
          </View>

          {!configured ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>セットアップが必要です</Text>
              <Text style={styles.noticeBody}>
                `.env` に `EXPO_PUBLIC_SUPABASE_URL` と `EXPO_PUBLIC_SUPABASE_ANON_KEY` を設定してください。
              </Text>
            </View>
          ) : null}

          {step === 'main' ? (
            <>
              <Text style={styles.label}>メールアドレス</Text>
              <View style={styles.inputShell}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={c.hint}
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              {!passwordOpen ? (
                <>
                  <AuthButton
                    label="確認コードを送る"
                    last={lastAuthMethod === 'email_otp'}
                    disabled={submitting || !configured}
                    onPress={() => void handleSendOtp()}
                  />
                  <Pressable
                    disabled={submitting || !configured}
                    onPress={showPassword}
                    style={styles.secondaryLink}
                  >
                    <Text style={styles.secondaryLinkText}>パスワードで入る</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.passwordHint}>
                    初回や未設定のときは使えません。その場合は確認コードで入れてください。
                  </Text>
                  <Text style={styles.label}>パスワード</Text>
                  <View style={styles.inputShell}>
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="password"
                      placeholder="6文字以上"
                      placeholderTextColor={c.hint}
                      secureTextEntry
                      style={styles.input}
                      value={password}
                      onChangeText={setPasswordField}
                    />
                  </View>
                  <AuthButton
                    label="メールで続ける"
                    last={lastAuthMethod === 'email_password'}
                    disabled={submitting || !configured}
                    onPress={() => void handlePasswordContinue()}
                  />
                  <Pressable
                    disabled={submitting || !configured}
                    onPress={handleForgotPassword}
                    style={styles.secondaryLink}
                  >
                    <Text style={styles.secondaryLinkText}>確認コードで入る</Text>
                  </Pressable>
                </>
              )}

              <View style={styles.agreeRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed }}
                  onPress={() => toggleAgreed(!agreed)}
                  style={[styles.checkbox, agreed && styles.checkboxOn]}
                >
                  {agreed ? <Text style={styles.checkboxMark}>✓</Text> : null}
                </Pressable>
                <Text style={styles.agreeText}>
                  <Text
                    style={styles.agreeLink}
                    onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
                  >
                    利用規約
                  </Text>
                  {' と '}
                  <Text
                    style={styles.agreeLink}
                    onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
                  >
                    プライバシーポリシー
                  </Text>
                  {' に同意する'}
                </Text>
              </View>

              <Text style={styles.dividerLabel}>または</Text>
              <AuthButton
                label="Apple で続ける"
                last={lastAuthMethod === 'apple'}
                disabled={submitting || !configured}
                onPress={() => void handleSocial(() => signInWithApple())}
              />
              <AuthButton
                label="Google で続ける"
                last={lastAuthMethod === 'google'}
                disabled={submitting || !configured}
                onPress={() => void handleSocial(() => signInWithGoogle())}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>確認コード</Text>
              <Text style={styles.hint}>{email} に送信しました（6桁）</Text>
              <View style={styles.inputShell}>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="number-pad"
                  maxLength={8}
                  placeholder="12345678"
                  placeholderTextColor={c.hint}
                  style={[styles.input, styles.otpInput]}
                  value={otp}
                  onChangeText={setOtp}
                />
              </View>
              <Pressable onPress={goMain} style={styles.backLink}>
                <Text style={styles.backLinkText}>戻る</Text>
              </Pressable>
              <AuthButton
                label="ログイン"
                last={false}
                disabled={submitting || !configured}
                onPress={() => void handleVerifyOtp()}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {submitting ? (
            <ActivityIndicator color={c.accent} style={styles.spinner} />
          ) : null}

          {__DEV__ ? (
            <Pressable
              onPress={() => {
                void resetOpening().then(() => {
                  router.replace('/opening');
                });
              }}
              style={styles.devReset}
            >
              <Text style={styles.devResetText}>オープニングを再表示（開発用）</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthButton({
  label,
  last,
  disabled,
  onPress,
}: {
  label: string;
  last: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(c), []);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.authButton,
        last && styles.authButtonLast,
        (pressed || disabled) && styles.buttonPressed,
      ]}
    >
      {last ? (
        <View style={styles.lastBadge}>
          <Text style={styles.lastBadgeText}>前回</Text>
        </View>
      ) : null}
      <Text style={styles.authButtonText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    flex: {
      flex: 1,
    },
    container: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    hero: {
      alignItems: 'center',
      marginBottom: 28,
    },
    brand: {
      color: colors.ink,
      fontSize: 36,
      fontWeight: '700',
      letterSpacing: 6,
    },
    tagline: {
      color: colors.sub,
      fontSize: 15,
      marginTop: 10,
      letterSpacing: 1,
    },
    hairline: {
      marginTop: 16,
      width: 92,
      height: 1,
      backgroundColor: 'rgba(176,168,154,0.4)',
    },
    notice: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 20,
      padding: 14,
    },
    noticeTitle: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 6,
    },
    noticeBody: {
      color: colors.sub,
      fontSize: 15,
      lineHeight: 22,
    },
    authButton: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.lineStrong,
      borderRadius: 26,
      borderWidth: 1,
      marginBottom: 10,
      paddingVertical: 14,
      position: 'relative',
    },
    authButtonLast: {
      borderWidth: 2,
    },
    authButtonText: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: '600',
    },
    lastBadge: {
      backgroundColor: colors.bg,
      borderColor: colors.lineStrong,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
      position: 'absolute',
      right: 12,
      top: -8,
    },
    lastBadgeText: {
      color: colors.sub,
      fontSize: 11,
      fontWeight: '700',
    },
    dividerLabel: {
      color: colors.hint,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 12,
      marginTop: 18,
      textAlign: 'center',
    },
    label: {
      color: colors.sub,
      fontSize: 15,
      marginBottom: 8,
    },
    hint: {
      color: colors.hint,
      fontSize: 14,
      marginBottom: 8,
    },
    passwordHint: {
      color: colors.sub,
      fontSize: 13,
      lineHeight: 20,
      marginBottom: 12,
      marginTop: 4,
    },
    inputShell: {
      backgroundColor: colors.input,
      borderColor: colors.lineStrong,
      borderRadius: 26,
      borderWidth: 0.8,
      marginBottom: 8,
      paddingHorizontal: 18,
      paddingVertical: 4,
    },
    input: {
      color: colors.ink,
      fontSize: 17,
      paddingVertical: 12,
    },
    otpInput: {
      fontSize: 26,
      letterSpacing: 8,
      textAlign: 'center',
    },
    backLink: {
      marginBottom: 4,
      marginTop: 6,
    },
    backLinkText: {
      color: colors.sub,
      fontSize: 15,
      textAlign: 'center',
    },
    secondaryLink: {
      alignItems: 'center',
      marginBottom: 8,
      paddingVertical: 8,
    },
    secondaryLinkText: {
      color: colors.sub,
      fontSize: 14,
    },
    agreeRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 10,
      marginBottom: 4,
      marginTop: 14,
      paddingVertical: 4,
    },
    checkbox: {
      alignItems: 'center',
      borderColor: colors.lineStrong,
      borderRadius: 6,
      borderWidth: 1.5,
      height: 22,
      justifyContent: 'center',
      marginTop: 1,
      width: 22,
    },
    checkboxOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkboxMark: {
      color: colors.onAccent,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 16,
    },
    agreeText: {
      color: colors.sub,
      flex: 1,
      fontSize: 14,
      lineHeight: 22,
    },
    agreeLink: {
      color: colors.ink,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    buttonPressed: {
      opacity: 0.7,
    },
    error: {
      color: colors.ref,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 10,
    },
    message: {
      color: colors.con,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 10,
    },
    spinner: {
      marginTop: 16,
    },
    devReset: {
      alignSelf: 'center',
      marginTop: 28,
      paddingVertical: 8,
    },
    devResetText: {
      color: colors.hint,
      fontSize: 14,
    },
  });
}
