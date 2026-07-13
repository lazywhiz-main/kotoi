import { executeDeepdive, executeResearch } from '../_shared/agentJobs.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { note_id, parent_item_id, request_item_id, result_item_id, prompt } =
      await req.json();

    if (!note_id || !request_item_id || !result_item_id || !prompt) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const db = getServiceClient();
    await executeResearch(db, {
      noteId: note_id,
      userId: user.id,
      requestItemId: request_item_id,
      resultItemId: result_item_id,
      prompt,
      parentItemId: parent_item_id ?? null,
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('run-research error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
