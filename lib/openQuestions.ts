import type { OpenQuestionRow, QuestionType } from '@/lib/types';

export type QuestionFilter = 'all' | QuestionType;

export const QUESTION_FILTERS: { id: QuestionFilter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'dig', label: '深掘り' },
  { id: 'con', label: '接続' },
  { id: 'ref', label: '反証' },
  { id: 'act', label: '行動' },
  { id: 'exp', label: '拡張' },
];

export function formatNoteSourceLabel(note: {
  raw_text: string;
  is_video: boolean;
  video_title: string | null;
}): string {
  if (note.is_video && note.video_title) {
    return `${note.video_title}（動画）`;
  }

  const text = note.raw_text.trim();
  if (!text) return 'メモ';
  if (text.length <= 28) return text;
  return `${text.slice(0, 28)}…`;
}

export function noteSourceLabel(row: OpenQuestionRow): string {
  return formatNoteSourceLabel({
    raw_text: row.note_raw,
    is_video: row.is_video,
    video_title: row.video_title,
  });
}

export function filterOpenQuestions(
  rows: OpenQuestionRow[],
  filter: QuestionFilter,
): OpenQuestionRow[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.question_type === filter);
}
