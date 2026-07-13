import {
  executeAskTurn,
  executeDeepdive,
  executeNoteTurn,
  executeResearch,
} from '../_shared/agentJobs.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { assertWritableEntitlement } from '../_shared/entitlements.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';
import {
  checkCostBudget,
  ESTIMATED_DEEPDIVE_COST_USD,
  ESTIMATED_RESEARCH_COST_USD,
  getDailyLimitUsd,
  getTodayCostUsd,
} from '../_shared/usageLedger.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

type ChatMode = 'note' | 'ask' | 'research' | 'dig';

function estimateForMode(mode: ChatMode): number {
  if (mode === 'research') return ESTIMATED_RESEARCH_COST_USD;
  if (mode === 'dig') return ESTIMATED_DEEPDIVE_COST_USD;
  return 0.01;
}

function pendingLabel(mode: ChatMode): string {
  if (mode === 'research') return '調査中… 関連情報を整理しています';
  return '前提を分解しています…';
}

type AgentMode = 'research' | 'dig';

function inferAgentMode(requestBody: string): AgentMode {
  const researchAt = requestBody.lastIndexOf('調べ');
  const digAt = requestBody.lastIndexOf('深掘り');
  if (researchAt < 0 && digAt < 0) return 'dig';
  if (digAt > researchAt) return 'dig';
  if (researchAt > digAt) return 'research';
  return 'dig';
}

