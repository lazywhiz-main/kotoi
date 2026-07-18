import { AnswerCard } from '@/components/AnswerCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { QuestionCard } from '@/components/QuestionCard';
import { ResultCard } from '@/components/ResultCard';
import { SummaryCard } from '@/components/SummaryCard';
import { SwipeableQuestion } from '@/components/SwipeableQuestion';
import { UserItemCard } from '@/components/UserItemCard';
import { type ColorPalette } from '@/lib/theme';
import type { ChatMode, ThreadItem } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  item: ThreadItem;
  noteId: string;
  noteType?: string | null;
  archived?: boolean;
  highlighted?: boolean;
  /** ハイライト対象の問い id（結果から生えた問いも含む） */
  highlightedItemId?: string | null;
  /** 問いカードの位置登録（トップレベル／結果から生えた問い共通） */
  registerItemRef?: (itemId: string, node: View | null) => void;
  childrenByParent: Map<string, ThreadItem[]>;
  noteIsVideo?: boolean;
  noteHasArticle?: boolean;
  updatingQuestionId?: string | null;
  /** 一言送信中の問い id */
  thoughtSubmittingId?: string | null;
  draftingThoughtId?: string | null;
  updatingThoughtId?: string | null;
  retrying?: boolean;
  onQuickAction?: (mode: ChatMode, parentItemId: string, seedText: string) => void;
  onRetryAgent?: (resultItemId: string) => void;
  onSubmitThought?: (itemId: string, text: string) => Promise<boolean>;
  onUpdateThought?: (thoughtId: string, text: string) => Promise<boolean>;
  onDeleteThought?: (thoughtId: string) => Promise<boolean>;
  onRequestDraft?: (itemId: string) => Promise<string | null>;
  onArchive?: (itemId: string) => void;
  onUnarchive?: (itemId: string) => void;
  /** チュートリアル: このアイテムのカード枠を少し強調 */
  tutorialEmphasized?: boolean;
  /** 一言／編集インライン入力の開閉（スレッド composer 退避用） */
  onInlineInputActiveChange?: (questionId: string, active: boolean) => void;
  onInlineDraftEmptyChange?: (questionId: string, empty: boolean) => void;
  dismissEmptySignal?: number;
  activeInlineQuestionId?: string | null;
};

