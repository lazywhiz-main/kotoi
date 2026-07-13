import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { runClusterExplorations, type ClusterMode } from './clusterExplorations.ts';
import { sendPushToUser } from './pushNotify.ts';

function asError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const record = err as { message?: unknown };
    if (typeof record.message === 'string' && record.message.trim()) {
      return new Error(record.message);
    }
  }
  if (typeof err === 'string' && err.trim()) return new Error(err);
  return new Error(fallback);
}

export async function markExplorationsJobPending(
  db: SupabaseClient,
  userId: string,
  mode: ClusterMode,
): Promise<void> {
  const { data: existing, error: fetchError } = await db
    .from('user_settings')
    .select('explorations_job_status')
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw asError(fetchError, 'Failed to read cluster job status');

  if (existing?.explorations_job_status === 'pending') {
    throw new Error('already_pending');
  }

  const { error } = await db.from('user_settings').upsert(
    {
      user_id: userId,
      explorations_job_status: 'pending',
      explorations_job_mode: mode,
      explorations_job_error: null,
      explorations_job_started_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw asError(error, 'Failed to mark cluster job pending');
}

async function clearExplorationsJob(
  db: SupabaseClient,
  userId: string,
  patch: {
    explorations_clustered_at?: string;
    explorations_job_status?: 'error' | null;
    explorations_job_error?: string | null;
  },
): Promise<void> {
  const { error } = await db.from('user_settings').upsert(
    {
      user_id: userId,
      explorations_job_status: patch.explorations_job_status ?? null,
      explorations_job_mode: null,
      explorations_job_error: patch.explorations_job_error ?? null,
      explorations_job_started_at: null,
      ...(patch.explorations_clustered_at
        ? { explorations_clustered_at: patch.explorations_clustered_at }
        : {}),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw asError(error, 'Failed to clear cluster job');
}

export async function executeExplorationsJob(
  db: SupabaseClient,
  userId: string,
  mode: ClusterMode,
): Promise<void> {
  try {
    const result = await runClusterExplorations(db, userId, { mode });
    const clusteredAt = new Date().toISOString();
    await clearExplorationsJob(db, userId, {
      explorations_clustered_at: clusteredAt,
      explorations_job_status: null,
      explorations_job_error: null,
    });

    if (result.skipped && mode === 'incremental') {
      return;
    }

    const isRebuild = mode === 'rebuild';
    await sendPushToUser(
      db,
      userId,
      {
        title: isRebuild ? '束を組み直しました' : '問いを振り分けました',
        body: isRebuild
          ? '探究タブで、新しい束を見られます。'
          : '探究タブで、振り分けの結果を見られます。',
        data: { screen: 'explorations' },
      },
      'notify_agent_done',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await clearExplorationsJob(db, userId, {
        explorations_job_status: 'error',
        explorations_job_error: message.slice(0, 500),
      });
    } catch (clearErr) {
      console.error('Failed to persist cluster job error:', clearErr);
    }
    console.error('executeExplorationsJob error:', message, err);
  }
}
