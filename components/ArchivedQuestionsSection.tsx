import { useEffect, useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThreadItemView } from '@/components/ThreadItemView';
import { type ColorPalette } from '@/lib/theme';
import type { ChatMode, ThreadItem } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  items: ThreadItem[];
  noteId: string;
  noteType?: string | null;
  noteIsVideo?: boolean;
  childrenByParent: Map<string, ThreadItem[]>;
  highlightedItemId?: string | null;
  updatingId?: string | null;
  thoughtSubmittingId?: string | null;
  updatingThoughtId?: string | null;
  forceExpanded?: boolean;
  registerItemRef?: (itemId: string, node: View | null) => void;
  onQuickAction?: (mode: ChatMode, parentItemId: string, seedText: string) => void;
  onSubmitThought?: (itemId: string, text: string) => Promise<boolean>;
  onUpdateThought?: (thoughtId: string, text: string) => Promise<boolean>;
  onDeleteThought?: (thoughtId: string) => Promise<boolean>;
  onRequestDraft?: (itemId: string) => Promise<string | null>;
  draftingThoughtId?: string | null;
  onUnarchive: (itemId: string) => void;
  onInlineInputActiveChange?: (questionId: string, active: boolean) => void;
  onInlineDraftEmptyChange?: (questionId: string, empty: boolean) => void;
  dismissEmptySignal?: number;
  activeInlineQuestionId?: string | null;
};

export function ArchivedQuestionsSection({
  items,
  noteId,
  noteType,
  noteIsVideo,
  childrenByParent,
  highlightedItemId,
  updatingId,
  thoughtSubmittingId,
  updatingThoughtId,
  forceExpanded,
  registerItemRef,
  onQuickAction,
  onSubmitThought,
  onUpdateThought,
  onDeleteThought,
  onRequestDraft,
  draftingThoughtId,
  onUnarchive,
  onInlineInputActiveChange,
  onInlineDraftEmptyChange,
  dismissEmptySignal,
  activeInlineQuestionId,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <Text style={styles.headerTitle}>アーカイブ</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.headerCount}>{items.length}件</Text>
          <Text style={styles.headerChevron}>{expanded ? '−' : '+'}</Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.list}>
          {items.map((item) => (
            <ThreadItemView
              key={item.id}
              item={item}
              noteId={noteId}
              noteType={noteType}
              archived
              highlighted={highlightedItemId === item.id}
              highlightedItemId={highlightedItemId}
              registerItemRef={registerItemRef}
              childrenByParent={childrenByParent}
              noteIsVideo={noteIsVideo}
              updatingQuestionId={updatingId}
              thoughtSubmittingId={thoughtSubmittingId}
              updatingThoughtId={updatingThoughtId}
              draftingThoughtId={draftingThoughtId}
              onQuickAction={onQuickAction}
              onSubmitThought={onSubmitThought}
              onUpdateThought={onUpdateThought}
              onDeleteThought={onDeleteThought}
              onRequestDraft={onRequestDraft}
              onUnarchive={onUnarchive}
              onInlineInputActiveChange={onInlineInputActiveChange}
              onInlineDraftEmptyChange={onInlineDraftEmptyChange}
              dismissEmptySignal={dismissEmptySignal}
              activeInlineQuestionId={activeInlineQuestionId}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  section: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.input,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerPressed: {
    opacity: 0.9,
  },
  headerTitle: {
    color: colors.sub,
    fontSize: 15,
    fontWeight: '700',
  },
  headerMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerCount: {
    color: colors.hint,
    fontSize: 14,
    fontWeight: '600',
  },
  headerChevron: {
    color: colors.hint,
    fontSize: 17,
    fontWeight: '600',
    width: 14,
  },
  list: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
});
}
