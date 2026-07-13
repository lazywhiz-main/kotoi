import type { NoteListSummary } from '@/lib/types';

type ThreadRow = {
  note_id: string;
  kind: string;
  answered: boolean;
  body: string;
  question_type: string | null;
  status?: string | null;
};

export function buildNoteListSummaries(
  noteIds: string[],
  items: ThreadRow[],
): Map<string, NoteListSummary> {
  const map = new Map<string, NoteListSummary>();

  for (const noteId of noteIds) {
    map.set(noteId, {
      questionCount: 0,
      openQuestionCount: 0,
      parkedQuestionCount: 0,
      threadItemCount: 0,
      latestOpenQuestion: null,
      hasSummary: false,
      hasDoneContent: false,
    });
  }

  for (const item of items) {
    const summary = map.get(item.note_id);
    if (!summary) continue;

    summary.threadItemCount += 1;
    const isDone = !item.status || item.status === 'done';

    if (item.kind === 'summary') {
      if (isDone) {
        summary.hasSummary = true;
        summary.hasDoneContent = true;
      }
      continue;
    }

    if (item.kind !== 'question') continue;
    if (!isDone) continue;

    summary.hasDoneContent = true;
    summary.questionCount += 1;
    if (item.answered) {
      summary.parkedQuestionCount += 1;
    } else {
      summary.openQuestionCount += 1;
      if (!summary.latestOpenQuestion) {
        summary.latestOpenQuestion = item.body;
      }
    }
  }

  return map;
}

export function formatNoteListStats(summary: NoteListSummary | undefined): string | null {
  if (!summary || !summary.hasDoneContent) return null;

  if (summary.questionCount === 0) {
    return summary.hasSummary ? '要約あり' : null;
  }

  if (summary.openQuestionCount > 0) {
    return `問い ${summary.questionCount} · 追っている ${summary.openQuestionCount}`;
  }

  return `問い ${summary.questionCount} · すべてアーカイブ`;
}

export function formatNoteThreadGlimpse(summary: NoteListSummary | undefined): string | null {
  if (!summary?.latestOpenQuestion) return null;
  const text = summary.latestOpenQuestion.trim();
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}
