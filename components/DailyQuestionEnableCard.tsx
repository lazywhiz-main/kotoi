import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  recallHourChipOptions,
  recallHourLabel,
} from '@/lib/dailyQuestion';
import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  busy?: boolean;
  initialHour?: number;
  onEnable: (hour: number) => void;
  onSkip: () => void;
};

export function DailyQuestionEnableCard({
  busy,
  initialHour = 8,
  onEnable,
  onSkip,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [hour, setHour] = useState(initialHour);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>こんな機能もあります</Text>
      <Text style={styles.title}>今日の問い</Text>
      <Text style={styles.body}>
        過去のメモから、別角度の問いを1つ。届く時刻だけ決めてください。
      </Text>
      <Text style={styles.choiceLabel}>届く時刻（日本時間）</Text>
      <View style={styles.choiceRow}>
        {recallHourChipOptions(hour).map((h) => {
          const active = hour === h;
          return (
            <Pressable
              key={h}
              disabled={busy}
              onPress={() => setHour(h)}
              style={[styles.choiceChip, active && styles.choiceChipActive]}
            >
              <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                {recallHourLabel(h)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>
        <Pressable
          disabled={busy}
          onPress={onSkip}
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
        >
          <Text style={styles.btnGhostText}>スキップ</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={() => onEnable(hour)}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Text style={styles.btnPrimaryText}>オンにする</Text>
          )}
        </Pressable>
      </View>
      <Pressable
        disabled={busy}
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [styles.settingsLink, pressed && styles.pressed]}
      >
        <Text style={styles.settingsLinkText}>曜日やリズムは設定から変えられます</Text>
      </Pressable>
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
      marginBottom: 6,
    },
    title: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: '600',
      marginBottom: 6,
    },
    body: {
      color: colors.sub,
      fontSize: 14,
      lineHeight: 20,
    },
    choiceLabel: {
      color: colors.sub,
      fontSize: 13,
      marginBottom: 8,
      marginTop: 12,
    },
    choiceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    choiceChip: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    choiceChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    choiceChipText: {
      color: colors.ink,
      fontSize: 14,
    },
    choiceChipTextActive: {
      color: colors.onAccent,
      fontWeight: '600',
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
      minWidth: 88,
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
    settingsLink: {
      alignSelf: 'flex-start',
      marginTop: 10,
      paddingVertical: 2,
    },
    settingsLinkText: {
      color: colors.hint,
      fontSize: 13,
    },
    pressed: {
      opacity: 0.88,
    },
  });
}
