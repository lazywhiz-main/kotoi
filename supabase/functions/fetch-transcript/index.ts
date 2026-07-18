import { noteWantsArticleFetch, runArticleNotePipeline } from '../_shared/articlePipeline.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import {
  runGenerateQuestions,
  runSummarizeNote,
} from '../_shared/pipeline.ts';
import {
  clearIncompleteAiItems,
  runVideoNotePipeline,
} from '../_shared/transcriptPipeline.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { isYouTubeUrl } from '../_shared/youtubeTranscript.ts';

/**
 * 止まっているメモの再取得入口。
 * - 動画 → 文字起こし＋要約＋問い
 * - 記事URL → 本文取得＋要約＋問い
 * - seed / learn / feeling → 欠けている要約・問いを補完
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const note_id = body?.note_id as string | undefined;
    const force = body?.force === true;
    if (!note_id) return jsonResponse({ error: 'note_id is required' }, 400);

    const db = getServiceClient();
    const { data: note, error: noteError } = await db
      .from('notes')
      .select('*')
      .eq('id', note_id)
      .eq('user_id', user.id)
      .single();

    if (noteError || !note) return jsonResponse({ error: 'Note not found' }, 404);

    await clearIncompleteAiItems(db, note_id);

    const isVideo = note.is_video && !!note.source_url && isYouTubeUrl(note.source_url);
    if (isVideo) {
      await runVideoNotePipeline(db, note_id, { forceTranscript: force });
      const { data: updatedNote } = await db
        .from('notes')
        .select('transcript_status, video_transcript')
        .eq('id', note_id)
        .single();

      return jsonResponse({
        ok: true,
        kind: 'video',
        transcript_status: updatedNote?.transcript_status ?? 'error',
        has_transcript: !!updatedNote?.video_transcript,
      });
    }

    if (noteWantsArticleFetch(note)) {
      await runArticleNotePipeline(db, note_id, { forceArticle: force });
      const { data: updatedNote } = await db
        .from('notes')
        .select('article_status, article_body')
        .eq('id', note_id)
        .single();

      return jsonResponse({
        ok: true,
        kind: 'article',
        article_status: updatedNote?.article_status ?? 'error',
        has_article: !!updatedNote?.article_body,
      });
    }

    // テキストメモ（feeling 含む）: 欠けている要約・問いを補完
    if (note.type === 'seed' || note.type === 'learn' || note.type === 'feeling') {
      const { data: current } = await db
        .from('notes')
        .select('*')
        .eq('id', note_id)
        .single();
      if (!current) {
        return jsonResponse({ error: 'Note not found' }, 404);
      }

      const { count: doneSummaryCount } = await db
        .from('thread_items')
        .select('id', { count: 'exact', head: true })
        .eq('note_id', note_id)
        .eq('kind', 'summary')
        .eq('status', 'done');

      const { count: doneQuestionCount } = await db
        .from('thread_items')
        .select('id', { count: 'exact', head: true })
        .eq('note_id', note_id)
        .eq('kind', 'question')
        .eq('status', 'done');

      let summary: string | null = null;
      const canSummarize = current.type === 'learn' || current.type === 'seed';

      if (canSummarize && (doneSummaryCount ?? 0) === 0) {
        summary = await runSummarizeNote(db, current);
      } else if ((doneSummaryCount ?? 0) > 0) {
        const { data: existing } = await db
          .from('thread_items')
          .select('body')
          .eq('note_id', note_id)
          .eq('kind', 'summary')
          .eq('status', 'done')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        summary = existing?.body ?? null;
      }

      let questionsCount = doneQuestionCount ?? 0;
      if ((doneQuestionCount ?? 0) === 0) {
        const generated = await runGenerateQuestions(db, current, summary);
        questionsCount = generated.questions.length;
      }

      return jsonResponse({
        ok: true,
        kind: 'thread',
        type: current.type,
        questions_count: questionsCount,
      });
    }

    return jsonResponse({
      ok: true,
      kind: 'none',
      message: '再取得対象ではありません（task / ref は問いを生成しません）',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('fetch-transcript error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
