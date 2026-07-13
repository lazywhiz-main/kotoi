import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorBanner } from '@/components/ErrorBanner';
import { useChatTurn } from '@/hooks/useChatTurn';
import { type ColorPalette } from '@/lib/theme';
import { CHAT_MODE_HINT, CHAT_MODE_LABEL, type ChatMode } from '@/lib/types';
import { useEffect, useMemo, useState } from 'react';
import { useColors } from '@/providers/ThemeProvider';

const MODES: ChatMode[] = ['note', 'ask', 'research', 'dig'];

type Props = {
  noteId: string;
  noteType?: string | null;
  parentItemId?: string | null;
  initialMode?: ChatMode;
  initialText?: string;
  onSent?: () => void;
  onInputFocus?: () => void;
};

export function ThreadComposer({
  noteId,
  noteType,
  parentItemId,
  initialMode = 'note',
  initialText = '',
  onSent,
  onInputFocus,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [text, setText] = useState(initialText);
  const {
    send,
    confirmApproval,
    cancelApproval,
    submitting,
    error,
    approval,
    clearError,
  } = useChatTurn(noteId, onSent);

  const availableModes = useMemo(
    () => (noteType === 'feeling' ? (['note', 'ask'] as ChatMode[]) : MODES),
    [noteType],
  );

  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode('note');
    }
  }, [availableModes, mode]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const ok = await send(mode, text.trim(), parentItemId);
    if (ok) setText('');
  };

  const placeholders: Record<ChatMode, string> = {
    note: '追記を書く…',
    ask: '質問を書く…',
    research: '調べてほしいことを書く…',
    dig: '深掘りしてほしい前提を書く…',
  };

  return (
    <View style={styles.wrap}>
      {approval ? (
        <View style={styles.approvalBox}>
          <Text style={styles.approvalTitle}>
            {CHAT_MODE_LABEL[approval.mode]}を実行します
          </Text>
          <Text style={styles.approvalBody}>
            目安コスト: ${approval.estimated_cost_usd.toFixed(2)} / 本日 $
            {approval.today_cost_usd.toFixed(2)}（上限 $
            {approval.daily_limit_usd.toFixed(2)}）
          </Text>
          <View style={styles.approvalActions}>
            <Pressable onPress={cancelApproval} style={styles.approvalCancel}>
              <Text style={styles.approvalCancelText}>キャンセル</Text>
            </Pressable>
            <Pressable
              disabled={submitting}
              onPress={() => void confirmApproval()}
              style={styles.approvalGo}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.approvalGoText}>GO</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.hint}>
        {noteType === 'feeling' ? '感情メモは追記と質問だけ。分析や調査は控えめに。' : CHAT_MODE_HINT[mode]}
      </Text>
      <View style={styles.intents}>
        {availableModes.map((item) => (
          <Pressable
            key={item}
            onPress={() => setMode(item)}
            style={[styles.intent, mode === item && styles.intentSelected]}
          >
            <Text style={[styles.intentText, mode === item && styles.intentTextSelected]}>
              {item === 'note' ? `＋ ${CHAT_MODE_LABEL[item]}` : CHAT_MODE_LABEL[item]}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          multiline
          placeholder={placeholders[mode]}
          placeholderTextColor={colors.hint}
          style={styles.input}
          value={text}
          onFocus={onInputFocus}
          onChangeText={(value) => {
            setText(value);
            if (error) clearError();
          }}
        />
        <Pressable
          disabled={submitting || !text.trim()}
          onPress={() => void handleSend()}
          style={({ pressed }) => [
            styles.send,
            (pressed || submitting || !text.trim()) && styles.sendPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Text style={styles.sendIcon}>↑</Text>
          )}
        </Pressable>
      </View>
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  wrap: {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: Platform.OS === 'ios' ? 6 : 12,
  },
  hint: {
    color: colors.hint,
    fontSize: 13,
    marginBottom: 7,
    marginLeft: 4,
  },
  intents: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  intent: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  intentSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  intentText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  intentTextSelected: {
    color: colors.onAccent,
  },
  inputRow: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 5,
    paddingVertical: 5,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    maxHeight: 88,
    minHeight: 34,
    paddingVertical: 4,
  },
  send: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  sendPressed: {
    opacity: 0.65,
  },
  sendIcon: {
    color: colors.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
  approvalBox: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12,
  },
  approvalTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  approvalBody: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  approvalCancel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  approvalCancelText: {
    color: colors.sub,
    fontSize: 15,
  },
  approvalGo: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  approvalGoText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
});
}
