import { useCallback, useEffect, useState } from 'react';

import { ApiFunctionError, invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';
import { GRAPHIC_REC_STORAGE_BUCKET } from '@/lib/graphicRecSpec';
import { getSupabase } from '@/lib/supabase';
import type { GraphicRecVariant } from '@/lib/types';

type GenerateGraphicRecResponse = {
  ok?: boolean;
  error?: string;
  processing?: boolean;
  graphic_rec_status?: string;
  variant?: GraphicRecVariant;
  selection_reason?: string;
  storage_path?: string;
  generated_at?: string;
  prompt_version?: string;
};

export type GraphicRecGenerateResult =
  | { ok: true; data: GenerateGraphicRecResponse }
  | { ok: false; paywall: true; reason: string }
  | { ok: false; paywall?: false; message: string };

export function useExplorationGraphicRec(
  explorationId: string | undefined,
  storagePath: string | null | undefined,
  graphicRecStatus: string | null | undefined,
  onStatusChange?: () => void,
) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSignedUrl = useCallback(async (path: string) => {
    const supabase = getSupabase();
    if (!supabase) return null;

    setLoadingUrl(true);
    const { data, error: urlError } = await supabase.storage
      .from(GRAPHIC_REC_STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60);

    setLoadingUrl(false);
    if (urlError || !data?.signedUrl) {
      setError(urlError?.message ?? '画像 URL の取得に失敗しました。');
      setImageUrl(null);
      return null;
    }

    setImageUrl(data.signedUrl);
    setError(null);
    return data.signedUrl;
  }, []);

  useEffect(() => {
    if (!storagePath) {
      setImageUrl(null);
      return;
    }
    void refreshSignedUrl(storagePath);
  }, [storagePath, refreshSignedUrl]);

  useEffect(() => {
    if (graphicRecStatus === 'pending') {
      setPendingSince((prev) => prev ?? Date.now());
      return;
    }
    setPendingSince(null);
  }, [graphicRecStatus]);

  const generate = useCallback(async (): Promise<GraphicRecGenerateResult | null> => {
    if (!explorationId) return null;

    setStarting(true);
    setError(null);
    setPendingSince(Date.now());
    try {
      const result = await invokeFunction<GenerateGraphicRecResponse>(
        'generate-exploration-graphic-rec',
        { exploration_id: explorationId },
      );
      if (result.error) {
        throw new Error(result.error);
      }
      onStatusChange?.();
      return { ok: true, data: result };
    } catch (err) {
      if (err instanceof ApiFunctionError && err.code === 'paywall_required') {
        setPendingSince(null);
        return {
          ok: false,
          paywall: true,
          reason: typeof err.payload.reason === 'string' ? err.payload.reason : 'second_graphic',
        };
      }
      if (err instanceof ApiFunctionError && err.code === 'read_only') {
        setPendingSince(null);
        const message = formatApiError(err);
        setError(message);
        return { ok: false, message };
      }
      const message = formatApiError(err, '見取り図の生成に失敗しました。');
      setError(message);
      setPendingSince(null);
      return { ok: false, message };
    } finally {
      setStarting(false);
    }
  }, [explorationId, onStatusChange]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const isPending = graphicRecStatus === 'pending' || starting;

  return {
    imageUrl,
    loadingUrl,
    generating: isPending,
    pendingSince,
    error,
    generate,
    refreshSignedUrl,
    clearError,
  };
}
