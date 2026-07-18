import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearPassedOpeningThisLaunch,
  hasPassedOpeningThisLaunch,
  markPassedOpeningThisLaunch,
} from '@/lib/opening/launchPass';
import { setOpeningLogoutHandler } from '@/lib/opening/logoutBridge';
import { clearOpeningCompleted, setOpeningCompleted } from '@/lib/opening/storage';
import { useAuth } from '@/providers/AuthProvider';

type OpeningGateContextValue = {
  completed: boolean | null;
  loading: boolean;
  justFinished: boolean;
  markCompleted: () => Promise<void>;
  resetOpening: () => Promise<void>;
  clearWelcome: () => void;
};

const OpeningGateContext = createContext<OpeningGateContextValue | null>(null);

const STABLE_SESSION_MS = 2500;

export function OpeningGateProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [passedOpening, setPassedOpening] = useState(hasPassedOpeningThisLaunch);
  const [justFinished, setJustFinished] = useState(false);
  const sessionBecameAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (session) {
      if (sessionBecameAtRef.current == null) {
        sessionBecameAtRef.current = Date.now();
      }
      return;
    }

    const becameAt = sessionBecameAtRef.current;
    sessionBecameAtRef.current = null;

    if (becameAt != null && Date.now() - becameAt >= STABLE_SESSION_MS) {
      clearPassedOpeningThisLaunch();
      setPassedOpening(false);
      setJustFinished(false);
      void clearOpeningCompleted();
    }
  }, [authLoading, session]);

  const resetOpening = useCallback(async () => {
    sessionBecameAtRef.current = null;
    clearPassedOpeningThisLaunch();
    setPassedOpening(false);
    setJustFinished(false);
    await clearOpeningCompleted();
  }, []);

  useEffect(() => {
    setOpeningLogoutHandler(() => {
      sessionBecameAtRef.current = null;
      clearPassedOpeningThisLaunch();
      setPassedOpening(false);
      setJustFinished(false);
      void clearOpeningCompleted();
    });
    return () => setOpeningLogoutHandler(null);
  }, []);

  const markCompleted = useCallback(async () => {
    markPassedOpeningThisLaunch();
    setPassedOpening(true);
    setJustFinished(true);
    await setOpeningCompleted();
  }, []);

  const clearWelcome = useCallback(() => {
    setJustFinished(false);
  }, []);

  const completed: boolean | null = authLoading
    ? null
    : session != null || passedOpening
      ? true
      : false;

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
