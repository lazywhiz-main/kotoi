import { StyleSheet, Text, View } from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  body: string;
  kind: 'note' | 'request';
};

export function UserItemCard({ body, kind }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.item}>
      <Text style={styles.who}>{kind === 'request' ? '依頼' : 'あなた'}</Text>
      <View style={styles.card}>
        <Text selectable style={styles.body}>
          {body}
        </Text>
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
    color: colors.you,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 5,
  },
  card: {
    backgroundColor: colors.youBg,
    borderColor: '#efdcb0',
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  body: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
  },
});
}
