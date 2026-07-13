import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArchivedQuestionsSection } from '@/components/ArchivedQuestionsSection';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { GenerateMoreQuestions } from '@/components/GenerateMoreQuestions';
import { RootMemoCard } from '@/components/RootMemoCard';
import { ThreadComposer } from '@/components/ThreadComposer';
import { ThreadItemView } from '@/components/ThreadItemView';
import { useDeleteNote } from '@/hooks/useDeleteNote';
import { useGenerateMoreQuestions } from '@/hooks/useGenerateMoreQuestions';
import { useQuestionThought } from '@/hooks/useQuestionThought';
import { useQuestionArchive } from '@/hooks/useQuestionArchive';
import { useNoteThread } from '@/hooks/useNoteThread';
import { useRetryAgentJob } from '@/hooks/useRetryAgentJob';
import { useTutorialScene } from '@/hooks/useTutorialScene';
import { resolveAgentMode } from '@/lib/agentMode';
import { type ColorPalette } from '@/lib/theme';
import type { ChatMode, NoteType, ThreadItem } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useColors } from '@/providers/ThemeProvider';

function buildChildrenMap(items: ThreadItem[]): Map<string, ThreadItem[]> {
  const map = new Map<string, ThreadItem[]>();
  for (const item of items) {
    if (!item.parent_item_id) continue;
    const list = map.get(item.parent_item_id) ?? [];
    list.push(item);
    map.set(item.parent_item_id, list);
  }
  return map;
}

function isTopLevelItem(item: ThreadItem, items: ThreadItem[]): boolean {
  if (item.parent_item_id) {
    const parent = items.find((row) => row.id === item.parent_item_id);
    if (item.kind === 'question' && parent?.kind === 'result') return false;
    if (item.kind === 'note' && item.author === 'user' && parent?.kind === 'question') {
      return false;
    }
  }
  return true;
}

function canGrowQuestions(type: NoteType | null | undefined) {
  return type === 'seed' || type === 'learn' || type === 'feeling';
}

