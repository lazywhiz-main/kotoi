import type { LinkPreviewResult, Note } from '@/lib/types';

export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function getLinkTitle(note: Pick<Note, 'source_title' | 'video_title'>): string | null {
  return note.source_title ?? note.video_title ?? null;
}

export function noteHasLinkPreview(
  note: Pick<Note, 'source_url' | 'source_title' | 'source_image_url' | 'video_title'>,
): boolean {
  if (!note.source_url) return false;
  return !!(getLinkTitle(note) || note.source_image_url);
}

export function previewFromNote(
  note: Pick<
    Note,
    'source_url' | 'source_title' | 'source_image_url' | 'video_title' | 'is_video'
  >,
): LinkPreviewResult | null {
  if (!note.source_url) return null;
  const title = getLinkTitle(note);
  if (!title && !note.source_image_url) return null;
  return {
    title,
    image_url: note.source_image_url,
    site_name: linkHost(note.source_url),
  };
}
