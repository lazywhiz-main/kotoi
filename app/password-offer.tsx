import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type ColorPalette, loginPalette } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';

const c = loginPalette;

export default function PasswordOfferScreen() {
  const { setPassword, finishPasswordOffer } = useAuth();
  const [password, setPasswordField] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipHint, setSkipHint] = useState(false);
  const styles = useMemo(() => createStyles(c), []);

  const handleSet = async () => {
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください。');
      return;
    }
    if (password !== confirm) {
      setError('確認用パスワードが一致しません。');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await setPassword(password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    await finishPasswordOffer('set');
    setSubmitting(false);
  };

  const handleSkip = async () => {
    setSkipHint(true);
    setSubmitting(true);
    // 短い案内を見せてから進む
    await new Promise((r) => setTimeout(r, 900));
    await finishPasswordOffer('skip');
    setSubmitting(false);
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
          <Text style={styles.title}>パスワードを入れておくと</Text>
          <Text style={styles.body}>
            次回以降、パスワードでもログインできます。いま設定しなくても大丈夫です。
          </Text>

          <Text style={styles.label}>パスワード</Text>
          <View style={styles.inputShell}>
            <TextInput
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="6文字以上"
              placeholderTextColor={c.hint}
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPasswordField}
            />
          </View>

          <Text style={styles.label}>確認</Text>
          <View style={styles.inputShell}>
            <TextInput
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="もう一度"
              placeholderTextColor={c.hint}
              secureTextEntry
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
            />
          </View>

          <Pressable
            disabled={submitting}
            onPress={() => void handleSet()}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || submitting) && styles.pressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>設定する</Text>
          </Pressable>

          <Pressable
            disabled={submitting}
            onPress={() => void handleSkip()}
            style={styles.skipLink}
          >
            <Text style={styles.skipLinkText}>あとで</Text>
          </Pressable>

          {skipHint ? (
            <Text style={styles.hint}>
              あとで設定画面からパスワードを設定できます。
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {submitting ? (
            <ActivityIndicator color={c.accent} style={styles.spinner} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    title: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 30,
      marginBottom: 10,
    },
    body: {
      color: colors.sub,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 28,
    },
    label: {
      color: colors.sub,
      fontSize: 15,
      marginBottom: 8,
    },
    inputShell: {
      backgroundColor: colors.input,
      borderColor: colors.lineStrong,
      borderRadius: 26,
      borderWidth: 0.8,
      marginBottom: 12,
      paddingHorizontal: 18,
      paddingVertical: 4,
    },
    input: {
      color: colors.ink,
      fontSize: 17,
      paddingVertical: 12,
    },
    primaryBtn: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: 26,
      marginTop: 8,
      paddingVertical: 14,
    },
    primaryBtnText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: '600',
    },
    skipLink: {
      alignItems: 'center',
      marginTop: 16,
      paddingVertical: 10,
    },
    skipLinkText: {
      color: colors.sub,
      fontSize: 15,
    },
    hint: {
      color: colors.con,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      textAlign: 'center',
    },
    error: {
      color: colors.ref,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 10,
    },
    spinner: {
      marginTop: 16,
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
