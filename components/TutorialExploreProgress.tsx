import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  count: number;
  total: number;
  compact?: boolean;
};

/** 探究が足りないときの進捗。Empty 付近に添えるだけ。 */
export function TutorialExploreProgress({ count, total, compact = false }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      accessibilityLabel={`問い ${count} / ${total}`}
    >
      <Text style={[styles.line, compact && styles.lineCompact]}>
        <Text style={[styles.count, compact && styles.countCompact]}>{count}</Text>
        {` / ${total} 問い`}
      </Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      alignItems: 'center',
      marginTop: 8,
      paddingBottom: 12,
    },
    wrapCompact: {
      marginTop: 0,
      paddingBottom: 8,
    },
    line: {
      color: colors.hint,
      fontSize: 17,
      letterSpacing: 0.4,
    },
    lineCompact: {
      fontSize: 14,
    },
    count: {
      color: colors.ink,
      fontSize: 32,
      fontWeight: '600',
    },
    countCompact: {
      fontSize: 22,
    },
  });
}