export default function NoteScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id, itemId: itemIdParam } = useLocalSearchParams<{ id: string; itemId?: string | string[] }>();
  const itemId = Array.isArray(itemIdParam) ? itemIdParam[0] : itemIdParam;
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVerticalOffset = insets.top + 44;
  const { note, items, loading, error, refresh, isProcessing } = useNoteThread(id);
  const {
    retry: retryAgentJob,
    retryingId,
    error: retryAgentError,
    clearError: clearRetryAgentError,
  } = useRetryAgentJob(id ?? '', () => void refresh(true));
  const {
    deleteNote,
    deleting,
    error: deleteError,
    clearError: clearDeleteError,
  } = useDeleteNote();
  const [composerMode, setComposerMode] = useState<ChatMode>('note');
  const [composerText, setComposerText] = useState('');
  const [parentItemId, setParentItemId] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  /** 一言／編集中の問い。下のスレッド composer を退避する */
  const [inlineInputOwnerId, setInlineInputOwnerId] = useState<string | null>(null);
  const [inlineDraftEmpty, setInlineDraftEmpty] = useState(true);
  const [dismissEmptySignal, setDismissEmptySignal] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const rowRefs = useRef<Map<string, View>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolledToItemRef = useRef<string | null>(null);

  const { archiveQuestion, unarchiveQuestion, updatingId, error: archiveError, clearError: clearArchiveError } =
    useQuestionArchive(() => void refresh(true));
  const {
    addThought,
    updateThought,
    deleteThought,
    requestDraft,
    submittingId: thoughtSubmittingId,
    updatingThoughtId,
    draftingQuestionId,
    error: thoughtError,
    clearError: clearThoughtError,
  } = useQuestionThought(user?.id, () => void refresh(true));
  const {
    generateMore,
    generating,
    error: generateError,
    clearError: clearGenerateError,
  } = useGenerateMoreQuestions(id ?? '', () => void refresh(true));
  const {
    visible: threadTutorialVisible,
    markSeen: markThreadTutorialSeen,
  } = useTutorialScene('thread1');

  const childrenByParent = useMemo(() => buildChildrenMap(items), [items]);
  const topLevelItems = useMemo(
    () => items.filter((item) => isTopLevelItem(item, items)),
    [items],
  );
  const activeItems = useMemo(
    () => topLevelItems.filter((item) => !(item.kind === 'question' && item.answered)),
    [topLevelItems],
  );
  const archivedQuestions = useMemo(
    () => topLevelItems.filter((item) => item.kind === 'question' && item.answered),
    [topLevelItems],
  );
  const questionCount = useMemo(
    () => items.filter((item) => item.kind === 'question').length,
    [items],
  );
  const showGenerateMore =
    !!note && canGrowQuestions(note.type) && questionCount > 0 && !isProcessing;
  const forceArchiveExpanded = !!itemId && archivedQuestions.some((item) => item.id === itemId);

  const firstSummaryId = useMemo(
    () => activeItems.find((item) => item.kind === 'summary' && item.status === 'done')?.id,
    [activeItems],
  );
  const firstQuestionId = useMemo(
    () =>
      activeItems.find((item) => item.kind === 'question' && item.status === 'done')?.id,
    [activeItems],
  );
  const threadTutorialReady =
    threadTutorialVisible && (!!firstSummaryId || !!firstQuestionId);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (threadTutorialReady) void markThreadTutorialSeen();
      };
    }, [threadTutorialReady, markThreadTutorialSeen]),
  );

  const clearHighlightTimer = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearHighlightTimer, [clearHighlightTimer]);

  const scrollToItem = useCallback((targetItemId: string, attempt = 0) => {
    const row = rowRefs.current.get(targetItemId);
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (!row || !content || !scroll) {
      if (attempt < 20) {
        setTimeout(() => scrollToItem(targetItemId, attempt + 1), 50);
      }
      return;
    }

    row.measureLayout(
      content,
      (_x, y) => {
        scroll.scrollTo({ y: Math.max(0, y - 12), animated: true });
      },
      () => {
        if (attempt < 20) {
          setTimeout(() => scrollToItem(targetItemId, attempt + 1), 50);
        }
      },
    );
  }, []);

  const focusItem = useCallback(
    (targetItemId: string) => {
      clearHighlightTimer();
      setHighlightedItemId(targetItemId);
      scrollToItem(targetItemId);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedItemId(null);
        highlightTimerRef.current = null;
      }, 2200);
    },
    [clearHighlightTimer, scrollToItem],
  );

  useEffect(() => {
    if (!itemId || loading || items.length === 0) return;
    if (scrolledToItemRef.current === itemId) return;
    if (!items.some((item) => item.id === itemId)) return;

    scrolledToItemRef.current = itemId;
    // アーカイブ展開や初回レイアウト待ちのため、少し長めに遅延
    const delay = forceArchiveExpanded ? 320 : 160;
    const timer = setTimeout(() => focusItem(itemId), delay);
    return () => clearTimeout(timer);
  }, [itemId, loading, items, focusItem, forceArchiveExpanded]);

  const registerItemRef = useCallback((targetItemId: string, node: View | null) => {
    if (node) rowRefs.current.set(targetItemId, node);
    else rowRefs.current.delete(targetItemId);
  }, []);

  const handleQuickAction = useCallback(
    (mode: ChatMode, targetItemId: string, seedText: string) => {
      setComposerMode(mode);
      setComposerText(seedText);
      setParentItemId(targetItemId);
    },
    [],
  );

  const handleRetryAgent = useCallback(
    (resultItemId: string) => {
      const result = items.find((row) => row.id === resultItemId);
      if (!result) return;
      const request = result.parent_item_id
        ? items.find((row) => row.id === result.parent_item_id)
        : null;
      const mode = resolveAgentMode(
        result.agent_mode,
        request?.body ?? '',
        request?.agent_mode,
      );
      void retryAgentJob(resultItemId, mode);
    },
    [items, retryAgentJob],
  );

  const handleSent = useCallback(() => {
    setComposerText('');
    setParentItemId(null);
    void refresh(true);
  }, [refresh]);

  const handleArchive = useCallback(
    (targetItemId: string) => {
      if (!note) return;
      void archiveQuestion(targetItemId, note.id);
    },
    [archiveQuestion, note],
  );

  const handleUnarchive = useCallback(
    (targetItemId: string) => {
      if (!note) return;
      void unarchiveQuestion(targetItemId, note.id);
    },
    [note, unarchiveQuestion],
  );

  const handleSubmitThought = useCallback(
    async (targetItemId: string, text: string) => {
      if (!note) return false;
      return addThought(targetItemId, note.id, text);
    },
    [addThought, note],
  );

  const handleUpdateThought = useCallback(
    async (thoughtId: string, text: string) => {
      if (!note) return false;
      return updateThought(thoughtId, note.id, text);
    },
    [note, updateThought],
  );

  const handleDeleteThought = useCallback(
    async (thoughtId: string) => {
      if (!note) return false;
      return deleteThought(thoughtId, note.id);
    },
    [deleteThought, note],
  );

  const handleRequestDraft = useCallback(
    async (targetItemId: string) => {
      if (!note) return null;
      return requestDraft(targetItemId, note.id);
    },
    [note, requestDraft],
  );

  const scrollToComposer = useCallback(() => {
    if (inlineInputOwnerId) return;
    const scroll = () => scrollRef.current?.scrollToEnd({ animated: true });
    scroll();
    if (Platform.OS === 'ios') {
      setTimeout(scroll, 100);
    }
  }, [inlineInputOwnerId]);

  const handleInlineInputActiveChange = useCallback(
    (questionId: string, active: boolean) => {
      setInlineInputOwnerId((prev) => {
        if (active) {
          setInlineDraftEmpty(true);
          return questionId;
        }
        if (prev === questionId) return null;
        return prev;
      });
    },
    [],
  );

  const handleInlineDraftEmptyChange = useCallback(
    (_questionId: string, empty: boolean) => {
      setInlineDraftEmpty(empty);
    },
    [],
  );

  const dismissEmptyInlineThought = useCallback(() => {
    if (!inlineInputOwnerId) return;
    if (!inlineDraftEmpty) return;
    setDismissEmptySignal((n) => n + 1);
  }, [inlineInputOwnerId, inlineDraftEmpty]);

  // 一言オープン時は該当問いへ寄せる（composer 退避で余白が変わるため少し遅延）
  useEffect(() => {
    if (!inlineInputOwnerId) return;
    const timer = setTimeout(() => scrollToItem(inlineInputOwnerId), 80);
    return () => clearTimeout(timer);
  }, [inlineInputOwnerId, scrollToItem]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const showSub = Keyboard.addListener('keyboardWillShow', () => {
      // 一言入力中に末尾へ飛ばすと宛先を見失う
      if (inlineInputOwnerId) {
        scrollToItem(inlineInputOwnerId);
        return;
      }
      scrollRef.current?.scrollToEnd({ animated: true });
    });

    return () => showSub.remove();
  }, [inlineInputOwnerId, scrollToItem]);

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

  const hasTranscript = note.is_video && note.transcript_status === 'done' && !!note.video_transcript;
  const bannerError = thoughtError ?? archiveError ?? generateError ?? deleteError ?? retryAgentError;
  const clearBannerError = () => {
    clearThoughtError();
    clearArchiveError();
    clearGenerateError();
    clearDeleteError();
    clearRetryAgentError();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.flex}
      >
          <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            inlineInputOwnerId ? styles.contentWithInlineThought : null,
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
          }
        >
          <Pressable
            accessible={false}
            onPress={dismissEmptyInlineThought}
            style={styles.scrollPressable}
          >
          <RootMemoCard
            note={note}
            hasDoneQuestion={items.some(
              (item) => item.kind === 'question' && item.status === 'done',
            )}
            onRefresh={() => void refresh(true)}
            deleting={deleting}
            onDelete={() => {
              void (async () => {
                const ok = await deleteNote(note.id);
                if (ok) router.replace('/(tabs)');
              })();
            }}
          />

          {bannerError ? (
            <ErrorBanner message={bannerError} onDismiss={clearBannerError} />
          ) : null}

          <View ref={contentRef} style={styles.rail}>
            {isProcessing && !items.some((item) => item.kind === 'question') ? (
              <View style={styles.processingBox}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.processingText}>
                  {items.length === 0
                    ? !note.type
                      ? '分類中…'
                      : note.is_video && note.transcript_status === 'pending'
                        ? '文字起こし・要約・問いを生成中…'
                        : '要約・問いを生成中…'
                    : '問いを生成中…'}
                </Text>
              </View>
            ) : null}

            {activeItems.map((item) => (
              <ThreadItemView
                key={item.id}
                item={item}
                noteId={note.id}
                noteType={note.type}
                highlighted={highlightedItemId === item.id}
                highlightedItemId={highlightedItemId}
                tutorialEmphasized={
                  threadTutorialVisible &&
                  (item.id === firstSummaryId || item.id === firstQuestionId)
                }
                registerItemRef={registerItemRef}
                childrenByParent={childrenByParent}
                noteIsVideo={hasTranscript}
                updatingQuestionId={updatingId}
                thoughtSubmittingId={thoughtSubmittingId}
                updatingThoughtId={updatingThoughtId}
                draftingThoughtId={draftingQuestionId}
                retrying={retryingId === item.id}
                onQuickAction={handleQuickAction}
                onRetryAgent={handleRetryAgent}
                onSubmitThought={handleSubmitThought}
                onUpdateThought={handleUpdateThought}
                onDeleteThought={handleDeleteThought}
                onRequestDraft={handleRequestDraft}
                onArchive={handleArchive}
                onInlineInputActiveChange={handleInlineInputActiveChange}
                onInlineDraftEmptyChange={handleInlineDraftEmptyChange}
                dismissEmptySignal={dismissEmptySignal}
                activeInlineQuestionId={inlineInputOwnerId}
              />
            ))}

            {showGenerateMore ? (
              <GenerateMoreQuestions
                disabled={generating}
                loading={generating}
                onPress={() => void generateMore()}
              />
            ) : null}

            <ArchivedQuestionsSection
              items={archivedQuestions}
              noteId={note.id}
              noteType={note.type}
              noteIsVideo={hasTranscript}
              childrenByParent={childrenByParent}
              highlightedItemId={highlightedItemId}
              updatingId={updatingId}
              thoughtSubmittingId={thoughtSubmittingId}
              updatingThoughtId={updatingThoughtId}
              draftingThoughtId={draftingQuestionId}
              forceExpanded={forceArchiveExpanded}
              registerItemRef={registerItemRef}
              onQuickAction={handleQuickAction}
              onSubmitThought={handleSubmitThought}
              onUpdateThought={handleUpdateThought}
              onDeleteThought={handleDeleteThought}
              onRequestDraft={handleRequestDraft}
              onUnarchive={handleUnarchive}
              onInlineInputActiveChange={handleInlineInputActiveChange}
              onInlineDraftEmptyChange={handleInlineDraftEmptyChange}
              dismissEmptySignal={dismissEmptySignal}
              activeInlineQuestionId={inlineInputOwnerId}
            />

            {items.length === 0 && !isProcessing ? (
              <EmptyState
                title="スレッドは空です"
                description={
                  note.type === 'task'
                    ? 'やることメモは問いを生成しません。'
                    : note.type === 'ref'
                      ? '保存メモです。必要なときに開いてください。'
                      : note.type === 'feeling'
                        ? '感情メモは、そっと置く振り返りの問いだけが添われます。'
                        : '問いが生成されなかったか、処理に失敗した可能性があります。'
                }
              />
            ) : null}
          </View>
          </Pressable>
        </ScrollView>

        {/* 一言／編集中は下の composer を退避し、宛先の混乱を防ぐ */}
        {!inlineInputOwnerId ? (
          <ThreadComposer
            noteId={note.id}
            noteType={note.type}
            parentItemId={parentItemId}
            initialMode={composerMode}
            initialText={composerText}
            onSent={handleSent}
            onInputFocus={scrollToComposer}
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
  },
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 24,
  },
  /** 一言入力＋キーボード時に末尾が隠れない余白 */
  contentWithInlineThought: {
    paddingBottom: 48,
  },
  scrollPressable: {
    flexGrow: 1,
  },
  rail: {
    borderLeftColor: '#e0ddd2',
    borderLeftWidth: 2,
    marginLeft: 8,
    marginTop: 4,
    paddingLeft: 16,
  },
  processingBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  processingText: {
    color: colors.sub,
    fontSize: 15,
  },
});
}
