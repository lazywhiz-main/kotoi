import { useCallback, useEffect, useRef, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';

export type ClusterMode = 'incremental' | 'rebuild';

type ClusterResponse = {
  ok: boolean;
  processing?: boolean;
  mode?: ClusterMode;
  explorations_job_status?: 'pending' | 'error' | null;
  error?: string;
};

export type ExplorationsJobState = {
  status: 'pending' | 'error' | null;
  mode: ClusterMode | null;
  error: string | null;
  startedAt: string | null;
};

const IDLE_JOB: ExplorationsJobState = {
  status: null,
  mode: null,
  error: null,
  startedAt: null,
};

export function useClusterExplorations(
  userId: string | undefined,
  onSettled?: () => void,
) {
  const [job, setJob] = useState<ExplorationsJobState>(IDLE_JOB);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasPendingRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const refreshJob = useCallback(async () => {
    if (!userId) {
      setJob(IDLE_JOB);
      return IDLE_JOB;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setJob(IDLE_JOB);
      return IDLE_JOB;
    }

    const { data, error: fetchError } = await supabase
      .from('user_settings')
      .select(
        'explorations_job_status, explorations_job_mode, explorations_job_error, explorations_job_started_at',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.warn('Failed to load explorations job', fetchError.message);
      return IDLE_JOB;
    }

    const next: ExplorationsJobState = {
      status: (data?.explorations_job_status as ExplorationsJobState['status']) ?? null,
      mode: (data?.explorations_job_mode as ClusterMode | null) ?? null,
      error: (data?.explorations_job_error as string | null) ?? null,
      startedAt: (data?.explorations_job_started_at as string | null) ?? null,
    };
    setJob(next);

    if (next.status === 'error' && next.error) {
      setError(next.error);
    } else if (next.status !== 'error') {
      setError(null);
    }

    if (wasPendingRef.current && next.status !== 'pending') {
      wasPendingRef.current = false;
      onSettledRef.current?.();
    }
    if (next.status === 'pending') {
      wasPendingRef.current = true;
    }

    return next;
  }, [userId]);

  useEffect(() => {
    void refreshJob();
  }, [refreshJob]);

  useEffect(() => {
    if (job.status !== 'pending') return;
    const id = setInterval(() => {
      void refreshJob();
    }, 5_000);
    return () => clearInterval(id);
  }, [job.status, refreshJob]);

  const cluster = useCallback(
    async (mode: ClusterMode = 'incremental') => {
      setStarting(true);
      setError(null);

      try {
        const result = await invokeFunction<ClusterResponse>('cluster-explorations', { mode });
        if (result.error) {
          throw new Error(formatApiError(result.error, '問いの振り分けに失敗しました'));
        }
        wasPendingRef.current = true;
        setJob({
          status: 'pending',
          mode: result.mode ?? mode,
          error: null,
          startedAt: new Date().toISOString(),
        });
        return result;
      } catch (err) {
        const message = formatApiError(
          err,
          mode === 'rebuild' ? '束の組み直しに失敗しました' : '問いの振り分けに失敗しました',
        );
        setError(message);
        return null;
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  const clustering = starting || job.status === 'pending';

  return {
    cluster,
    clustering,
    job,
    error: error ?? (job.status === 'error' ? job.error : null),
    refreshJob,
  };
}
