import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { callAnthropicJsonWithUsage } from './anthropic.ts';
import { recordFirstGraphicRecDone, releaseFreeGraphicSlotOnFailure } from './entitlements.ts';
import { buildGraphicRecBatchSystem, GRAPHIC_REC_PROMPT_VERSION } from './graphicRecPrompt.ts';
import { estimateOpenAiImageCostUsd, generateOpenAiImage } from './openaiImage.ts';
import { graphicRecBatchResultSchema } from './schemas.ts';
import { sendPushToUser } from './pushNotify.ts';
import { recordFlatUsage, recordUsage } from './usageLedger.ts';

const STORAGE_BUCKET = 'exploration-graphic-rec';

export type GraphicRecExplorationPayload = {
  id: string;
  title: string;
  short_label: string | null;
  synthesis: string | null;
  notes: { id: string; label: string; type: string }[];
  questions: {
    id: string;
    question_type: string;
    body: string;
    user_thoughts: string | null;
    note_id: string;
  }[];
  subthemes: { label: string; question_ids: string[] }[];
};

function extensionForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

export async function loadGraphicRecPayload(
  db: SupabaseClient,
  explorationId: string,
  userId: string,
): Promise<GraphicRecExplorationPayload> {
  const { data: exploration, error: explorationError } = await db
    .from('explorations')
    .select('id, title, short_label, synthesis')
    .eq('id', explorationId)
    .eq('user_id', userId)
    .single();

  if (explorationError || !exploration) {
    throw new Error('探究が見つかりません。');
  }

  const [{ data: noteLinks }, { data: questionLinks }, { data: subthemeRows }] = await Promise.all([
    db.from('exploration_notes').select('note_id').eq('exploration_id', explorationId),
    db
      .from('exploration_questions')
      .select('item_id, thread_items(id, note_id, question_type, body)')
      .eq('exploration_id', explorationId),
    db
      .from('exploration_subthemes')
      .select('label, position, exploration_subtheme_questions(item_id)')
      .eq('exploration_id', explorationId)
      .order('position', { ascending: true }),
  ]);

  const noteIds = (noteLinks ?? []).map((row) => row.note_id as string);
  const { data: noteRows } = noteIds.length
    ? await db.from('notes').select('id, raw_text, type').in('id', noteIds)
    : { data: [] };

  const notes = (noteRows ?? []).map((note) => ({
    id: note.id as string,
    label: ((note.raw_text as string) ?? '').slice(0, 120),
    type: (note.type as string) ?? 'seed',
  }));

  const questionIds: string[] = [];
  const questions = (questionLinks ?? [])
    .map((row) => {
      const raw = row.thread_items as unknown;
      const item = (Array.isArray(raw) ? raw[0] : raw) as {
        id: string;
        note_id: string;
        question_type: string | null;
        body: string;
      } | null;
      if (!item?.question_type) return null;
      questionIds.push(item.id);
      return {
        id: item.id,
        question_type: item.question_type,
        body: item.body,
        user_thoughts: null as string | null,
        note_id: item.note_id,
      };
    })
    .filter((q): q is NonNullable<typeof q> => !!q);

  if (questionIds.length > 0) {
    const { data: thoughtRows } = await db
      .from('thread_items')
      .select('parent_item_id, body')
      .eq('user_id', userId)
      .eq('kind', 'note')
      .eq('author', 'user')
      .in('parent_item_id', questionIds)
      .order('created_at', { ascending: true });

    const thoughtsByQuestion = new Map<string, string>();
    for (const row of thoughtRows ?? []) {
      const parentId = row.parent_item_id as string;
      if (!thoughtsByQuestion.has(parentId)) {
        thoughtsByQuestion.set(parentId, (row.body as string) ?? '');
      }
    }
    for (const question of questions) {
      question.user_thoughts = thoughtsByQuestion.get(question.id) ?? null;
    }
  }

  const subthemes = (subthemeRows ?? []).map((row) => {
    const links = (row.exploration_subtheme_questions ?? []) as { item_id: string }[];
    return {
      label: row.label as string,
      question_ids: links.map((link) => link.item_id),
    };
  });

  return {
    id: exploration.id as string,
    title: exploration.title as string,
    short_label: (exploration.short_label as string | null) ?? null,
    synthesis: (exploration.synthesis as string | null) ?? null,
    notes,
    questions,
    subthemes,
  };
}

