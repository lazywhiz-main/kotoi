import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  text: string;
  hint?: string;
  onDismiss?: () => void;
};

/**
 * チュートリアル専用の短い囁き。
 * 既存画面のレイアウトを置き換えず、添えるだけ。
 */
export function TutorialWhisper({ text, hint, onDismiss }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text}${hint ? `。${hint}` : ''}`}
      onPress={onDismiss}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <Text style={styles.text}>{text}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {onDismiss ? <Text style={styles.dismiss}>とじる</Text> : null}
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      alignSelf: 'flex-start',
      backgroundColor: colors.card,
      borderColor: colors.lineStrong,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 12,
      maxWidth: 240,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    pressed: {
      opacity: 0.85,
    },
    text: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    hint: {
      color: colors.hint,
      fontSize: 11,
      fontWeight: '500',
      marginTop: 2,
    },
    dismiss: {
      color: colors.hint,
      fontSize: 11,
      marginTop: 6,
    },
  });
}
