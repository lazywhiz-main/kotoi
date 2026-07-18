import { useCallback, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';

export function useGenerateMoreQuestions(noteId: string, onUpdated?: () => void) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateMore = useCallback(async () => {
    setGenerating(true);
    setError(null);

    try {
      const result = await invokeFunction<{ ok?: boolean; questions_count?: number; error?: string }>(
        'generate-questions',
        { note_id: noteId, mode: 'continue' },
      );

      if (result.error) {
        setError(formatApiError(result.error, '問いの生成に失敗しました'));
        return false;
      }

      if ((result.questions_count ?? 0) === 0) {
        setError('いまは追加の問いを作れませんでした。少し時間をおくか、追記してから試してください。');
        onUpdated?.();
        return false;
      }

      onUpdated?.();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '問いの生成に失敗しました');
      return false;
    } finally {
      setGenerating(false);
    }
  }, [noteId, onUpdated]);

  return {
    generateMore,
    generating,
    error,
    clearError: () => setError(null),
  };
}
