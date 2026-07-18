// KOTOI — shared types (mirror of 03_data-model.sql)

import type { AppearancePreference } from '@/lib/theme';

export type NoteType = 'seed' | 'learn' | 'task' | 'feeling' | 'ref';
export type ItemAuthor = 'ai' | 'user' | 'agent';
export type ItemKind = 'summary' | 'question' | 'note' | 'request' | 'result' | 'answer';
export type QuestionType = 'dig' | 'con' | 'ref' | 'act' | 'exp';

export type GraphicRecVariant = 'metaphor' | 'narrative' | 'human' | 'spatial';
export type GraphicRecStatus = 'pending' | 'done' | 'error' | 'stale';
export type ItemStatus = 'pending' | 'done' | 'error';

export const QUESTION_LABEL: Record<QuestionType, string> = {
  dig: '深掘り',
  con: '接続',
  ref: '反証',
  act: '行動',
  exp: '拡張',
};

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  seed: 'ひらめき',
  learn: '学び',
  task: 'やること',
  feeling: '感情',
  ref: '保存',
};

export type ChatMode = 'note' | 'ask' | 'research' | 'dig';

export const CHAT_MODE_LABEL: Record<ChatMode, string> = {
  note: '追記',
  ask: 'AIに質問',
  research: '調べる',
  dig: '深掘り',
};

export const CHAT_MODE_HINT: Record<ChatMode, string> = {
  note: '思ったことをそのまま残せます（AIが接続の問いを返すことも）',
  ask: '疑問に答え、さらに問いを返します',
  research: '依頼するとエージェントが動いて結果が返ります',
  dig: '前提を分解して掘り下げます',
};

export interface ChatTurnApprovalResponse {
  requires_approval: true;
  estimated_cost_usd: number;
  today_cost_usd: number;
  daily_limit_usd: number;
  mode: ChatMode;
}

export interface ChatTurnSuccessResponse {
  ok: true;
  user_item_id: string;
  result_item_id?: string;
  processing?: boolean;
}

