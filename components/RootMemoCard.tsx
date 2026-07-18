import { useMemo } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useRetryNotePipeline } from '@/hooks/useRetryTranscript';
import { noteHasLinkPreview, previewFromNote } from '@/lib/linkPreview';
import { getNoteTypeColors, type ColorPalette } from '@/lib/theme';
import {
  articleStatusLabel,
  isArticlePipelineIncomplete,
  noteLooksLikeArticle,
} from '@/lib/article';
import {
  transcriptStatusLabel,
  isVideoPipelineIncomplete,
  isQuestionPipelineIncomplete,
  isClassifyStuck,
  isClassifyProcessing,
  videoPipelineAnchor,
} from '@/lib/video';
import { NOTE_TYPE_LABEL, type Note } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  note: Note;
  onRefresh?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  /** 完了した問いがあるか（パイプライン未完了の再取得案内用） */
  hasDoneQuestion?: boolean;
};

function confirmDeleteNote(onConfirm: () => void) {
  const title = 'メモを削除しますか？';
  const message = 'このメモと、スレッドの要約・問いなどもまとめて消えます。';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'やめる', style: 'cancel' },
    { text: '削除', style: 'destructive', onPress: onConfirm },
  ]);
}

export function RootMemoCard({
  note,
  onRefresh,
  onDelete,
  deleting,
  hasDoneQuestion = false,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const classifyStuck = isClassifyStuck(note);
  const classifyProcessing = isClassifyProcessing(note);
  const { retry, retrying, error } = useRetryNotePipeline(
    note.id,
    { needsClassify: !note.type },
    onRefresh,
  );
  const typeLabel = note.type
    ? NOTE_TYPE_LABEL[note.type]
    : classifyStuck
      ? '未分類'
      : '分類中';
  const typeStyle = note.type
    ? getNoteTypeColors(colors)[note.type]
    : { text: colors.sub, bg: colors.cardElevated };
  const linkPreview = previewFromNote(note);
  const showLinkPreview = note.source_url && (noteHasLinkPreview(note) || !note.type);
  const looksLikeArticle = noteLooksLikeArticle(note);
  const pipelineAnchor = videoPipelineAnchor(note);
  const transcriptLabel = transcriptStatusLabel(
    note.transcript_status,
    note.is_video,
    pipelineAnchor,
  );
  const articleLabel = articleStatusLabel(
    note.article_status,
    looksLikeArticle,
    pipelineAnchor,
  );
  const hasTranscript = note.transcript_status === 'done' && !!note.video_transcript?.trim();
  const hasArticle = note.article_status === 'done' && !!note.article_body?.trim();
  const pipelineIncomplete =
    isVideoPipelineIncomplete({
      isVideo: note.is_video,
      type: note.type,
      hasDoneQuestion,
      anchor: pipelineAnchor,
    }) ||
    isArticlePipelineIncomplete({
      hasArticleUrl: looksLikeArticle,
      type: note.type,
      hasDoneQuestion,
      anchor: pipelineAnchor,
    }) ||
    isQuestionPipelineIncomplete({
      type: note.type,
      hasDoneQuestion,
      anchor: pipelineAnchor,
    });
  const showRetry =
    classifyStuck ||
    note.transcript_status === 'error' ||
    note.article_status === 'error' ||
    pipelineIncomplete;
  const questionStuckOnly =
    isQuestionPipelineIncomplete({
      type: note.type,
      hasDoneQuestion,
      anchor: pipelineAnchor,
    }) &&
    !note.is_video &&
    !looksLikeArticle;

  return (
    <View style={styles.memo}>
      <View style={styles.topRow}>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: typeStyle.bg }]}>
            <Text style={[styles.chipText, { color: typeStyle.text }]}>{typeLabel}</Text>
          </View>
          {note.is_video ? (
            <View style={[styles.chip, { backgroundColor: getNoteTypeColors(colors).video.bg }]}>
              <Text style={[styles.chipText, { color: getNoteTypeColors(colors).video.text }]}>
                動画
              </Text>
            </View>
          ) : null}
        </View>
        {onDelete ? (
          <Pressable
            accessibilityLabel="メモを削除"
            disabled={deleting}
            hitSlop={8}
            onPress={() => confirmDeleteNote(onDelete)}
            style={styles.deleteBtn}
          >
            {deleting ? (
              <ActivityIndicator color={colors.ref} size="small" />
            ) : (
              <SymbolView
                name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                size={18}
                tintColor={colors.ref}
              />
            )}
          </Pressable>
        ) : null}
      </View>
      <Text selectable style={styles.raw}>{note.raw_text || '（テキストなし）'}</Text>
      {showLinkPreview && note.source_url ? (
        <LinkPreviewCard
          url={note.source_url}
          preview={linkPreview}
          loading={!noteHasLinkPreview(note) && classifyProcessing}
          isVideo={note.is_video}
        />
      ) : null}
      {transcriptLabel || articleLabel || showRetry || classifyStuck ? (
        <View style={styles.transcriptRow}>
          {classifyStuck ? (
            <Text style={styles.transcriptMeta}>分類が途中で止まっています</Text>
          ) : null}
          {transcriptLabel ? <Text style={styles.transcriptMeta}>{transcriptLabel}</Text> : null}
          {articleLabel ? <Text style={styles.transcriptMeta}>{articleLabel}</Text> : null}
          {questionStuckOnly ? (
            <Text style={styles.transcriptMeta}>問いの生成が途中で止まっています</Text>
          ) : null}
          {pipelineIncomplete &&
          !questionStuckOnly &&
          note.transcript_status !== 'error' &&
          note.article_status !== 'error' ? (
            <Text style={styles.transcriptMeta}>スレッドの生成が途中です</Text>
          ) : null}
          {hasTranscript || hasArticle ? (
            <Link href={`/note/transcript/${note.id}`} asChild>
              <Pressable style={styles.retryBtn}>
                <Text style={styles.retryText}>全文を見る</Text>
              </Pressable>
            </Link>
          ) : null}
          {showRetry ? (
            <Pressable disabled={retrying} onPress={() => void retry()} style={styles.retryBtn}>
              {retrying ? (
                <ActivityIndicator color={colors.sub} size="small" />
              ) : (
                <Text style={styles.retryText}>{classifyStuck ? 'もう一度' : '再取得'}</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {classifyProcessing ? <Text style={styles.processing}>分類中…</Text> : null}
    </View>
  );
}

export function confirmDeleteNotePrompt(onConfirm: () => void) {
  confirmDeleteNote(onConfirm);
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    memo: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 6,
      paddingHorizontal: 15,
      paddingVertical: 14,
    },
    topRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'space-between',
      marginBottom: 9,
    },
    chips: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      borderRadius: 20,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    deleteBtn: {
      marginTop: 1,
      padding: 2,
    },
    raw: {
      color: colors.ink,
      fontSize: 17,
      lineHeight: 26,
    },
    processing: {
      color: colors.hint,
      fontSize: 14,
      marginTop: 8,
    },
    transcriptMeta: {
      color: colors.hint,
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
    },
    transcriptRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    retryBtn: {
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    retryText: {
      color: colors.sub,
      fontSize: 15,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
  });
}
