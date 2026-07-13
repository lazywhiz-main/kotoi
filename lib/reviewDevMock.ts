import type {
  ReviewAccumulation,
  ReviewCooldown,
  WeeklyReviewResult,
} from '@/lib/types';

const MS_DAY = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * MS_DAY).toISOString();
}

/** 開発時のふりかえり履歴プレビュー（新しい順） */
export const DEV_WEEKLY_REVIEWS: WeeklyReviewResult[] = [
  {
    id: 'dev-review-1',
    period_start: daysAgoIso(6),
    period_end: daysAgoIso(0),
    week_label: '7月3日〜7月9日',
    generated_at: daysAgoIso(4),
    stats: { new_notes: 7, new_questions: 23, answered_questions: 5, new_explorations: 2 },
    recurring_theme:
      '「AIへの委譲と責任の所在」。別々のメモから、同じ方向の問いが出ています。',
    hottest_question: {
      id: 'dev-q-hot',
      note_id: 'dev-note-1',
      body: '自社は結局、誰の何を"速く"しているのか？',
      question_type: 'dig',
    },
    recall: {
      id: 'dev-q-recall',
      note_id: 'dev-note-2',
      body: '3週間前の問い',
      weeks_ago: 3,
      prompt:
        '3週間前の問い「"速い"の中身は？　決定の速さと質を分けてる？」——まだ生きてる？',
    },
    exploration_id: null,
  },
  {
    id: 'dev-review-2',
    period_start: daysAgoIso(13),
    period_end: daysAgoIso(7),
    week_label: '6月26日〜7月2日',
    generated_at: daysAgoIso(11),
    stats: { new_notes: 4, new_questions: 15, answered_questions: 3, new_explorations: 1 },
    recurring_theme:
      '「価値ベースの値付け」。3つの別々のメモから、同じ方向の問いが出ています。',
    hottest_question: {
      id: 'dev-q-hot-2',
      note_id: 'dev-note-3',
      body: '自社の価格は"コスト基準"と"価値基準"のどっち寄り？',
      question_type: 'dig',
    },
    recall: null,
    exploration_id: null,
  },
  {
    id: 'dev-review-3',
    period_start: daysAgoIso(20),
    period_end: daysAgoIso(14),
    week_label: '6月19日〜6月25日',
    generated_at: daysAgoIso(18),
    stats: { new_notes: 2, new_questions: 8, answered_questions: 2, new_explorations: 0 },
    recurring_theme:
      '「少人数チームの詰まり」。人数そのものより、情報と権限の偏りが効いている可能性。',
    hottest_question: {
      id: 'dev-q-hot-3',
      note_id: 'dev-note-4',
      body: 'あなたのチームの"詰まり"は、情報の非対称のどこで起きてる？',
      question_type: 'dig',
    },
    recall: null,
    exploration_id: null,
  },
];

export const DEV_REVIEW_ACCUMULATION: ReviewAccumulation = {
  since_at: daysAgoIso(4),
  stats: { new_notes: 2, new_questions: 3, answered_questions: 1, new_explorations: 1 },
  notes: [
    { id: 'dev-n1', preview: 'AIに仕事を任せたい。任せられる…' },
    { id: 'dev-n2', preview: '価格改定のタイミング、1年動かしてない' },
  ],
  questions: [
    {
      id: 'dev-q1',
      note_id: 'dev-note-1',
      body: '「任せられる」と判断する基準は、成果物の精度なのか？',
      question_type: 'dig',
    },
    {
      id: 'dev-q2',
      note_id: 'dev-note-1',
      body: '今週、AIに渡せるプロセスを1つ試せる？',
      question_type: 'act',
    },
  ],
  answered: [
    {
      id: 'dev-q3',
      note_id: 'dev-note-2',
      body: '「速い」の中身は？　決定のスピードと質を分けてる？',
      question_type: 'dig',
    },
  ],
  exploration_updates: [{ id: 'dev-expl-1', title: 'AIへの委譲と責任の所在' }],
  has_activity: true,
};

export const DEV_REVIEW_COOLDOWN: ReviewCooldown = {
  eligible: false,
  next_eligible_at: new Date(Date.now() + 3 * MS_DAY).toISOString(),
  days_remaining: 3,
};

/** `__DEV__` かつ EXPO_PUBLIC_REVIEW_DEV_MOCK=1 のときだけ有効 */
export function isReviewDevMockEnabled(): boolean {
  if (!__DEV__) return false;
  const flag = process.env.EXPO_PUBLIC_REVIEW_DEV_MOCK?.trim().toLowerCase();
  return flag === '1' || flag === 'true';
}

export function applyReviewDevMocks(
  latest: WeeklyReviewResult | null,
  history: WeeklyReviewResult[],
): {
  latest: WeeklyReviewResult | null;
  history: WeeklyReviewResult[];
  accumulation: ReviewAccumulation | null;
  cooldown: ReviewCooldown;
  usingMock: boolean;
} {
  if (!isReviewDevMockEnabled()) {
    return {
      latest,
      history,
      accumulation: null,
      cooldown: { eligible: true, next_eligible_at: null, days_remaining: 0 },
      usingMock: false,
    };
  }

  if (history.length >= 2) {
    return {
      latest,
      history,
      accumulation: null,
      cooldown: { eligible: true, next_eligible_at: null, days_remaining: 0 },
      usingMock: false,
    };
  }

  const mergedHistory = latest
    ? [latest, ...DEV_WEEKLY_REVIEWS.filter((row) => row.id !== latest.id).slice(0, 2)]
    : DEV_WEEKLY_REVIEWS;

  const mergedLatest = mergedHistory[0] ?? null;

  return {
    latest: mergedLatest,
    history: mergedHistory,
    accumulation: DEV_REVIEW_ACCUMULATION,
    cooldown: DEV_REVIEW_COOLDOWN,
    usingMock: true,
  };
}
