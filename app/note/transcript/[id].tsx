import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useNoteThread } from '@/hooks/useNoteThread';
import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

function formatCharCount(length: number): string {
  if (length >= 10_000) return `${(length / 10_000).toFixed(1)}万字`;
  if (length >= 1000) return `${Math.round(length / 1000)}千字`;
  return `${length}字`;
}

export default function SourceBodyScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { note, loading, error } = useNoteThread(id);

  if (loading && !note) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!note) {
    return (
      <View style={styles.center}>
        <ErrorBanner message={error ?? 'メモが見つかりません。'} />
      </View>
    );
  }

  const isArticle = !note.is_video && !!note.article_body?.trim();
  const title = note.source_title ?? note.video_title ?? (isArticle ? '記事' : '動画');
  const body = (isArticle ? note.article_body : note.video_transcript)?.trim();
  const pending = isArticle
    ? note.article_status === 'pending'
    : note.transcript_status === 'pending';

  if (!body) {
    return (
      <View style={styles.center}>
        <EmptyState
          title={
            pending
              ? isArticle
                ? '記事を読み取り中'
                : '文字起こしを取得中'
              : isArticle
                ? '記事本文がありません'
                : '文字起こしがありません'
          }
          description={
            pending
              ? '完了すると全文をここで読めます。'
              : isArticle
                ? 'このページから本文を抽出できませんでした。'
                : 'この動画は字幕取得に対応していない可能性があります。'
          }
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {isArticle ? '記事本文 · ' : '文字起こし · '}
          {formatCharCount(body.length)}
        </Text>
        <View style={styles.bodyCard}>
          <Text selectable style={styles.body}>
            {body}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 4,
  },
  meta: {
    color: colors.hint,
    fontSize: 15,
    marginBottom: 14,
  },
  bodyCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  body: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 26,
  },
});
}
