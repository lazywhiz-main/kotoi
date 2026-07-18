import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  body: string;
  pending?: boolean;
  /** 動画字幕 or 記事本文を材料にした要約 */
  sourceKind?: 'video' | 'article' | null;
  noteId?: string;
  /** チュートリアル初回など、既存カードを壊さず枠だけ少し際立たせる */
  emphasized?: boolean;
  /** @deprecated sourceKind を使う */
  isVideoTranscript?: boolean;
};

export function SummaryCard({
  body,
  pending,
  sourceKind,
  noteId,
  emphasized,
  isVideoTranscript,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const kind = sourceKind ?? (isVideoTranscript ? 'video' : null);
  const who =
    kind === 'video' ? '文字起こし要約' : kind === 'article' ? '記事要約' : '要約';
  const showSourceLink = !!kind && !!noteId && !pending;

  return (
    <View style={styles.item}>
      <Text style={styles.who}>{who}</Text>
      <View style={[styles.card, emphasized && styles.cardEmphasized]}>
        {pending ? (
          <View style={styles.pendingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.pendingText}>{body}</Text>
          </View>
        ) : (
          <Text selectable style={styles.body}>{body}</Text>
        )}
        {showSourceLink ? (
          <Link href={`/note/transcript/${noteId}`} asChild>
            <Pressable style={styles.transcriptLink}>
              <Text style={styles.transcriptLinkText}>全文を見る</Text>
            </Pressable>
          </Link>
        ) : null}
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
    color: colors.sub,
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
  cardEmphasized: {
    backgroundColor: colors.input,
    borderColor: colors.lineStrong,
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
  },
  transcriptLink: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 2,
  },
  transcriptLinkText: {
    color: colors.sub,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
}