function resolveRetryMode(
  requested: ChatMode | undefined,
  resultMode: string | null | undefined,
  requestMode: string | null | undefined,
  requestBody: string,
): AgentMode {
  if (requested === 'research' || requested === 'dig') return requested;
  if (resultMode === 'research' || resultMode === 'dig') return resultMode;
  if (requestMode === 'research' || requestMode === 'dig') return requestMode;
  return inferAgentMode(requestBody);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const noteId = body.note_id as string | undefined;
    const retryResultItemId = body.retry_result_item_id as string | undefined;
    const text = (body.text as string | undefined)?.trim() ?? '';
    const parentItemId = (body.parent_item_id as string | undefined) ?? null;
    const approved = body.approved === true;

    if (!noteId) {
      return jsonResponse({ error: 'note_id is required' }, 400);
    }

    const db = getServiceClient();
    const writable = await assertWritableEntitlement(db, user.id);
    if (!writable.ok) {
      return jsonResponse({ error: writable.code }, 402);
    }

    const { data: note, error: noteError } = await db
      .from('notes')
      .select('id, user_id, type')
      .eq('id', noteId)
      .eq('user_id', user.id)
      .single();

    if (noteError || !note) return jsonResponse({ error: 'Note not found' }, 404);

    // ---- 失敗した調査・深掘りの再実行 ----
    if (retryResultItemId) {
      const { data: resultItem, error: resultLoadError } = await db
        .from('thread_items')
        .select('id, note_id, user_id, kind, status, parent_item_id')
        .eq('id', retryResultItemId)
        .eq('note_id', noteId)
        .eq('user_id', user.id)
        .single();

      if (resultLoadError || !resultItem) {
        return jsonResponse({ error: 'Result not found' }, 404);
      }
      if (resultItem.kind !== 'result' || resultItem.status !== 'error') {
        return jsonResponse({ error: 'Result is not retryable' }, 400);
      }
      if (!resultItem.parent_item_id) {
        return jsonResponse({ error: 'Request not found' }, 400);
      }

      const { data: requestItem, error: requestLoadError } = await db
        .from('thread_items')
        .select('id, body, parent_item_id, kind')
        .eq('id', resultItem.parent_item_id)
        .eq('note_id', noteId)
        .eq('user_id', user.id)
        .single();

      if (requestLoadError || !requestItem || requestItem.kind !== 'request') {
        return jsonResponse({ error: 'Request not found' }, 404);
      }

      const mode = resolveRetryMode(
        body.mode as ChatMode | undefined,
        null,
        null,
        requestItem.body,
      );

      if (note.type === 'feeling') {
        return jsonResponse({ error: '感情メモでは調査・深掘りは使えません。' }, 400);
      }

      // 「もう一度」は明示操作なので承認ダイアログはスキップ。日次上限のみ見る。
      const estimate = estimateForMode(mode);
      const budget = await checkCostBudget(db, user.id, estimate);
      if (!budget.ok) {
        return jsonResponse(
          {
            error: 'daily_limit_exceeded',
            today_cost_usd: budget.todayCost,
            daily_limit_usd: budget.dailyLimit,
          },
          429,
        );
      }

      const { error: pendingError } = await db
        .from('thread_items')
        .update({
          body: pendingLabel(mode),
          status: 'pending',
        })
        .eq('id', resultItem.id)
        .eq('status', 'error');

      if (pendingError) {
        return jsonResponse({ error: pendingError.message }, 500);
      }

      // agent_mode 列がある環境向け（未マイグレーションでも再実行は続行）
      await db.from('thread_items').update({ agent_mode: mode }).eq('id', requestItem.id);
      await db.from('thread_items').update({ agent_mode: mode }).eq('id', resultItem.id);

      const jobParams = {
        noteId,
        userId: user.id,
        requestItemId: requestItem.id,
        resultItemId: resultItem.id,
        prompt: requestItem.body,
        parentItemId: requestItem.parent_item_id,
      };

      if (mode === 'research') {
        EdgeRuntime.waitUntil(
          executeResearch(db, jobParams).catch((err) =>
            console.error('executeResearch retry error:', err),
          ),
        );
      } else {
        EdgeRuntime.waitUntil(
          executeDeepdive(db, jobParams).catch((err) =>
            console.error('executeDeepdive retry error:', err),
          ),
        );
      }

      return jsonResponse({
        ok: true,
        user_item_id: requestItem.id,
        result_item_id: resultItem.id,
        processing: true,
      });
    }

    const mode = body.mode as ChatMode | undefined;
    if (!mode) {
      return jsonResponse({ error: 'note_id and mode are required' }, 400);
    }

    if (!text) {
      return jsonResponse({ error: 'text is required' }, 400);
    }

    if (note.type === 'feeling' && (mode === 'research' || mode === 'dig')) {
      return jsonResponse({ error: '感情メモでは調査・深掘りは使えません。' }, 400);
    }

    const agentMode = mode === 'research' || mode === 'dig';

    if (agentMode && !approved) {
      const estimate = estimateForMode(mode);
      const todayCost = await getTodayCostUsd(db, user.id);
      const dailyLimit = getDailyLimitUsd();
      return jsonResponse({
        requires_approval: true,
        estimated_cost_usd: estimate,
        today_cost_usd: todayCost,
        daily_limit_usd: dailyLimit,
        mode,
      });
    }

    if (agentMode) {
      const estimate = estimateForMode(mode);
      const budget = await checkCostBudget(db, user.id, estimate);
      if (!budget.ok) {
        return jsonResponse(
          {
            error: 'daily_limit_exceeded',
            today_cost_usd: budget.todayCost,
            daily_limit_usd: budget.dailyLimit,
          },
          429,
        );
      }
    }

    if (mode === 'note') {
      const { data: userItem, error: insertError } = await db
        .from('thread_items')
        .insert({
          note_id: noteId,
          user_id: user.id,
          author: 'user',
          kind: 'note',
          body: text,
          parent_item_id: parentItemId,
          status: 'done',
        })
        .select('id')
        .single();

      if (insertError || !userItem) throw insertError ?? new Error('Failed to save note');

      await executeNoteTurn(db, {
        noteId,
        userId: user.id,
        userItemId: userItem.id,
        text,
      });

      return jsonResponse({ ok: true, user_item_id: userItem.id });
    }

    if (mode === 'ask') {
      const { data: userItem, error: insertError } = await db
        .from('thread_items')
        .insert({
          note_id: noteId,
          user_id: user.id,
          author: 'user',
          kind: 'note',
          body: text,
          parent_item_id: parentItemId,
          status: 'done',
        })
        .select('id')
        .single();

      if (insertError || !userItem) throw insertError ?? new Error('Failed to save question');

      await executeAskTurn(db, {
        noteId,
        userId: user.id,
        userItemId: userItem.id,
        text,
        parentItemId,
      });

      return jsonResponse({ ok: true, user_item_id: userItem.id });
    }

    const { data: requestItem, error: requestError } = await db
      .from('thread_items')
      .insert({
        note_id: noteId,
        user_id: user.id,
        author: 'user',
        kind: 'request',
        body: text,
        parent_item_id: parentItemId,
        agent_mode: mode,
        status: 'done',
      })
      .select('id')
      .single();

    if (requestError || !requestItem) {
      throw requestError ?? new Error('Failed to save request');
    }

    const { data: resultItem, error: resultError } = await db
      .from('thread_items')
      .insert({
        note_id: noteId,
        user_id: user.id,
        author: 'agent',
        kind: 'result',
        body: pendingLabel(mode),
        parent_item_id: requestItem.id,
        agent_mode: mode,
        status: 'pending',
      })
      .select('id')
      .single();

    if (resultError || !resultItem) {
      throw resultError ?? new Error('Failed to create pending result');
    }

    const jobParams = {
      noteId,
      userId: user.id,
      requestItemId: requestItem.id,
      resultItemId: resultItem.id,
      prompt: text,
      parentItemId,
    };

    if (mode === 'research') {
      EdgeRuntime.waitUntil(
        executeResearch(db, jobParams).catch((err) =>
          console.error('executeResearch error:', err),
        ),
      );
    } else {
      EdgeRuntime.waitUntil(
        executeDeepdive(db, jobParams).catch((err) =>
          console.error('executeDeepdive error:', err),
        ),
      );
    }

    return jsonResponse({
      ok: true,
      user_item_id: requestItem.id,
      result_item_id: resultItem.id,
      processing: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('chat-turn error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
