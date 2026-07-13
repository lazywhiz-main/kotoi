import { useCallback, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';
import type { AgentMode, ChatTurnSuccessResponse } from '@/lib/types';

export function useRetryAgentJob(noteId: string, onDone?: () => void) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(
    async (resultItemId: string, mode: AgentMode) => {
      if (!noteId) {
        setError('メモが見つかりません。');
        return false;
      }

      setRetryingId(resultItemId);
      setError(null);

      try {
        // 「もう一度」押下自体を承認とみなす（Alert 往復で止まらないようにする）
        const result = await invokeFunction<ChatTurnSuccessResponse | { error: string }>(
          'chat-turn',
          {
            note_id: noteId,
            retry_result_item_id: resultItemId,
            mode,
            approved: true,
          },
        );

        if (!result || typeof result !== 'object') {
          setError('再実行に失敗しました');
          return false;
        }

        if ('error' in result && result.error) {
          setError(formatApiError(result.error, '再実行に失敗しました'));
          return false;
        }

        if (!('ok' in result) || !result.ok) {
          setError('再実行に失敗しました');
          return false;
        }

        onDone?.();
        return true;
      } catch (err) {
        setError(formatApiError(err, '再実行に失敗しました'));
        return false;
      } finally {
        setRetryingId(null);
      }
    },
    [noteId, onDone],
  );

  return {
    retry,
    retryingId,
    error,
    clearError: () => setError(null),
  };
}
