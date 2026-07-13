import { useCallback, useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

const PAGE_SIZE = 200;

export type UnclusteredQuestionStats = {
  /** 分類済みメモ上の未整理問い総数 */
  count: number;
  /** 前回振り分けより後に増えた未整理問い */
  newSinceClusterCount: number;
  /** 前回振り分け時刻。未実行なら null */
  clusteredAt: string | null;
};

/**
 * どの探究にも入っていない問いの件数。
 * サーバーの振り分け対象と揃える: question_type あり かつ メモが分類済み。
 */
export function useUnclusteredQuestionCount(userId: string | undefined) {
  const [stats, setStats] = useState<UnclusteredQuestionStats>({
    count: 0,
    newSinceClusterCount: 0,
    clusteredAt: null,
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStats({ count: 0, newSinceClusterCount: 0, clusteredAt: null });
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setStats({ count: 0, newSinceClusterCount: 0, clusteredAt: null });
      return;
    }

    setLoading(true);
    try {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('explorations_clustered_at')
        .eq('user_id', userId)
        .maybeSingle();
      const clusteredAt =
        (settings?.explorations_clustered_at as string | null | undefined) ?? null;

      const questions: { id: string; note_id: string; created_at: string }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('thread_items')
          .select('id, note_id, created_at')
          .eq('user_id', userId)
          .eq('kind', 'question')
          .not('question_type', 'is', null)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data ?? [];
        for (const row of rows) {
          questions.push({
            id: row.id as string,
            note_id: row.note_id as string,
            created_at: row.created_at as string,
          });
        }
        if (rows.length < PAGE_SIZE) break;
      }

      if (questions.length === 0) {
        setStats({ count: 0, newSinceClusterCount: 0, clusteredAt });
        return;
      }

      const typedNoteIds = new Set<string>();
      const noteIdList = [...new Set(questions.map((q) => q.note_id))];
      for (let i = 0; i < noteIdList.length; i += PAGE_SIZE) {
        const chunk = noteIdList.slice(i, i + PAGE_SIZE);
        const { data: notes, error: notesError } = await supabase
          .from('notes')
          .select('id')
          .eq('user_id', userId)
          .in('id', chunk)
          .not('type', 'is', null);
        if (notesError) throw notesError;
        for (const row of notes ?? []) typedNoteIds.add(row.id as string);
      }

      const clusterable = questions.filter((q) => typedNoteIds.has(q.note_id));
      if (clusterable.length === 0) {
        setStats({ count: 0, newSinceClusterCount: 0, clusteredAt });
        return;
      }

      const explorationIds: string[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('explorations')
          .select('id')
          .eq('user_id', userId)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data ?? [];
        for (const row of rows) explorationIds.push(row.id as string);
        if (rows.length < PAGE_SIZE) break;
      }

      const clustered = new Set<string>();
      if (explorationIds.length > 0) {
        for (let i = 0; i < explorationIds.length; i += PAGE_SIZE) {
          const chunk = explorationIds.slice(i, i + PAGE_SIZE);
          for (let from = 0; ; from += PAGE_SIZE) {
            const { data: links, error: linksError } = await supabase
              .from('exploration_questions')
              .select('item_id')
              .in('exploration_id', chunk)
              .range(from, from + PAGE_SIZE - 1);
            if (linksError) throw linksError;
            const rows = links ?? [];
            for (const row of rows) clustered.add(row.item_id as string);
            if (rows.length < PAGE_SIZE) break;
          }
        }
      }

      const unclustered = clusterable.filter((q) => !clustered.has(q.id));
      const clusteredAtMs = clusteredAt ? Date.parse(clusteredAt) : NaN;
      const newSinceClusterCount = Number.isNaN(clusteredAtMs)
        ? unclustered.length
        : unclustered.filter((q) => Date.parse(q.created_at) > clusteredAtMs).length;

      setStats({
        count: unclustered.length,
        newSinceClusterCount,
        clusteredAt,
      });
    } catch {
      setStats({ count: 0, newSinceClusterCount: 0, clusteredAt: null });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...stats, loading, refresh };
}
