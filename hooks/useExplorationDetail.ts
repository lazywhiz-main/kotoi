import { useCallback, useEffect, useState } from 'react';

import { mapNodeLines } from '@/lib/mapLabel';
import {
  computeEngagedProgress,
  fetchThoughtsForQuestions,
} from '@/lib/questionThoughts';
import { getSupabase } from '@/lib/supabase';
import type {
  ExplorationDetail,
  ExplorationQuestion,
  ExplorationSubtheme,
  Note,
  QuestionType,
} from '@/lib/types';

export function useExplorationDetail(explorationId: string | undefined) {
  const [detail, setDetail] = useState<ExplorationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (options?: { silent?: boolean }) => {
    if (!explorationId) return;

    const supabase = getSupabase();
    if (!supabase) {
      setError('Supabase が未設定です。.env を確認してください。');
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    const { data: exploration, error: explorationError } = await supabase
      .from('explorations')
      .select('*')
      .eq('id', explorationId)
      .single();

    if (explorationError || !exploration) {
      setError(explorationError?.message ?? '探究が見つかりません。');
      setDetail(null);
      setLoading(false);
      return;
    }

    const [{ data: subthemeRows }, { data: questionLinks }] = await Promise.all([
      supabase
        .from('exploration_subthemes')
        .select('id, label, position, exploration_subtheme_questions(item_id)')
        .eq('exploration_id', explorationId)
        .order('position', { ascending: true }),
      supabase
        .from('exploration_questions')
        .select('item_id, thread_items(id, note_id, question_type, body, answered)')
        .eq('exploration_id', explorationId),
    ]);

    const questionById = new Map<string, ExplorationQuestion>();
    for (const row of questionLinks ?? []) {
      const raw = row.thread_items as unknown;
      const item = (Array.isArray(raw) ? raw[0] : raw) as {
        id: string;
        note_id: string;
        question_type: string | null;
        body: string;
        answered: boolean;
      } | null;
      if (!item?.question_type) continue;
      questionById.set(item.id, {
        id: item.id,
        note_id: item.note_id,
        question_type: item.question_type as QuestionType,
        body: item.body,
        answered: item.answered,
        thoughts: [],
        note_raw: '',
        is_video: false,
        video_title: null,
      });
    }

    const questions = [...questionById.values()];
    const questionIds = questions.map((question) => question.id);
    const thoughtsByQuestionId = await fetchThoughtsForQuestions(
      supabase,
      exploration.user_id as string,
      questionIds,
    );

    for (const question of questions) {
      question.thoughts = thoughtsByQuestionId.get(question.id) ?? [];
    }

    const noteIds = [...new Set(questions.map((q) => q.note_id))];
    const { data: noteRows } = noteIds.length
      ? await supabase
          .from('notes')
          .select('id, raw_text, video_title, source_title, is_video')
          .in('id', noteIds)
      : { data: [] };

    const noteById = new Map(
      (noteRows ?? []).map((note) => [note.id as string, note as Note]),
    );

    const enrichQuestion = (question: ExplorationQuestion): ExplorationQuestion => {
      const note = noteById.get(question.note_id);
      return {
        ...question,
        thoughts: thoughtsByQuestionId.get(question.id) ?? [],
        note_raw: note?.raw_text ?? '',
        is_video: note?.is_video ?? false,
        video_title: note?.video_title ?? null,
      };
    };

    let subthemes: ExplorationSubtheme[] = (subthemeRows ?? []).map((row) => {
      const links = (row.exploration_subtheme_questions ?? []) as { item_id: string }[];
      const subQuestions = links
        .map((link) => questionById.get(link.item_id))
        .filter((question): question is ExplorationQuestion => !!question)
        .map(enrichQuestion);

      return {
        id: row.id as string,
        label: row.label as string,
        mapLabel: mapNodeLines(row.label as string, '切').join('\n'),
        questions: subQuestions,
      };
    });

    if (subthemes.length === 0 && questions.length > 0) {
      subthemes = [
        {
          id: 'fallback',
          label: 'まとめ',
          mapLabel: 'まとめ',
          questions: questions.map(enrichQuestion),
        },
      ];
    }

    const enrichedQuestions = questions.map(enrichQuestion);
    const answeredById = new Map(enrichedQuestions.map((q) => [q.id, q.answered]));
    const progress = computeEngagedProgress(questionIds, answeredById, thoughtsByQuestionId);

    setDetail({
      ...(exploration as ExplorationDetail),
      progress,
      subthemes,
      questions: enrichedQuestions,
    });
    setLoading(false);
  }, [explorationId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  return { detail, loading, error, refresh: fetchDetail };
}
