import { callAnthropicJsonWithUsage } from '../_shared/anthropic.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { assertWritableEntitlement } from '../_shared/entitlements.ts';
import { fetchLinkPreview, linkPreviewFields } from '../_shared/linkPreview.ts';
import { extractSourceUrl } from '../_shared/noteInput.ts';
import {
  runGenerateQuestions,
  runSummarizeNote,
} from '../_shared/pipeline.ts';
import { CLASSIFY_SYSTEM } from '../_shared/prompts.ts';
import { classifyResultSchema } from '../_shared/schemas.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { runVideoNotePipeline } from '../_shared/transcriptPipeline.ts';
import { recordUsage } from '../_shared/usageLedger.ts';
import { isYouTubeUrl } from '../_shared/youtubeTranscript.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { note_id } = await req.json();
    if (!note_id) return jsonResponse({ error: 'note_id is required' }, 400);

    const db = getServiceClient();
    const writable = await assertWritableEntitlement(db, user.id);
    if (!writable.ok) {
      return jsonResponse({ error: writable.code }, 402);
    }

    const { data: note, error: noteError } = await db
      .from('notes')
      .select('*')
      .eq('id', note_id)
      .eq('user_id', user.id)
      .single();

    if (noteError || !note) return jsonResponse({ error: 'Note not found' }, 404);

    const sourceUrl = extractSourceUrl(note.raw_text, note.source_url);
    const urlUpdates: Record<string, string> = {};
    if (sourceUrl && sourceUrl !== note.source_url) {
      urlUpdates.source_url = sourceUrl;
      note.source_url = sourceUrl;
    }

    if (sourceUrl && (!note.source_title || !note.source_image_url)) {
      const preview = await fetchLinkPreview(sourceUrl);
      Object.assign(urlUpdates, linkPreviewFields(preview, sourceUrl));
      if (preview.title) note.source_title = preview.title;
      if (preview.image_url) note.source_image_url = preview.image_url;
    }

    if (Object.keys(urlUpdates).length > 0) {
      await db.from('notes').update(urlUpdates).eq('id', note_id);
    }

    const { data: classified, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      CLASSIFY_SYSTEM,
      JSON.stringify({
        raw_text: note.raw_text,
        source_url: sourceUrl ?? undefined,
      }),
      classifyResultSchema,
    );

    await recordUsage(db, user.id, 'classify-note', inputTokens, outputTokens);

    if (sourceUrl && isYouTubeUrl(sourceUrl)) {
      classified.is_video = true;
    }

    const isVideo = classified.is_video && !!sourceUrl && isYouTubeUrl(sourceUrl);

    const { data: updatedNote, error: updateError } = await db
      .from('notes')
      .update({
        type: classified.type,
        is_video: classified.is_video,
        classified_at: new Date().toISOString(),
        ...(isVideo ? { transcript_status: 'pending' as const } : {}),
      })
      .eq('id', note_id)
      .select('*')
      .single();

    if (updateError || !updatedNote) throw updateError ?? new Error('Failed to update note');

    if (isVideo) {
      EdgeRuntime.waitUntil(
        runVideoNotePipeline(db, note_id).catch((err) =>
          console.error('runVideoNotePipeline error:', err),
        ),
      );

      return jsonResponse({
        ok: true,
        classification: classified,
        transcript_status: 'pending',
        processing: true,
      });
    }

    let summary: string | null = null;
    const canSummarize = updatedNote.type === 'learn' || updatedNote.type === 'seed';
    const needsQuestions = canSummarize || updatedNote.type === 'feeling';

    if (canSummarize) {
      summary = await runSummarizeNote(db, updatedNote);
    }

    const questions = needsQuestions
      ? await runGenerateQuestions(db, updatedNote, summary)
      : { questions: [] };

    return jsonResponse({
      ok: true,
      classification: classified,
      transcript_status: 'skipped',
      questions_count: questions.questions.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('classify-note error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
