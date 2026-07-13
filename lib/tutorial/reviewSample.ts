import type { WeeklyReviewResult } from '@/lib/types';

/** ふりかえりゼロ時に見せる架空の1回分（実データと混ぜない） */
export const SAMPLE_WEEKLY_REVIEW: WeeklyReviewResult = {
  id: 'sample-review',
  period_start: '2026-07-03T00:00:00.000Z',
  period_end: '2026-07-09T23:59:59.000Z',
  week_label: '7月3日〜7月9日',
  generated_at: '2026-07-09T12:00:00.000Z',
  stats: {
    new_notes: 7,
    new_questions: 23,
    answered_questions: 5,
    new_explorations: 2,
  },
  recurring_theme:
    '「AIへの委譲と責任の所在」。別々のメモから、同じ方向の問いが出ています。',
  hottest_question: {
    id: 'sample-q-hot',
    note_id: 'sample-note-1',
    body: '自社は結局、誰の何を"速く"しているのか？',
    question_type: 'dig',
  },
  recall: {
    id: 'sample-q-recall',
    note_id: 'sample-note-2',
    body: '3週間前の問い',
    weeks_ago: 3,
    prompt:
      '3週間前の問い「"速い"の中身は？　決定の速さと質を分けてる？」——まだ生きてる？',
  },
  exploration_id: null,
};
