import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { confirmDeleteNotePrompt } from '@/components/RootMemoCard';
import { noteLooksLikeArticle } from '@/lib/article';
import { getLinkTitle, noteHasLinkPreview, previewFromNote } from '@/lib/linkPreview';
import { formatNoteListStats, formatNoteThreadGlimpse } from '@/lib/noteListSummary';
import { getNoteTypeColors, type ColorPalette } from '@/lib/theme';
import { NOTE_TYPE_LABEL, type Note, type NoteListSummary } from '@/lib/types';
import { isNoteStillGrowing, videoPipelineAnchor } from '@/lib/video';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  note: Note;
  summary?: NoteListSummary;
  onPress?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
};

function previewText(note: Note) {
  const linkTitle = getLinkTitle(note);
  const text = note.raw_text.trim() || linkTitle || '（内容なし）';
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function NoteCard({ note, summary, onPress, onDelete, deleting }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isGrowing = isNoteStillGrowing({
    type: note.type,
    isVideo: note.is_video,
    transcriptStatus: note.transcript_status,
    articleStatus: note.article_status,
    hasArticleUrl: noteLooksLikeArticle(note),
    anchor: videoPipelineAnchor(note),
    createdAt: note.created_at,
    hasDoneThreadContent: summary?.hasDoneContent ?? false,
  });
  // task / ref は問いを付けないので「途中停止」扱いにしない
  const expectsThreadGrowth = note.type !== 'task' && note.type !== 'ref';
  const showIncomplete =
    expectsThreadGrowth && !isGrowing && !(summary?.hasDoneContent ?? false);
  const incompleteLabel = !note.type
    ? '分類が途中で止まりました。開いて再実行できます'
    : '処理が途中で止まりました。開いて再取得できます';
  const typeLabel = note.type
    ? NOTE_TYPE_LABEL[note.type]
    : showIncomplete
      ? '未分類'
      : '分類中';
  const typeStyle = note.type
    ? getNoteTypeColors(colors)[note.type]
    : { text: colors.sub, bg: colors.cardElevated };
  const linkPreview = previewFromNote(note);
  const statsLine = formatNoteListStats(summary);
  const glimpse = formatNoteThreadGlimpse(summary);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
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
            onPress={(e) => {
              e?.stopPropagation?.();
              confirmDeleteNotePrompt(onDelete);
            }}
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
      <Text style={styles.body}>{previewText(note)}</Text>
      {isGrowing ? <Text style={styles.growing}>育成中…</Text> : null}
      {showIncomplete ? <Text style={styles.incomplete}>{incompleteLabel}</Text> : null}
      {statsLine ? <Text style={styles.stats}>{statsLine}</Text> : null}
      {glimpse ? <Text style={styles.glimpse}>↳ {glimpse}</Text> : null}
      {note.source_url && noteHasLinkPreview(note) ? (
        <LinkPreviewCard
          url={note.source_url}
          preview={linkPreview}
          isVideo={note.is_video}
          compact
        />
      ) : null}
      <Text style={styles.meta}>
        {new Date(note.created_at).toLocaleString('ja-JP', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    pressed: {
      opacity: 0.85,
    },
    topRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'space-between',
      marginBottom: 8,
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
    body: {
      color: colors.ink,
      fontSize: 17,
      lineHeight: 24,
    },
    growing: {
      color: colors.sub,
      fontSize: 14,
      marginTop: 6,
    },
    incomplete: {
      color: colors.sub,
      fontSize: 13,
      marginTop: 6,
    },
    stats: {
      color: colors.sub,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 8,
    },
    glimpse: {
      color: colors.sub,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 4,
    },
    meta: {
      color: colors.hint,
      fontSize: 13,
      marginTop: 8,
    },
  });
}
