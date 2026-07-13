import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function GenerateMoreQuestions({ onPress, loading, disabled }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Pressable
        disabled={disabled || loading}
        onPress={onPress}
        style={({ pressed }) => [
          styles.btn,
          (disabled || loading || pressed) && styles.btnDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.sub} size="small" />
        ) : (
          <Text style={styles.btnText}>もう1つ問いを生やす</Text>
        )}
      </Pressable>
      <Text style={styles.hint}>左にスワイプすると問いをアーカイブできます</Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  wrap: {
    gap: 6,
    marginBottom: 8,
    marginTop: 4,
  },
  btn: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: colors.sub,
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    color: colors.hint,
    fontSize: 13,
    lineHeight: 16,
    paddingHorizontal: 2,
  },
});
}
