import { useEffect, useMemo, useRef, useState } from 'react';

import { spawnParticles } from '@/lib/opening/rippleSpec';

export function useOpeningAnimation(speed = 1, replayKey = 0) {
  const [t, setT] = useState(0);
  const particles = useMemo(() => spawnParticles(), [replayKey]);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    setT(0);

    const frame = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      setT(((now - startRef.current) / 1000) * speed);
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [speed, replayKey]);

  return { t, particles };
}
