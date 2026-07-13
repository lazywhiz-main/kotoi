import type { ExplorationSubtheme, ExplorationWithStats } from '@/lib/types';

/** 探究ゼロ時に見せる架空の束（実データと混ぜない） */
export const SAMPLE_EXPLORATION: ExplorationWithStats = {
  id: 'sample-exploration',
  user_id: 'sample',
  title: '速さの正体',
  short_label: '速さの\n正体',
  synthesis: '少人数の速さは、情報と権限の通り方で決まる。',
  progress: 40,
  graphic_rec_status: 'done',
  graphic_rec_variant: 'metaphor',
  graphic_rec_storage_path: null,
  graphic_rec_prompt_version: null,
  graphic_rec_selection_reason: null,
  graphic_rec_error: null,
  graphic_rec_generated_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  memo_count: 3,
  question_count: 5,
  answered_count: 1,
  engaged_count: 2,
  graphic_rec_image_url: null,
};

export const SAMPLE_GRAPHIC_REC_IMAGE = require('../../assets/tutorial/sample-graphic-rec.png');

export const SAMPLE_EXPLORATION_SUBTHEMES: ExplorationSubtheme[] = [
  {
    id: 'sample-sub-1',
    label: '情報の通り道',
    mapLabel: '情報の\n通り道',
    questions: [
      {
        id: 'sample-q-1',
        note_id: 'sample-note-1',
        question_type: 'dig',
        body: '詰まりは、誰が何を知らないときに起きている？',
        answered: false,
        thoughts: ['朝会だけでは足りない気がする'],
        note_raw: 'チームの意思決定が遅い理由を考えていた',
        is_video: false,
        video_title: null,
      },
      {
        id: 'sample-q-2',
        note_id: 'sample-note-1',
        question_type: 'con',
        body: '速く動けたときの情報共有は、何が違った？',
        answered: true,
        thoughts: [],
        note_raw: 'チームの意思決定が遅い理由を考えていた',
        is_video: false,
        video_title: null,
      },
    ],
  },
  {
    id: 'sample-sub-2',
    label: '権限の置き方',
    mapLabel: '権限の\n置き方',
    questions: [
      {
        id: 'sample-q-3',
        note_id: 'sample-note-2',
        question_type: 'ref',
        body: '「確認待ち」は、本当に必要な安全装置？',
        answered: false,
        thoughts: [],
        note_raw: '承認フローが増えすぎている',
        is_video: false,
        video_title: null,
      },
      {
        id: 'sample-q-4',
        note_id: 'sample-note-2',
        question_type: 'act',
        body: '今週、誰かに渡せる判断はひとつある？',
        answered: false,
        thoughts: ['小さな予算なら任せられそう'],
        note_raw: '承認フローが増えすぎている',
        is_video: false,
        video_title: null,
      },
    ],
  },
  {
    id: 'sample-sub-3',
    label: '少人数のリズム',
    mapLabel: '少人数の\nリズム',
    questions: [
      {
        id: 'sample-q-5',
        note_id: 'sample-note-3',
        question_type: 'exp',
        body: '二人のときの速さは、三人になると何が壊れる？',
        answered: false,
        thoughts: [],
        note_raw: '人数が増えると遅くなる感覚',
        is_video: false,
        video_title: null,
      },
    ],
  },
];
