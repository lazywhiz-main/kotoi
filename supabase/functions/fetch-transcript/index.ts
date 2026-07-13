import { handleCors, jsonResponse } from '../_shared/cors.ts';
import {
  clearIncompleteAiItems,
  runVideoNotePipeline,
} from '../_shared/transcriptPipeline.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

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

    // 再実行・途中停止からの再開: 未完了 AI アイテムを掃除
    await clearIncompleteAiItems(db, note_id);

    await runVideoNotePipeline(db, note_id, { forceTranscript: force });

    const { data: updatedNote } = await db
      .from('notes')
      .select('transcript_status, video_transcript')
      .eq('id', note_id)
      .single();

    return jsonResponse({
      ok: true,
      transcript_status: updatedNote?.transcript_status ?? 'error',
      has_transcript: !!updatedNote?.video_transcript,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('fetch-transcript error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
