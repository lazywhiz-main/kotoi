import { callAnthropicJsonWithUsage } from '../_shared/anthropic.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { THOUGHT_DRAFT_SYSTEM } from '../_shared/prompts.ts';
import { thoughtDraftResultSchema } from '../_shared/schemas.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import { recordUsage } from '../_shared/usageLedger.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const noteId = body.note_id as string | undefined;
    const questionItemId = body.question_item_id as string | undefined;

    if (!noteId || !questionItemId) {
      return jsonResponse({ error: 'note_id and question_item_id are required' }, 400);
    }

    const db = getServiceClient();
    const { data: note, error: noteError } = await db
      .from('notes')
      .select('id, raw_text, type')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (noteError || !note) return jsonResponse({ error: 'Note not found' }, 404);

    const { data: question, error: questionError } = await db
      .from('thread_items')
      .select('id, body, question_type')
      .eq('id', questionItemId)
      .eq('note_id', noteId)
      .eq('user_id', user.id)
      .eq('kind', 'question')
      .single();

    if (questionError || !question) {
      return jsonResponse({ error: 'Question not found' }, 404);
    }

    const { data: thoughts } = await db
      .from('thread_items')
      .select('body')
      .eq('note_id', noteId)
      .eq('kind', 'note')
      .eq('author', 'user')
      .eq('parent_item_id', questionItemId)
      .order('created_at', { ascending: true });

    const { data, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      THOUGHT_DRAFT_SYSTEM,
      JSON.stringify({
        note: { raw_text: note.raw_text, type: note.type },
        question: {
          body: question.body,
          question_type: question.question_type,
        },
        existing_thoughts: (thoughts ?? []).map((row) => row.body),
      }),
      thoughtDraftResultSchema,
    );

    await recordUsage(db, user.id, 'draft-thought', inputTokens, outputTokens);

    return jsonResponse({ ok: true, draft: data.draft.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
