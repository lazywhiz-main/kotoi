import { useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ThoughtActionMenu,
  type ThoughtMenuAnchor,
  ThoughtDeleteConfirm,
} from '@/components/ThoughtContextMenu';
import { getQuestionColors, type ColorPalette } from '@/lib/theme';
import { QUESTION_LABEL, type QuestionType } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

type ThoughtMenuState = {
  id: string;
  body: string;
  anchor: ThoughtMenuAnchor;
};

type DeleteConfirmState = {
  id: string;
  preview: string;
};

type Thought = {
  id: string;
  body: string;
};

type Props = {
  body: string;
  questionType: QuestionType;
  pending?: boolean;
  archived?: boolean;
  compact?: boolean;
  /** チュートリアル初回など、既存カードを壊さず枠だけ少し際立たせる */
  emphasized?: boolean;
  /** 探究などから飛んできたときの一時フォーカス */
  focused?: boolean;
  thoughts?: Thought[];
  submittingThought?: boolean;
  draftingThought?: boolean;
  updatingThoughtId?: string | null;
  thoughtMaxLength?: number;
  onResearch?: () => void;
  onDeepdive?: () => void;
  onSubmitThought?: (text: string) => void | Promise<boolean | void>;
  onUpdateThought?: (thoughtId: string, text: string) => void | Promise<boolean | void>;
  onDeleteThought?: (thoughtId: string) => void | Promise<boolean | void>;
  onRequestDraft?: () => void | Promise<string | null>;
  /**
   * インライン入力（一言／編集）の開閉。
   * 親がスレッド composer を隠すために使う。
   */
  onInlineInputActiveChange?: (active: boolean) => void;
  /** 一言下書きが空か（欄外タップで閉じる判定用） */
  onInlineDraftEmptyChange?: (empty: boolean) => void;
  /** 親からの「空なら閉じる」要求（欄外タップ） */
  dismissEmptySignal?: number;
  /** このカードの問い id（同時に一つのインライン入力にするため） */
  questionId?: string;
  /** いまインライン入力中の問い id */
  activeInlineQuestionId?: string | null;
};