export function ThreadItemView({
  item,
  noteId,
  noteType,
  archived,
  highlighted,
  highlightedItemId,
  registerItemRef,
  childrenByParent,
  noteIsVideo,
  noteHasArticle,
  updatingQuestionId,
  thoughtSubmittingId,
  draftingThoughtId,
  updatingThoughtId,
  retrying,
  onQuickAction,
  onRetryAgent,
  onSubmitThought,
  onUpdateThought,
  onDeleteThought,
  onRequestDraft,
  onArchive,
  onUnarchive,
  tutorialEmphasized,
  onInlineInputActiveChange,
  onInlineDraftEmptyChange,
  dismissEmptySignal,
  activeInlineQuestionId,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const children = childrenByParent.get(item.id) ?? [];

  const renderQuestion = (
    question: ThreadItem,
    options?: { lead?: string; emphasized?: boolean },
  ) => {
    if (!question.question_type) return null;

    const isFeeling = noteType === 'feeling';
    const questionChildren = childrenByParent.get(question.id) ?? [];
    const thoughtNotes = questionChildren
      .filter((child) => child.kind === 'note' && child.author === 'user')
      .map((child) => ({ id: child.id, body: child.body }));
    const isArchived = archived || question.answered;
    const isHighlighted =
      highlightedItemId === question.id || (!!highlighted && question.id === item.id);

    const card = (
      <QuestionCard
        body={question.body}
        questionType={question.question_type}
        questionId={question.id}
        activeInlineQuestionId={activeInlineQuestionId}
        pending={question.status === 'pending'}
        emphasized={!!options?.emphasized && question.status !== 'pending'}
        focused={isHighlighted && question.status !== 'pending'}
        archived={isArchived}
        compact={isArchived}
        thoughts={thoughtNotes}
        submittingThought={thoughtSubmittingId === question.id}
        draftingThought={draftingThoughtId === question.id}
        updatingThoughtId={updatingThoughtId}
        onResearch={
          !isFeeling && !isArchived && onQuickAction
            ? () => onQuickAction('research', question.id, `「${question.body}」について調べて。`)
            : undefined
        }
        onDeepdive={
          !isFeeling && !isArchived && onQuickAction
            ? () => onQuickAction('dig', question.id, `「${question.body}」の前提を深掘りして。`)
            : undefined
        }
        onSubmitThought={
          onSubmitThought && !isArchived
            ? (text) => onSubmitThought(question.id, text)
            : undefined
        }
        onUpdateThought={!isArchived ? onUpdateThought : undefined}
        onDeleteThought={!isArchived ? onDeleteThought : undefined}
        onRequestDraft={
          onRequestDraft && !isArchived ? () => onRequestDraft(question.id) : undefined
        }
        onInlineInputActiveChange={
          onInlineInputActiveChange
            ? (active) => onInlineInputActiveChange(question.id, active)
            : undefined
        }
        onInlineDraftEmptyChange={
          onInlineDraftEmptyChange
            ? (empty) => onInlineDraftEmptyChange(question.id, empty)
            : undefined
        }
        dismissEmptySignal={
          activeInlineQuestionId === question.id ? dismissEmptySignal : undefined
        }
      />
    );

    const swipeable = (
      <SwipeableQuestion
        actionColor={isArchived ? colorsRestore : colorsArchive}
        actionLabel={isArchived ? '戻す' : 'アーカイブ'}
        disabled={updatingQuestionId === question.id || question.status === 'pending'}
        onAction={() => {
          if (isArchived) onUnarchive?.(question.id);
          else onArchive?.(question.id);
        }}
      >
        {card}
      </SwipeableQuestion>
    );

    const body = (
      <View>
        {options?.lead ? <Text style={styles.followLead}>{options.lead}</Text> : null}
        {swipeable}
      </View>
    );

    if (registerItemRef) {
      return (
        <View
          ref={(node) => {
            registerItemRef(question.id, node);
          }}
        >
          {body}
        </View>
      );
    }

    return body;
  };

  if (item.kind === 'summary') {
    if (item.status === 'error') {
      return <ErrorBanner message="要約の生成に失敗しました。" />;
    }
    return (
      <SummaryCard
        body={item.body}
        pending={item.status === 'pending'}
        sourceKind={noteIsVideo ? 'video' : noteHasArticle ? 'article' : null}
        noteId={noteId}
        emphasized={tutorialEmphasized && item.status !== 'pending'}
      />
    );
  }

  if (item.kind === 'question' && item.question_type) {
    return renderQuestion(item, {
      emphasized: tutorialEmphasized,
    });
  }

  if (item.kind === 'result') {
    if (item.status === 'error') {
      return (
        <ErrorBanner
          message="うまくいきませんでした。"
          actionLabel={onRetryAgent ? 'もう一度' : undefined}
          onAction={onRetryAgent ? () => onRetryAgent(item.id) : undefined}
          actionBusy={retrying}
        />
      );
    }

    const followUpQuestion =
      children.find((child) => child.kind === 'question' && !child.answered) ?? null;

    return (
      <View>
        <ResultCard body={item.body} pending={item.status === 'pending'} />
        {followUpQuestion ? (
          <View style={styles.followWrap}>
            {renderQuestion(followUpQuestion, {
              lead: '↳ ここから生えた新しい問い',
            })}
          </View>
        ) : null}
      </View>
    );
  }

  if (item.kind === 'answer') {
    return <AnswerCard body={item.body} />;
  }

  if (item.kind === 'note' || item.kind === 'request') {
    if (item.author === 'user') {
      return <UserItemCard body={item.body} kind={item.kind} />;
    }
  }

  return null;
}

const colorsArchive = '#8a8577';
const colorsRestore = '#6b8f71';

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    followWrap: {
      marginTop: 4,
    },
    followLead: {
      color: colors.hint,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.2,
      marginBottom: 5,
    },
  });
}
