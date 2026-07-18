import type { ItemStatus } from '@/lib/types';
import { isPastStuckWindow, videoPipelineAnchor } from '@/lib/video';

export function articleStatusLabel(
  status: ItemStatus | null,
  hasArticleUrl: boolean,
  anchor?: string | null,
): string | null {
  if (!hasArticleUrl || !status) return null;
  if (status === 'pending') {
    return isPastStuckWindow(anchor)
      ? '記事の読み取りが途中で止まっています'
      : '記事を読み取り中…';
  }
  if (status === 'done') return '記事本文を取得済み';
  if (status === 'error') {
    return '記事本文を取得できませんでした。メモとタイトルから要約しています';
  }
  return null;
}

export function isArticleProcessing(
  status: ItemStatus | null,
  hasArticleUrl: boolean,
  anchor?: string | null,
): boolean {
  if (!hasArticleUrl || status !== 'pending') return false;
  return !isPastStuckWindow(anchor);
}

export function isArticlePipelineIncomplete(options: {
  hasArticleUrl: boolean;
  type: string | null;
  hasDoneQuestion: boolean;
  anchor?: string | null;
}): boolean {
  if (!options.hasArticleUrl || !options.type) return false;
  if (options.type === 'task' || options.type === 'ref') return false;
  if (options.hasDoneQuestion) return false;
  return isPastStuckWindow(options.anchor);
}

/** 記事URLメモか（YouTube 以外の source_url + learn/seed） */
export function noteLooksLikeArticle(note: {
  is_video: boolean;
  source_url: string | null;
  type: string | null;
  article_status?: ItemStatus | null;
  article_body?: string | null;
}): boolean {
  if (note.is_video || !note.source_url) return false;
  if (note.article_status || note.article_body) return true;
  return note.type === 'learn' || note.type === 'seed';
}

export { videoPipelineAnchor };
