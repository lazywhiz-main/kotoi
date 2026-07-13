import { useEffect, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { parseNoteInput } from '@/lib/parseNoteInput';
import type { LinkPreviewResult } from '@/lib/types';

export function useLinkPreview(text: string) {
  const [preview, setPreview] = useState<LinkPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { source_url } = parseNoteInput(text);
    if (!source_url) {
      setPreview(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void invokeFunction<LinkPreviewResult>('fetch-link-preview', { url: source_url })
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  return { preview, loading, url: parseNoteInput(text).source_url };
}
