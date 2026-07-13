import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { runGenerateMoreQuestion, runGenerateQuestions } from '../_shared/pipeline.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const note_id = body.note_id as string | undefined;
    const mode = (body.mode as string | undefined) ?? 'initial';

    if (!note_id) return jsonResponse({ error: 'note_id is required' }, 400);

    const db = getServiceClient();
    const { data: note, error } = await db
      .from('notes')
      .select('*')
      .eq('id', note_id)
      .eq('user_id', user.id)
      .single();

    if (error || !note) return jsonResponse({ error: 'Note not found' }, 404);

    const { data: summaryItem } = await db
      .from('thread_items')
      .select('body')
      .eq('note_id', note_id)
      .eq('kind', 'summary')
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const summary = summaryItem?.body ?? null;
    const result =
      mode === 'continue'
        ? await runGenerateMoreQuestion(db, note, summary)
        : await runGenerateQuestions(db, note, summary);

    return jsonResponse({ ok: true, questions_count: result.questions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