export async function markGraphicRecPending(
  db: SupabaseClient,
  userId: string,
  explorationId: string,
): Promise<{ title: string }> {
  const { data: exploration, error } = await db
    .from('explorations')
    .select('id, title, graphic_rec_status')
    .eq('id', explorationId)
    .eq('user_id', userId)
    .single();

  if (error || !exploration) {
    throw new Error('探究が見つかりません。');
  }

  if (exploration.graphic_rec_status === 'pending') {
    throw new Error('already_pending');
  }

  const { error: updateError } = await db
    .from('explorations')
    .update({
      graphic_rec_status: 'pending',
      graphic_rec_error: null,
    })
    .eq('id', explorationId)
    .eq('user_id', userId);

  if (updateError) throw updateError;

  return { title: exploration.title as string };
}

export async function executeGraphicRecJob(
  db: SupabaseClient,
  userId: string,
  explorationId: string,
): Promise<void> {
  const payload = await loadGraphicRecPayload(db, explorationId, userId);

  try {
    const { data: batch, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
      buildGraphicRecBatchSystem(),
      `探究データ:\n${JSON.stringify(payload, null, 2)}`,
      graphicRecBatchResultSchema,
      { maxTokens: 8192 },
    );

    const recommended = batch.variants.find((v) => v.id === batch.recommended_variant);
    if (!recommended) {
      throw new Error(`おすすめパターン ${batch.recommended_variant} のプロンプトがありません。`);
    }

    const image = await generateOpenAiImage(recommended.image_prompt);
    const ext = extensionForMime(image.mime);
    const storagePath = `${userId}/${explorationId}.${ext}`;

    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, image.bytes, {
        contentType: image.mime,
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const generatedAt = new Date().toISOString();
    const { error: updateError } = await db
      .from('explorations')
      .update({
        graphic_rec_status: 'done',
        graphic_rec_variant: batch.recommended_variant,
        graphic_rec_storage_path: storagePath,
        graphic_rec_prompt_version: GRAPHIC_REC_PROMPT_VERSION,
        graphic_rec_selection_reason: batch.selection_reason,
        graphic_rec_error: null,
        graphic_rec_generated_at: generatedAt,
      })
      .eq('id', explorationId)
      .eq('user_id', userId);
    if (updateError) throw updateError;

    await recordFirstGraphicRecDone(db, userId, explorationId);

    await recordUsage(db, userId, 'generate-exploration-graphic-rec', inputTokens, outputTokens);
    await recordFlatUsage(db, userId, 'generate-exploration-graphic-rec-openai', estimateOpenAiImageCostUsd());

    await sendPushToUser(
      db,
      userId,
      {
        title: '見取り図ができました',
        body: `「${payload.title}」を開いて見られます。`,
        data: { exploration_id: explorationId },
      },
      'notify_agent_done',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('explorations')
      .update({
        graphic_rec_status: 'error',
        graphic_rec_error: message.slice(0, 500),
      })
      .eq('id', explorationId)
      .eq('user_id', userId);
    // 失敗は無料1枠を消費しない（成功ゼロなら free / achieved を戻す）
    try {
      await releaseFreeGraphicSlotOnFailure(db, userId);
    } catch (releaseErr) {
      console.error(
        'releaseFreeGraphicSlotOnFailure error:',
        releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
      );
    }
    console.error('executeGraphicRecJob error:', message);
  }
}
