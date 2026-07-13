import type { ItemStatus } from '@/lib/types';

/**
 * 分類〜問い生成の「まだ走っている」とみなす上限。
 * Edge 切断後にスピナーが永久に回らないよう短め。
 */
export const VIDEO_PIPELINE_STUCK_MS = 90_000;

export function transcriptStatusLabel(
  status: ItemStatus | null,
  isVideo: boolean,
  anchor?: string | null,
): string | null {
  if (!isVideo) return null;
  if (status === 'pending') {
    return isPastStuckWindow(anchor)
      ? '文字起こしが途中で止まっています'
      : '文字起こし取得中…';
  }
  if (status === 'done') return '文字起こし取得済み';
  if (status === 'error') {
    return '文字起こし未対応。リンクとタイトルから軽い問いだけ出しました';
  }
  return null;
}

function pipelineAgeMs(anchor: string | null | undefined): number | null {
  if (!anchor) return null;
  const age = Date.now() - new Date(anchor).getTime();
  return Number.isFinite(age) ? age : null;
}

export function isPastStuckWindow(anchor: string | null | undefined): boolean {
  const age = pipelineAgeMs(anchor);
  // 時刻が取れない＝すでに止まっている可能性が高い → すぐ打ち切り
  if (age == null) return true;
  return age >= VIDEO_PIPELINE_STUCK_MS;
}

/** 処理中判定の基準時刻（classified → updated → created） */
export function videoPipelineAnchor(note: {
  classified_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}): string | null {
  return note.classified_at ?? note.updated_at ?? note.created_at ?? null;
}

/** 分類がまだ走っている（type 未確定かつ時間内） */
export function isClassifyProcessing(note: {
  type: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): boolean {
  if (note.type) return false;
  return !isPastStuckWindow(note.created_at ?? note.updated_at);
}

/** 分類が途中で止まった */
export function isClassifyStuck(note: {
  type: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): boolean {
  if (note.type) return false;
  return isPastStuckWindow(note.created_at ?? note.updated_at);
}

export function isTranscriptProcessing(
  status: ItemStatus | null,
  isVideo: boolean,
  anchor?: string | null,
): boolean {
  if (!isVideo || status !== 'pending') return false;
  return !isPastStuckWindow(anchor);
}

/** 一覧の「育成中…」を永続表示しない */
export function isNoteStillGrowing(options: {
  type: string | null;
  isVideo: boolean;
  transcriptStatus: ItemStatus | null;
  anchor: string | null | undefined;
  createdAt?: string | null;
  /** 完了した要約・問いがあるか（pending のみは育っていない） */
  hasDoneThreadContent: boolean;
}): boolean {
  if (!options.type) {
    return !isPastStuckWindow(options.createdAt ?? options.anchor);
  }
  if (options.hasDoneThreadContent) return false;
  if (isPastStuckWindow(options.anchor)) return false;
  if (isTranscriptProcessing(options.transcriptStatus, options.isVideo, options.anchor)) {
    return true;
  }
  return true;
}

/** 途中停止 → 再取得を出してよい（分類済み・動画） */
export function isVideoPipelineIncomplete(options: {
  isVideo: boolean;
  type: string | null;
  hasDoneQuestion: boolean;
  anchor?: string | null;
}): boolean {
  if (!options.isVideo || !options.type) return false;
  if (options.type === 'task' || options.type === 'ref') return false;
  if (options.hasDoneQuestion) return false;
  return isPastStuckWindow(options.anchor);
}
