import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  body: string;
  pending?: boolean;
};

/** エージェント結果本体のみ。続きの問いは ThreadItemView 側で通常の問いカードとして出す */
export function ResultCard({ body, pending }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.item}>
      <Text style={styles.who}>エージェント</Text>
      <View style={[styles.card, pending && styles.cardPending]}>
        {pending ? (
          <View style={styles.pendingRow}>
            <ActivityIndicator color="#c99a3a" size="small" />
            <Text style={styles.pendingText}>{body}</Text>
          </View>
        ) : (
          <Text selectable style={styles.body}>
            {body}
          </Text>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  item: {
    marginBottom: 12,
  },
  who: {
    color: '#c99a3a',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 5,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  cardPending: {
    backgroundColor: '#fbf6ea',
    borderColor: '#d8c48f',
    borderStyle: 'dashed',
  },
  body: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
  },
  pendingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pendingText: {
    color: colors.sub,
    fontSize: 15,
    flex: 1,
  },
});
}
