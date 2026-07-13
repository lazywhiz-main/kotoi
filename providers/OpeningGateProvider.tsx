import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { isOpeningCompleted, setOpeningCompleted, clearOpeningCompleted } from '@/lib/opening/storage';

type OpeningGateContextValue = {
  completed: boolean | null;
  loading: boolean;
  justFinished: boolean;
  markCompleted: () => Promise<void>;
  resetOpening: () => Promise<void>;
  clearWelcome: () => void;
};

const OpeningGateContext = createContext<OpeningGateContextValue | null>(null);

export function OpeningGateProvider({ children }: { children: React.ReactNode }) {
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    void isOpeningCompleted().then(setCompleted);
  }, []);

  const markCompleted = useCallback(async () => {
    setCompleted(true);
    setJustFinished(true);
    await setOpeningCompleted();
  }, []);

  const resetOpening = useCallback(async () => {
    await clearOpeningCompleted();
    setCompleted(false);
    setJustFinished(false);
  }, []);

  const clearWelcome = useCallback(() => {
    setJustFinished(false);
  }, []);

  const value = useMemo<OpeningGateContextValue>(
    () => ({
      completed,
      loading: completed === null,
      justFinished,
      markCompleted,
      resetOpening,
      clearWelcome,
    }),
    [completed, justFinished, markCompleted, resetOpening, clearWelcome],
  );

  return <OpeningGateContext.Provider value={value}>{children}</OpeningGateContext.Provider>;
}

export function useOpeningGate() {
  const context = useContext(OpeningGateContext);
  if (!context) {
    throw new Error('useOpeningGate must be used within OpeningGateProvider');
  }
  return context;
}
