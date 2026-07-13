import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

export default function NotFoundScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <Stack.Screen options={{ title: '見つかりません' }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.title}>この画面はありません</Text>
          <Text style={styles.description}>リンクが古いか、移動先が変わった可能性があります。</Text>
          <Link href="/" asChild>
            <Pressable style={styles.link}>
              <Text style={styles.linkText}>ホームへ戻る</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    </>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    color: colors.sub,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 20,
    textAlign: 'center',
  },
  link: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  linkText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
});
}
