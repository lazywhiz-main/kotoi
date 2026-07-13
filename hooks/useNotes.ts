import { useCallback, useEffect, useState } from 'react';

import { buildNoteListSummaries } from '@/lib/noteListSummary';
import { getSupabase } from '@/lib/supabase';
import type { Note, NoteListSummary, NoteWithSummary } from '@/lib/types';

const emptySummary = (): NoteListSummary => ({
  questionCount: 0,
  openQuestionCount: 0,
  parkedQuestionCount: 0,
  threadItemCount: 0,
  latestOpenQuestion: null,
  hasSummary: false,
  hasDoneContent: false,
});

export function useNotes(userId: string | undefined) {
  const [notes, setNotes] = useState<NoteWithSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!userId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: noteRows, error: fetchError } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setNotes([]);
      setLoading(false);
      return;
    }

    const baseNotes = (noteRows ?? []) as Note[];
    if (baseNotes.length === 0) {
      setNotes([]);
      setLoading(false);
      return;
    }

    const noteIds = baseNotes.map((note) => note.id);
    const { data: threadRows, error: threadError } = await supabase
      .from('thread_items')
      .select('note_id, kind, answered, body, question_type, status')
      .eq('user_id', userId)
      .in('note_id', noteIds)
      .order('created_at', { ascending: false });

    if (threadError) {
      setError(threadError.message);
      setNotes([]);
      setLoading(false);
      return;
    }

    const summaryMap = buildNoteListSummaries(noteIds, threadRows ?? []);
    setNotes(
      baseNotes.map((note) => ({
        ...note,
        summary: summaryMap.get(note.id) ?? emptySummary(),
      })),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  return { notes, loading, error, refresh: fetchNotes };
}
