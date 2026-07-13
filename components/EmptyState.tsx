import { StyleSheet, Text, View } from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
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
    textAlign: 'center',
  },
});
}
