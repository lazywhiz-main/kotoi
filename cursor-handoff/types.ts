// KOTOI — shared types (mirror of 03_data-model.sql). Place at lib/types.ts.

export type NoteType = 'seed' | 'learn' | 'task' | 'feeling' | 'ref';
export type ItemAuthor = 'ai' | 'user' | 'agent';
export type ItemKind = 'summary' | 'question' | 'note' | 'request' | 'result' | 'answer';
export type QuestionType = 'dig' | 'con' | 'ref' | 'act' | 'exp'; // 深掘り/接続/反証/行動/拡張
export type ItemStatus = 'pending' | 'done' | 'error';

export const QUESTION_LABEL: Record<QuestionType, string> = {
  dig: '深掘り', con: '接続', ref: '反証', act: '行動', exp: '拡張',
};

// composer の意図モード
export type ChatMode = 'note' | 'ask' | 'research' | 'dig';
export type AgentMode = 'research' | 'dig';

export interface Note {
  id: string;
  user_id: string;
  raw_text: string;
  type: NoteType | null;          // classify前はnull
  is_video: boolean;
  source_url: string | null;
  source_title: string | null;
  source_image_url: string | null;
  video_title: string | null;
  video_transcript: string | null;
  transcript_status: ItemStatus | null;
  article_body: string | null;
  article_status: ItemStatus | null;
  classified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadItem {
  id: string;
  note_id: string;
  user_id: string;
  author: ItemAuthor;
  kind: ItemKind;
  question_type: QuestionType | null; // kind==='question' のみ
  body: string;
  parent_item_id: string | null;      // 問い→枝 / 依頼→結果
  agent_mode?: AgentMode | null;      // request/result の再実行用
  status: ItemStatus;
  answered: boolean;
  answered_at: string | null;
  created_at: string;
}

export interface Exploration {
  id: string;
  user_id: string;
  title: string;
  short_label: string | null;   // 問いの地図の中心ノード用
  synthesis: string | null;     // この束が示唆すること
  progress: number;             // 0-100
  created_at: string;
  updated_at: string;
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

// ---- Edge Function I/O ----
export interface ClassifyResult { type: NoteType; is_video: boolean; confidence: number; reason: string; }
export interface SummarizeResult { summary: string; key_points: string[]; }
export interface GeneratedQuestion { question_type: QuestionType; body: string; }
export interface GenerateQuestionsResult { questions: GeneratedQuestion[]; }
export interface ResearchResult { result: string; new_question: GeneratedQuestion; }

export type RecallRhythm = 'off' | 'daily' | 'weekdays' | 'weekly';
export type DailyQuestionStatus = 'active' | 'saved' | 'dismissed' | 'expired';

export interface DailyQuestionDelivery {
  id: string;
  user_id: string;
  question_type: QuestionType;
  body: string;
  why_now: string | null;
  anchor_note_id: string;
  anchor_question_id: string | null;
  status: DailyQuestionStatus;
  delivered_on: string;
  saved_thread_item_id: string | null;
  created_at: string;
  updated_at: string;
}
