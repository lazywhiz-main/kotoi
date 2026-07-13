import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import {
  clearTutorialSeen,
  isTutorialSeen,
  markTutorialSeen,
  type TutorialSceneId,
} from '@/lib/tutorial/storage';

/** 1シーン分の「見た／まだ」フラグ。小さく確認しながら足していく用。 */
export function useTutorialScene(id: TutorialSceneId) {
  const [seen, setSeen] = useState<boolean | null>(null);

  const reload = useCallback(async () => {
    const value = await isTutorialSeen(id);
    setSeen(value);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const markSeen = useCallback(async () => {
    setSeen(true);
    await markTutorialSeen(id);
  }, [id]);

  const reset = useCallback(async () => {
    setSeen(false);
    await clearTutorialSeen(id);
  }, [id]);

  return {
    ready: seen !== null,
    seen: seen === true,
    visible: seen === false,
    markSeen,
    reset,
    reload,
  };
}
