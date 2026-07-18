import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DailyQuestionView } from '@/hooks/useDailyQuestion';
import { getQuestionColors, type ColorPalette } from '@/lib/theme';
import { QUESTION_LABEL } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  delivery: DailyQuestionView;
  busy?: boolean;
  onOpen: () => void;
  onSave: () => void;
  onDismiss: () => void;
};

export function DailyQuestionCard({
  delivery,
  busy,
  onOpen,
  onSave,
  onDismiss,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tag = getQuestionColors(colors)[delivery.question_type];

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>今日の問い · 別角度</Text>
      <View style={styles.tagRow}>
        <View style={[styles.qtag, { backgroundColor: tag.bg }]}>
          <Text style={[styles.qtagText, { color: tag.text }]}>
            {QUESTION_LABEL[delivery.question_type]}
          </Text>
        </View>
      </View>
      <Text style={styles.question}>{delivery.body}</Text>
      {delivery.why_now ? (
        <Text style={styles.whyNow}>{delivery.why_now}</Text>
      ) : null}
      <View style={styles.sourceRow}>
        <Text style={styles.sourceIcon}>📄</Text>
        <Text style={styles.source}>{delivery.anchor_note_label}</Text>
      </View>
      {delivery.anchor_question_body ? (
        <Text style={styles.anchorQuestion} numberOfLines={2}>
          ↳ {delivery.anchor_question_body}
        </Text>
      ) : (
        <Text style={styles.anchorQuestion}>↳ このメモに触れて</Text>
      )}
      <View style={styles.actions}>
        <Pressable
          disabled={busy}
          onPress={onOpen}
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
        >
          <Text style={styles.btnGhostText}>開く</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={onSave}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Text style={styles.btnPrimaryText}>残す</Text>
          )}
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={onDismiss}
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
        >
          <Text style={styles.btnGhostText}>あとで</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.input,
      borderColor: colors.lineStrong,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 16,
      marginHorizontal: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    eyebrow: {
      color: colors.sub,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.2,
      marginBottom: 8,
    },
    tagRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    qtag: {
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    qtagText: {
      fontSize: 13,
      fontWeight: '700',
    },
    question: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: '500',
      lineHeight: 26,
    },
    whyNow: {
      color: colors.sub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
    },
    sourceRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 5,
      marginTop: 10,
    },
    sourceIcon: {
      fontSize: 13,
    },
    source: {
      color: colors.hint,
      flex: 1,
      fontSize: 13,
    },
    anchorQuestion: {
      color: colors.sub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'flex-end',
      marginTop: 14,
    },
    btn: {
      alignItems: 'center',
      borderRadius: 20,
      justifyContent: 'center',
      minHeight: 36,
      minWidth: 72,
      paddingHorizontal: 14,
    },
    btnPrimary: {
      backgroundColor: colors.accent,
    },
    btnPrimaryText: {
      color: colors.onAccent,
      fontSize: 14,
      fontWeight: '600',
    },
    btnGhost: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderWidth: 1,
    },
    btnGhostText: {
      color: colors.ink,
      fontSize: 14,
    },
    pressed: {
      opacity: 0.88,
    },
  });
}