export interface Note {
  id: string;
  user_id: string;
  raw_text: string;
  type: NoteType | null;
  is_video: boolean;
  source_url: string | null;
  source_title: string | null;
  source_image_url: string | null;
  video_title: string | null;
  video_transcript: string | null;
  transcript_status: ItemStatus | null;
  /** 記事URLから抽出した本文 */
  article_body: string | null;
  /** pending/done/error。記事以外は null */
  article_status: ItemStatus | null;
  classified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteListSummary {
  questionCount: number;
  openQuestionCount: number;
  parkedQuestionCount: number;
  threadItemCount: number;
  latestOpenQuestion: string | null;
  hasSummary: boolean;
  /** 完了した要約または問いがある（pending のみは false） */
  hasDoneContent: boolean;
}

export interface NoteWithSummary extends Note {
  summary: NoteListSummary;
}

export type AgentMode = 'research' | 'dig';

export interface ThreadItem {
  id: string;
  note_id: string;
  user_id: string;
  author: ItemAuthor;
  kind: ItemKind;
  question_type: QuestionType | null;
  body: string;
  parent_item_id: string | null;
  agent_mode?: AgentMode | null;
  status: ItemStatus;
  answered: boolean;
  answered_at: string | null;
  created_at: string;
}

export interface Exploration {
  id: string;
  user_id: string;
  title: string;
  short_label: string | null;
  synthesis: string | null;
  progress: number;
  graphic_rec_status: GraphicRecStatus | null;
  graphic_rec_variant: GraphicRecVariant | null;
  graphic_rec_storage_path: string | null;
  graphic_rec_prompt_version: string | null;
  graphic_rec_selection_reason: string | null;
  graphic_rec_error: string | null;
  graphic_rec_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExplorationWithStats extends Exploration {
  memo_count: number;
  question_count: number;
  answered_count: number;
  engaged_count: number;
  /** 一覧用。Storage の署名付き URL（クライアントのみ） */
  graphic_rec_image_url?: string | null;
}

export interface ExplorationQuestion {
  id: string;
  note_id: string;
  question_type: QuestionType;
  body: string;
  answered: boolean;
  thoughts: string[];
  note_raw: string;
  is_video: boolean;
  video_title: string | null;
}

export interface ExplorationSubtheme {
  id: string;
  label: string;
  mapLabel: string;
  questions: ExplorationQuestion[];
}

export interface ExplorationDetail extends Exploration {
  subthemes: ExplorationSubtheme[];
  questions: ExplorationQuestion[];
}

export interface OpenQuestionRow {
  id: string;
  user_id: string;
  note_id: string;
  question_type: QuestionType;
  body: string;
  created_at: string;
  note_raw: string;
  is_video: boolean;
  video_title: string | null;
}

export interface LinkPreviewResult {
  title: string | null;
  image_url: string | null;
  site_name: string | null;
}

export interface ClassifyResult {
  type: NoteType;
  is_video: boolean;
  confidence: number;
  reason: string;
}

export interface SummarizeResult {
  summary: string;
  key_points: string[];
}

export interface GeneratedQuestion {
  question_type: QuestionType;
  body: string;
}

export interface GenerateQuestionsResult {
  questions: GeneratedQuestion[];
}

export interface ResearchResult {
  result: string;
  new_question: GeneratedQuestion;
}

export interface WeeklyReviewStats {
  new_notes: number;
  new_questions: number;
  answered_questions: number;
  new_explorations: number;
}

export interface WeeklyReviewQuestionRef {
  id: string;
  note_id: string;
  body: string;
  question_type: QuestionType;
}

export interface WeeklyReviewRecall {
  id: string;
  note_id: string;
  body: string;
  weeks_ago: number;
  prompt: string;
}

export interface WeeklyReviewResult {
  id: string;
  period_start: string;
  period_end: string;
  week_label: string;
  generated_at: string;
  stats: WeeklyReviewStats;
  recurring_theme: string;
  hottest_question: WeeklyReviewQuestionRef | null;
  recall: WeeklyReviewRecall | null;
  exploration_id: string | null;
}

export interface ReviewCooldown {
  eligible: boolean;
  next_eligible_at: string | null;
  days_remaining: number;
}

export interface ReviewAccumulationNote {
  id: string;
  preview: string;
}

export interface ReviewAccumulationQuestion {
  id: string;
  note_id: string;
  body: string;
  question_type: QuestionType;
}

export interface ReviewAccumulationExploration {
  id: string;
  title: string;
}

export interface ReviewAccumulation {
  since_at: string;
  stats: WeeklyReviewStats;
  notes: ReviewAccumulationNote[];
  questions: ReviewAccumulationQuestion[];
  answered: ReviewAccumulationQuestion[];
  exploration_updates: ReviewAccumulationExploration[];
  has_activity: boolean;
}

import type { RecallRhythm } from '@/lib/dailyQuestion';

export interface UserSettings {
  user_id: string;
  notify_agent_done: boolean;
  notify_weekly_review: boolean;
  notify_daily_question: boolean;
  recall_rhythm: RecallRhythm;
  recall_weekday: number;
  recall_hour: number;
  appearance: AppearancePreference;
  /** 最後に探究の振り分けを実行した時刻。null なら未実行 */
  explorations_clustered_at: string | null;
  explorations_job_status: 'pending' | 'error' | null;
  explorations_job_mode: 'incremental' | 'rebuild' | null;
  explorations_job_error: string | null;
  explorations_job_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageByFn {
  fn: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  count: number;
}

export interface UsageSummary {
  ok: boolean;
  day: string;
  month?: string;
  timezone?: string;
  today_cost_usd: number;
  daily_limit_usd: number;
  input_tokens: number;
  output_tokens: number;
  by_fn: UsageByFn[];
  /** お試し安全弁など向けの全期間合算 */
  lifetime_cost_usd?: number;
  lifetime_by_fn?: UsageByFn[];
  /** 暦月（お試し中の参考用。購読中は period_* を優先） */
  month_cost_usd?: number;
  month_by_fn?: UsageByFn[];
  /** 購読後〜現契約期間の利用 */
  period_started_at?: string | null;
  period_cost_usd?: number;
  period_by_fn?: UsageByFn[];
  is_subscribed?: boolean;
}

export type {
  TrialState,
  PlanKind,
  Entitlement,
  GraphicRecGate,
  SubscriptionRow,
} from './entitlements';
