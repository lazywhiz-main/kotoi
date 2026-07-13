import { useCallback, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';
import type {
  ChatMode,
  ChatTurnApprovalResponse,
  ChatTurnSuccessResponse,
} from '@/lib/types';

type PendingPayload = {
  mode: ChatMode;
  text: string;
  parentItemId?: string | null;
};

export function useChatTurn(noteId: string, onSent?: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState<ChatTurnApprovalResponse | null>(null);
  const [pending, setPending] = useState<PendingPayload | null>(null);

  const send = useCallback(
    async (
      mode: ChatMode,
      text: string,
      parentItemId?: string | null,
      approved = false,
    ) => {
      setSubmitting(true);
      setError(null);

      try {
        const result = await invokeFunction<
          ChatTurnApprovalResponse | ChatTurnSuccessResponse | { error: string }
        >('chat-turn', {
          note_id: noteId,
          mode,
          text,
          parent_item_id: parentItemId ?? undefined,
          approved,
        });

        if ('error' in result && result.error) {
          setError(formatApiError(result.error, '送信に失敗しました'));
          return false;
        }

        if ('requires_approval' in result && result.requires_approval) {
          setApproval(result);
          setPending({ mode, text, parentItemId });
          return false;
        }

        setApproval(null);
        setPending(null);
        onSent?.();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : '送信に失敗しました');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [noteId, onSent],
  );

  const confirmApproval = useCallback(async () => {
    if (!pending) return false;
    return send(pending.mode, pending.text, pending.parentItemId, true);
  }, [pending, send]);

  const cancelApproval = useCallback(() => {
    setApproval(null);
    setPending(null);
  }, []);

  return {
    send,
    confirmApproval,
    cancelApproval,
    submitting,
    error,
    approval,
    clearError: () => setError(null),
  };
}
