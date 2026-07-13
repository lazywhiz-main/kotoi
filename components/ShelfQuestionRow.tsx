import { Pressable, StyleSheet, Text, View } from 'react-native';

import { noteSourceLabel } from '@/lib/openQuestions';
import { getQuestionColors, type ColorPalette } from '@/lib/theme';
import { QUESTION_LABEL, type OpenQuestionRow } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  row: OpenQuestionRow;
  onPress: () => void;
  mapIndex?: number;
  highlighted?: boolean;
  thoughts?: string[];
};

export function ShelfQuestionRow({ row, onPress, mapIndex, highlighted, thoughts = [] }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tag = getQuestionColors(colors)[row.question_type];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        highlighted && styles.rowHighlighted,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.top}>
        <View style={styles.tagRow}>
          {mapIndex != null ? (
            <View style={styles.indexBadge}>
              <Text style={styles.indexText}>{mapIndex}</Text>
            </View>
          ) : null}
          <View style={[styles.qtag, { backgroundColor: tag.bg }]}>
            <Text style={[styles.qtagText, { color: tag.text }]}>
              {QUESTION_LABEL[row.question_type]}
            </Text>
          </View>
        </View>
        <Text style={styles.go}>›</Text>
      </View>
      <Text style={styles.question}>{row.body}</Text>
      {thoughts.length > 0 ? (
        <View style={styles.thoughts}>
          {thoughts.map((thought, index) => (
            <Text key={`${thought}-${index}`} style={styles.thoughtLine}>
              ↳ {thought}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.sourceRow}>
        <Text style={styles.sourceIcon}>📄</Text>
        <Text style={styles.source}>{noteSourceLabel(row)}</Text>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  row: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 9,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  rowHighlighted: {
    backgroundColor: colors.input,
    borderColor: colors.lineStrong,
  },
  pressed: {
    opacity: 0.92,
  },
  top: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  tagRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  indexBadge: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
  },
  indexText: {
    color: colors.sub,
    fontSize: 14,
    fontWeight: '700',
  },
  qtag: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  qtagText: {
    fontSize: 14,
    fontWeight: '700',
  },
  go: {
    color: colors.hint,
    fontSize: 17,
  },
  question: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 24,
  },
  thoughts: {
    gap: 3,
    marginTop: 6,
  },
  thoughtLine: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 20,
  },
  sourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 7,
  },
  sourceIcon: {
    fontSize: 13,
  },
  source: {
    color: colors.hint,
    flex: 1,
    fontSize: 13,
  },
});
}
