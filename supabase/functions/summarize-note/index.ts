import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { runSummarizeNote } from '../_shared/pipeline.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { note_id } = await req.json();
    if (!note_id) return jsonResponse({ error: 'note_id is required' }, 400);

    const db = getServiceClient();
    const { data: note, error } = await db
      .from('notes')
      .select('*')
      .eq('id', note_id)
      .eq('user_id', user.id)
      .single();

    if (error || !note) return jsonResponse({ error: 'Note not found' }, 404);
    if (note.type !== 'learn' && note.type !== 'seed') {
      return jsonResponse({ error: 'Note type does not support summarization' }, 400);
    }

    const body = await runSummarizeNote(db, note);
    return jsonResponse({ ok: true, summary: body });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
