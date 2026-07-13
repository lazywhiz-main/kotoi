import { useCallback, useEffect, useState } from 'react';

import {
  computeEngagedProgress,
  countEngagedQuestions,
  fetchThoughtsForQuestions,
} from '@/lib/questionThoughts';
import { GRAPHIC_REC_STORAGE_BUCKET } from '@/lib/graphicRecSpec';
import { getSupabase } from '@/lib/supabase';
import type { ExplorationWithStats } from '@/lib/types';

async function attachStats(
  explorations: ExplorationWithStats[],
  userId: string,
): Promise<ExplorationWithStats[]> {
  if (explorations.length === 0) return [];

  const supabase = getSupabase();
  if (!supabase) return explorations;

  const ids = explorations.map((item) => item.id);

  const [{ data: noteLinks }, { data: questionLinks }] = await Promise.all([
    supabase.from('exploration_notes').select('exploration_id').in('exploration_id', ids),
    supabase
      .from('exploration_questions')
      .select('exploration_id, item_id, thread_items(id, answered)')
      .in('exploration_id', ids),
  ]);

  const memoCounts = new Map<string, number>();
  for (const row of noteLinks ?? []) {
    memoCounts.set(row.exploration_id, (memoCounts.get(row.exploration_id) ?? 0) + 1);
  }

  const questionsByExploration = new Map<string, { id: string; answered: boolean }[]>();
  const allQuestionIds: string[] = [];

  for (const row of questionLinks ?? []) {
    const explorationId = row.exploration_id as string;
    const raw = row.thread_items as unknown;
    const item = (Array.isArray(raw) ? raw[0] : raw) as { id: string; answered?: boolean } | null;
    if (!item?.id) continue;

    const list = questionsByExploration.get(explorationId) ?? [];
    list.push({ id: item.id, answered: item.answered ?? false });
    questionsByExploration.set(explorationId, list);
    allQuestionIds.push(item.id);
  }

  const uniqueQuestionIds = [...new Set(allQuestionIds)];
  const thoughtsByQuestionId = await fetchThoughtsForQuestions(
    supabase,
    userId,
    uniqueQuestionIds,
  );

  return explorations.map((item) => {
    const questions = questionsByExploration.get(item.id) ?? [];
    const questionIds = questions.map((question) => question.id);
    const answeredById = new Map(questions.map((question) => [question.id, question.answered]));
    const engaged_count = countEngagedQuestions(questionIds, answeredById, thoughtsByQuestionId);
    const progress = computeEngagedProgress(questionIds, answeredById, thoughtsByQuestionId);
    const answered_count = questions.filter((question) => question.answered).length;

    return {
      ...item,
      memo_count: memoCounts.get(item.id) ?? 0,
      question_count: questions.length,
      answered_count,
      engaged_count,
      progress,
    };
  });
}

async function attachGraphicRecUrls(
  explorations: ExplorationWithStats[],
): Promise<ExplorationWithStats[]> {
  const supabase = getSupabase();
  if (!supabase || explorations.length === 0) return explorations;

  const withPaths = explorations.filter(
    (item) =>
      !!item.graphic_rec_storage_path &&
      (item.graphic_rec_status === 'done' ||
        item.graphic_rec_status === 'stale' ||
        // status が残っていても画像があれば署名 URL を付ける
        item.graphic_rec_status == null),
  );
  if (withPaths.length === 0) return explorations;

  const urlById = new Map<string, string>();
  await Promise.all(
    withPaths.map(async (item) => {
      const { data } = await supabase.storage
        .from(GRAPHIC_REC_STORAGE_BUCKET)
        .createSignedUrl(item.graphic_rec_storage_path!, 60 * 60);
      if (data?.signedUrl) urlById.set(item.id, data.signedUrl);
    }),
  );

  return explorations.map((item) => ({
    ...item,
    graphic_rec_image_url: urlById.get(item.id) ?? null,
  }));
}

export function useExplorations(userId: string | undefined) {
  const [explorations, setExplorations] = useState<ExplorationWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExplorations = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
      setExplorations([]);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setExplorations([]);
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('explorations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setExplorations([]);
    } else {
      const withStats = await attachStats((data ?? []) as ExplorationWithStats[], userId);
      setExplorations(await attachGraphicRecUrls(withStats));
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchExplorations();
  }, [fetchExplorations]);

  return { explorations, loading, error, refresh: fetchExplorations };
}