export function QuestionCard({
  body,
  questionType,
  pending,
  archived,
  compact,
  emphasized,
  focused,
  thoughts = [],
  submittingThought,
  draftingThought,
  updatingThoughtId,
  thoughtMaxLength = 200,
  onResearch,
  onDeepdive,
  onSubmitThought,
  onUpdateThought,
  onDeleteThought,
  onRequestDraft,
  onInlineInputActiveChange,
  onInlineDraftEmptyChange,
  dismissEmptySignal = 0,
  questionId,
  activeInlineQuestionId,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingThoughtId, setEditingThoughtId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [thoughtMenu, setThoughtMenu] = useState<ThoughtMenuState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const thoughtRowRefs = useRef<Map<string, View | null>>(new Map());
  const lastDismissSignal = useRef(0);
  const tag = getQuestionColors(colors)[questionType];
  const showActions = !pending && !archived && (onResearch || onDeepdive);
  const showThoughtAction = !pending && !archived && !!onSubmitThought;
  const inlineInputActive = thoughtOpen || !!editingThoughtId;
  const thoughtDraftEmpty = !draft.trim();

  useEffect(() => {
    onInlineInputActiveChange?.(inlineInputActive);
  }, [inlineInputActive, onInlineInputActiveChange]);

  useEffect(() => {
    if (!thoughtOpen) return;
    onInlineDraftEmptyChange?.(thoughtDraftEmpty);
  }, [thoughtOpen, thoughtDraftEmpty, onInlineDraftEmptyChange]);

  useEffect(() => {
    return () => {
      onInlineInputActiveChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 別の問いで一言が開いたら、こちらは閉じる（composer 退避と整合）
  useEffect(() => {
    if (!questionId || !activeInlineQuestionId) return;
    if (activeInlineQuestionId === questionId) return;
    if (!thoughtOpen && !editingThoughtId) return;
    Keyboard.dismiss();
    setThoughtOpen(false);
    setDraft('');
    setEditingThoughtId(null);
    setEditDraft('');
  }, [activeInlineQuestionId, questionId, thoughtOpen, editingThoughtId]);

  const closeThoughtComposer = () => {
    Keyboard.dismiss();
    setDraft('');
    setThoughtOpen(false);
  };

  // 欄外タップ（空の一言のみ）
  useEffect(() => {
    if (!dismissEmptySignal || dismissEmptySignal === lastDismissSignal.current) return;
    lastDismissSignal.current = dismissEmptySignal;
    if (!thoughtOpen) return;
    if (draft.trim()) return;
    if (submittingThought || draftingThought) return;
    closeThoughtComposer();
    // closeThoughtComposer は安定参照にしない（都度定義）ので draft/thoughtOpen を依存に含める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissEmptySignal, thoughtOpen, draft, submittingThought, draftingThought]);

  const handleSubmitThought = async () => {
    const text = draft.trim();
    if (!text || submittingThought || !onSubmitThought) return;
    const ok = await onSubmitThought(text);
    if (ok === false) return;
    Keyboard.dismiss();
    setDraft('');
    setThoughtOpen(false);
  };

  const handleRequestDraft = async () => {
    if (!onRequestDraft || draftingThought) return;
    const text = await onRequestDraft();
    if (text) setDraft(text);
  };

  const handleSaveEdit = async () => {
    if (!editingThoughtId || !onUpdateThought) return;
    const ok = await onUpdateThought(editingThoughtId, editDraft);
    if (ok === false) return;
    Keyboard.dismiss();
    setEditingThoughtId(null);
    setEditDraft('');
  };

  const openThoughtMenu = (thoughtId: string, thoughtBody: string) => {
    if (archived || (!onUpdateThought && !onDeleteThought)) return;

    const row = thoughtRowRefs.current.get(thoughtId);
    row?.measureInWindow((x, y, width, height) => {
      setThoughtMenu({
        id: thoughtId,
        body: thoughtBody,
        anchor: { x, y, width, height },
      });
    });
  };

  const startDeleteThought = (thoughtId: string, body: string) => {
    if (!onDeleteThought) return;
    const preview = body.length > 40 ? `${body.slice(0, 40)}…` : body;
    setDeleteConfirm({ id: thoughtId, preview });
  };

  return (
    <View style={[styles.item, archived && styles.itemArchived]}>
      <View style={styles.who}>
        <Text style={styles.whoLabel}>{archived ? 'アーカイブ' : '問い'}</Text>
        {!pending ? (
          <View style={[styles.qtag, { backgroundColor: tag.bg }]}>
            <Text style={[styles.qtagText, { color: tag.text }]}>{QUESTION_LABEL[questionType]}</Text>
          </View>
        ) : null}
      </View>
      <View
        style={[
          styles.card,
          archived && styles.cardArchived,
          compact && styles.cardCompact,
          (emphasized || focused) && styles.cardFocused,
        ]}
      >
        {pending ? (
          <View style={styles.pendingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.pendingText}>{body}</Text>
          </View>
        ) : (
          <Text selectable style={[styles.body, compact && styles.bodyCompact]}>{body}</Text>
        )}
        {thoughts.length > 0 ? (
          <View style={styles.thoughts}>
            {thoughts.map((thought) => {
              const isEditing = editingThoughtId === thought.id;
              const isUpdating = updatingThoughtId === thought.id;

              if (isEditing) {
                return (
                  <View key={thought.id} style={styles.thoughtEditBox}>
                    <TextInput
                      autoFocus
                      editable={!isUpdating}
                      maxLength={thoughtMaxLength}
                      onChangeText={setEditDraft}
                      style={styles.thoughtInputStandalone}
                      value={editDraft}
                    />
                    <View style={styles.thoughtActions}>
                      <Pressable
                        disabled={isUpdating}
                        onPress={() => {
                          Keyboard.dismiss();
                          setEditingThoughtId(null);
                          setEditDraft('');
                        }}
                        style={styles.thoughtCancel}
                      >
                        <Text style={styles.thoughtCancelText}>やめる</Text>
                      </Pressable>
                      <Pressable
                        disabled={!editDraft.trim() || isUpdating}
                        onPress={() => void handleSaveEdit()}
                        style={({ pressed }) => [
                          styles.thoughtSave,
                          (!editDraft.trim() || isUpdating || pressed) && styles.thoughtSaveDisabled,
                        ]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator color={colors.ink} size="small" />
                        ) : (
                          <Text style={styles.thoughtSaveText}>保存</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                );
              }

              return (
                <Pressable
                  key={thought.id}
                  ref={(node) => {
                    if (node) thoughtRowRefs.current.set(thought.id, node);
                    else thoughtRowRefs.current.delete(thought.id);
                  }}
                  delayLongPress={320}
                  disabled={
                    !!updatingThoughtId ||
                    archived ||
                    (!onUpdateThought && !onDeleteThought)
                  }
                  onLongPress={() => openThoughtMenu(thought.id, thought.body)}
                  style={({ pressed }) => [
                    styles.thoughtRow,
                    pressed && styles.thoughtRowPressed,
                  ]}
                >
                  <Text style={styles.thoughtLine}>↳ {thought.body}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {thoughtOpen ? (
          <Pressable onPress={() => {}} accessibilityRole="none">
            <View style={styles.thoughtComposer}>
            <Text style={styles.thoughtDestLabel}>この問いに一言</Text>
            <View style={styles.thoughtInputRow}>
              <Text style={styles.thoughtPrefix} accessibilityElementsHidden>
                ↳
              </Text>
              <TextInput
                autoFocus
                editable={!submittingThought && !draftingThought}
                maxLength={thoughtMaxLength}
                multiline
                onChangeText={setDraft}
                placeholder="いまの考えを一言"
                placeholderTextColor={colors.hint}
                style={styles.thoughtInput}
                value={draft}
                blurOnSubmit={false}
              />
              {onRequestDraft ? (
                <Pressable
                  accessibilityLabel="たたき台をもらう"
                  disabled={submittingThought || draftingThought}
                  hitSlop={8}
                  onPress={() => void handleRequestDraft()}
                  style={({ pressed }) => [
                    styles.draftBtn,
                    (submittingThought || draftingThought || pressed) && styles.draftBtnPressed,
                  ]}
                >
                  {draftingThought ? (
                    <ActivityIndicator color={colors.sub} size="small" />
                  ) : (
                    <Text style={styles.draftBtnIcon}>✦</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
            <View style={styles.thoughtActions}>
              <Pressable
                disabled={submittingThought || draftingThought}
                onPress={closeThoughtComposer}
                style={styles.thoughtCancel}
              >
                <Text style={styles.thoughtCancelText}>やめる</Text>
              </Pressable>
              <Pressable
                disabled={!draft.trim() || submittingThought || draftingThought}
                onPress={() => void handleSubmitThought()}
                style={({ pressed }) => [
                  styles.thoughtSave,
                  (!draft.trim() || submittingThought || draftingThought || pressed) &&
                    styles.thoughtSaveDisabled,
                ]}
              >
                {submittingThought ? (
                  <ActivityIndicator color={colors.ink} size="small" />
                ) : (
                  <Text style={styles.thoughtSaveText}>残す</Text>
                )}
              </Pressable>
            </View>
            </View>
          </Pressable>
        ) : null}
        {showActions || showThoughtAction ? (
          <View style={styles.actions}>
            {showThoughtAction && !thoughtOpen ? (
              <Pressable
                disabled={submittingThought || draftingThought}
                onPress={() => {
                  // composer 退避を先に伝え、キーボード競合を減らす
                  onInlineInputActiveChange?.(true);
                  setThoughtOpen(true);
                }}
                style={styles.actionBtn}
              >
                <View style={styles.actionBtnInner}>
                  <Text style={styles.actionBtnIcon}>✦</Text>
                  <Text style={styles.actionText}>一言つける</Text>
                </View>
              </Pressable>
            ) : null}
            {showActions ? (
              <>
                {onResearch ? (
                  <Pressable onPress={onResearch} style={styles.actionBtn}>
                    <Text style={styles.actionText}>調べる</Text>
                  </Pressable>
                ) : null}
                {onDeepdive ? (
                  <Pressable onPress={onDeepdive} style={styles.actionBtn}>
                    <Text style={styles.actionText}>深掘り</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      <ThoughtActionMenu
        anchor={thoughtMenu?.anchor ?? null}
        canDelete={!!onDeleteThought}
        canEdit={!!onUpdateThought}
        onClose={() => setThoughtMenu(null)}
        onDelete={() => {
          if (!thoughtMenu) return;
          startDeleteThought(thoughtMenu.id, thoughtMenu.body);
        }}
        onEdit={() => {
          if (!thoughtMenu) return;
          onInlineInputActiveChange?.(true);
          setEditingThoughtId(thoughtMenu.id);
          setEditDraft(thoughtMenu.body);
          setThoughtOpen(false);
        }}
        visible={!!thoughtMenu}
      />

      <ThoughtDeleteConfirm
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (!deleteConfirm || !onDeleteThought) return;
          void onDeleteThought(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        preview={deleteConfirm?.preview ?? ''}
        visible={!!deleteConfirm}
      />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  item: {
    marginBottom: 12,
  },
  itemArchived: {
    opacity: 0.9,
  },
  who: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginBottom: 5,
  },
  whoLabel: {
    color: colors.sub,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  /** フォーカス／チュートリアル: 外枠を足さず、面と線だけ少し起こす */
  cardFocused: {
    backgroundColor: colors.input,
    borderColor: colors.lineStrong,
  },
  cardArchived: {
    backgroundColor: colors.input,
  },
  cardCompact: {
    paddingVertical: 9,
  },
  body: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
  },
  bodyCompact: {
    fontSize: 15,
    lineHeight: 22,
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
  thoughts: {
    gap: 8,
    marginTop: 8,
  },
  thoughtRow: {
    borderRadius: 6,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  thoughtRowPressed: {
    backgroundColor: colors.input,
  },
  thoughtLine: {
    color: colors.sub,
    fontSize: 15,
    lineHeight: 22,
  },
  thoughtEditBox: {
    gap: 6,
  },
  thoughtComposer: {
    marginTop: 9,
  },
  thoughtDestLabel: {
    color: colors.hint,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  thoughtInputRow: {
    alignItems: 'flex-end',
    backgroundColor: colors.input,
    borderColor: colors.lineStrong,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
  },
  thoughtPrefix: {
    color: colors.hint,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: 8,
    paddingTop: 6,
  },
  thoughtInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 36,
    paddingVertical: 6,
  },
  draftBtn: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  draftBtnPressed: {
    backgroundColor: colors.cardElevated,
    opacity: 0.85,
  },
  draftBtnIcon: {
    color: colors.sub,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 20,
  },
  thoughtInputStandalone: {
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: 9,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thoughtActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  thoughtCancel: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  thoughtCancelText: {
    color: colors.hint,
    fontSize: 14,
  },
  thoughtSave: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 9,
    borderWidth: 1,
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  thoughtSaveDisabled: {
    opacity: 0.55,
  },
  thoughtSaveText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  actionBtn: {
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionBtnInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  actionBtnIcon: {
    color: colors.sub,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  actionText: {
    color: colors.sub,
    fontSize: 15,
  },
});
}
