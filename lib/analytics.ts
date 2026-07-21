import { invokeFunction } from '@/lib/api';

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const SESSION_THROTTLE_MS = 30 * 60 * 1000;
let lastSessionAt = 0;

/**
 * Product analytics (L1). Fire-and-forget.
 * Never put memo body / email / transcript in props.
 */
export function track(event: string, props?: AnalyticsProps): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, props ?? {});
  }

  const clean: Record<string, string | number | boolean | null> = {};
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) continue;
      clean[k] = v;
    }
  }

  void invokeFunction('track-event', {
    name: event,
    props: clean,
    schema_ver: 1,
  }).catch(() => {
    // Analytics must never block UX
  });
}

/** Call when a session is ready. Throttled to avoid foreground spam. */
export function trackSessionStarted(coldStart = false): void {
  const now = Date.now();
  if (now - lastSessionAt < SESSION_THROTTLE_MS) return;
  lastSessionAt = now;
  track('session_started', { cold_start: coldStart });
}
