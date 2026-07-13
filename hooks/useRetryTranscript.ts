import { useCallback, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';

/**
 * 止まっているメモの処理を再開する。
 * - 未分類 → classify-note
 * - 分類済み（主に動画）→ fetch-transcript（要約・問いも含む）
 */
export function useRetryNotePipeline(
  noteId: string,
  options: { needsClassify: boolean },
  onDone?: () => void,
) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      if (options.needsClassify) {
        await invokeFunction('classify-note', { note_id: noteId });
      } else {
        await invokeFunction('fetch-transcript', { note_id: noteId });
      }
      onDone?.();
    } catch (err) {
      setError(formatApiError(err, '再実行に失敗しました'));
    } finally {
      setRetrying(false);
    }
  }, [noteId, onDone, options.needsClassify]);

  return { retry, retrying, error };
}

/** @deprecated useRetryNotePipeline を使う */
export function useRetryTranscript(noteId: string, onDone?: () => void) {
  return useRetryNotePipeline(noteId, { needsClassify: false }, onDone);
}
