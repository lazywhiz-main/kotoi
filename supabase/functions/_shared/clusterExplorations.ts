import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { callAnthropicJsonWithUsage } from './anthropic.ts';
import {
  computeEngagedProgress,
  fetchThoughtsForQuestions,
} from './questionThoughts.ts';
import { CLUSTER_EXPLORATIONS_SYSTEM, REBUILD_EXPLORATIONS_SYSTEM } from './prompts.ts';
import { clusterExplorationsResultSchema, type ClusterExploration } from './schemas.ts';
import { recordUsage } from './usageLedger.ts';

function asError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const record = err as { message?: unknown; code?: unknown; details?: unknown };
    const message = typeof record.message === 'string' ? record.message : fallback;
    const code = typeof record.code === 'string' ? ` (${record.code})` : '';
    const details =
      typeof record.details === 'string' && record.details ? `: ${record.details}` : '';
    return new Error(`${message}${code}${details}`);
  }
  if (typeof err === 'string' && err.trim()) return new Error(err);
  return new Error(fallback);
}

type NoteRow = {
  id: string;
  raw_text: string;
  type: string | null;
  source_title: string | null;
  video_title: string | null;
  is_video: boolean;
};

type QuestionRow = {
  id: string;
  note_id: string;
  question_type: string;
  body: string;
  answered: boolean;
  created_at: string;
};

type ExistingExploration = {
  id: string;
  title: string;
  short_label: string | null;
  synthesis: string | null;
  graphic_rec_status: string | null;
  graphic_rec_storage_path: string | null;
  note_ids: string[];
  question_ids: string[];
};

type NormalizedExploration = ClusterExploration & {
  note_ids: string[];
  question_ids: string[];
  subthemes: { label: string; question_ids: string[] }[];
};

export type ClusterMode = 'incremental' | 'rebuild';

export type ClusterResult = {
  created: number;
  updated: number;
  skipped: boolean;
  /** 振り分け後も探究に入っていない（分類済みメモ上の）問い件数 */
  remaining_unclustered: number;
  mode: ClusterMode;
};

const MAX_QUESTIONS = 50;
const MAX_UNCLUSTERED_FOR_AI = 40;
const MAX_NOTE_TEXT = 120;
const MAX_QUESTION_BODY = 180;
const PAGE_SIZE = 200;
const GRAPHIC_REC_STORAGE_BUCKET = 'exploration-graphic-rec';

function noteLabel(note: NoteRow): string {
  if (note.is_video && (note.video_title || note.source_title)) {
    return note.video_title ?? note.source_title ?? '動画';
  }
  const text = note.raw_text.trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text || 'メモ';
}

function dedupeQuestions(questions: QuestionRow[]): QuestionRow[] {
  const seen = new Set<string>();
  const result: QuestionRow[] = [];
  for (const question of questions) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    result.push(question);
  }
  return result;
}

function takeQuestions(
  questions: QuestionRow[],
  limit: number,
  selected: QuestionRow[],
  seen: Set<string>,
): void {
  for (const question of questions) {
    if (selected.length >= limit) break;
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    selected.push(question);
  }
}

async function fetchAllTypedQuestions(
  db: SupabaseClient,
  userId: string,
): Promise<QuestionRow[]> {
  const all: QuestionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('thread_items')
      .select('id, note_id, question_type, body, answered, created_at')
      .eq('user_id', userId)
      .eq('kind', 'question')
      .not('question_type', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw asError(error, 'Failed to fetch questions');
    const rows = (data ?? []) as QuestionRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

async function fetchTypedNoteIds(
  db: SupabaseClient,
  userId: string,
  noteIds: string[],
): Promise<Set<string>> {
  const typed = new Set<string>();
  if (noteIds.length === 0) return typed;
  for (let i = 0; i < noteIds.length; i += PAGE_SIZE) {
    const chunk = noteIds.slice(i, i + PAGE_SIZE);
    const { data, error } = await db
      .from('notes')
      .select('id')
      .eq('user_id', userId)
      .in('id', chunk)
      .not('type', 'is', null);
    if (error) throw asError(error, 'Failed to fetch notes');
    for (const row of data ?? []) typed.add(row.id as string);
  }
  return typed;
}

async function countRemainingUnclustered(
  db: SupabaseClient,
  userId: string,
  existingExplorations: ExistingExploration[],
): Promise<number> {
  const clustered = new Set(
    existingExplorations.flatMap((exploration) => exploration.question_ids),
  );
  // 振り分け後の最新リンクも見る
  if (existingExplorations.length > 0) {
    const ids = existingExplorations.map((e) => e.id);
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      const chunk = ids.slice(i, i + PAGE_SIZE);
      const { data: links } = await db
        .from('exploration_questions')
        .select('item_id')
        .in('exploration_id', chunk);
      for (const row of links ?? []) clustered.add(row.item_id as string);
    }
  }

  const questions = await fetchAllTypedQuestions(db, userId);
  const unclustered = questions.filter((q) => !clustered.has(q.id));
  if (unclustered.length === 0) return 0;
  const typedNotes = await fetchTypedNoteIds(
    db,
    userId,
    [...new Set(unclustered.map((q) => q.note_id))],
  );
  return unclustered.filter((q) => typedNotes.has(q.note_id)).length;
}

/**
 * AI が拾い漏れた未整理を、同じメモが既に入っている探究へ機械的に足す。
 */
async function attachOrphansBySharedNote(
  db: SupabaseClient,
  userId: string,
  orphanQuestionIds: string[],
  questionNoteById: Map<string, string>,
): Promise<number> {
  if (orphanQuestionIds.length === 0) return 0;

  const existing = await fetchExistingExplorations(db, userId);
  const noteToExploration = new Map<string, string>();
  for (const exploration of existing) {
    for (const noteId of exploration.note_ids) {
      if (!noteToExploration.has(noteId)) {
        noteToExploration.set(noteId, exploration.id);
      }
    }
  }

  const byExploration = new Map<string, string[]>();
  for (const qid of orphanQuestionIds) {
    const noteId = questionNoteById.get(qid);
    if (!noteId) continue;
    const explorationId = noteToExploration.get(noteId);
    if (!explorationId) continue;
    const list = byExploration.get(explorationId) ?? [];
    list.push(qid);
    byExploration.set(explorationId, list);
  }

  let attached = 0;
  for (const [explorationId, questionIds] of byExploration) {
    const existingRow = existing.find((e) => e.id === explorationId);
    const already = new Set(existingRow?.question_ids ?? []);
    const toInsert = questionIds.filter((id) => !already.has(id));
    if (toInsert.length === 0) continue;

    const { error } = await db.from('exploration_questions').insert(
      toInsert.map((item_id) => ({ exploration_id: explorationId, item_id })),
    );
    if (error) {
      console.warn('orphan attach failed', explorationId, error);
      continue;
    }
    attached += toInsert.length;
    if (
      existingRow &&
      (existingRow.graphic_rec_status === 'done' ||
        existingRow.graphic_rec_status === 'stale' ||
        existingRow.graphic_rec_storage_path)
    ) {
      await markGraphicRecStale(db, userId, explorationId);
    }
  }
  return attached;
}

async function wipeUserExplorations(db: SupabaseClient, userId: string): Promise<number> {
  const { data: rows, error } = await db
    .from('explorations')
    .select('id, graphic_rec_storage_path')
    .eq('user_id', userId);
  if (error) throw asError(error, 'Failed to list explorations for rebuild');

  const paths = (rows ?? [])
    .map((row) => row.graphic_rec_storage_path as string | null)
    .filter((path): path is string => !!path);

  if (paths.length > 0) {
    const { error: storageError } = await db.storage
      .from(GRAPHIC_REC_STORAGE_BUCKET)
      .remove(paths);
    if (storageError) {
      console.warn('Failed to remove graphic rec files on rebuild', storageError);
    }
  }

  const { error: deleteError } = await db.from('explorations').delete().eq('user_id', userId);
  if (deleteError) throw asError(deleteError, 'Failed to delete explorations for rebuild');
  return rows?.length ?? 0;
}

async function fetchExistingExplorations(
  db: SupabaseClient,
  userId: string,
): Promise<ExistingExploration[]> {
  const { data: explorations, error } = await db
    .from('explorations')
    .select('id, title, short_label, synthesis, graphic_rec_status, graphic_rec_storage_path')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw asError(error, 'Failed to fetch explorations');
  if (!explorations?.length) return [];

  const ids = explorations.map((row) => row.id);
  const [{ data: noteLinks }, { data: questionLinks }] = await Promise.all([
    db.from('exploration_notes').select('exploration_id, note_id').in('exploration_id', ids),
    db.from('exploration_questions').select('exploration_id, item_id').in('exploration_id', ids),
  ]);

  const notesByExploration = new Map<string, string[]>();
  for (const row of noteLinks ?? []) {
    const list = notesByExploration.get(row.exploration_id) ?? [];
    list.push(row.note_id);
    notesByExploration.set(row.exploration_id, list);
  }

  const questionsByExploration = new Map<string, string[]>();
  for (const row of questionLinks ?? []) {
    const list = questionsByExploration.get(row.exploration_id) ?? [];
    list.push(row.item_id);
    questionsByExploration.set(row.exploration_id, list);
  }

  return explorations.map((row) => ({
    id: row.id,
    title: row.title,
    short_label: row.short_label,
    synthesis: row.synthesis,
    graphic_rec_status: row.graphic_rec_status as string | null,
    graphic_rec_storage_path: row.graphic_rec_storage_path as string | null,
    note_ids: notesByExploration.get(row.id) ?? [],
    question_ids: questionsByExploration.get(row.id) ?? [],
  }));
}

async function buildClusterInput(
  db: SupabaseClient,
  userId: string,
  options?: { ignoreExisting?: boolean },
): Promise<{
  payload: Record<string, unknown>;
  validNoteIds: Set<string>;
  validQuestionIds: Set<string>;
  scopedQuestions: QuestionRow[];
  thoughtsByQuestionId: Map<string, string[]>;
  existingExplorations: ExistingExploration[];
  unclusteredCount: number;
} | null> {
  const ignoreExisting = options?.ignoreExisting === true;
  const existingExplorations = ignoreExisting
    ? []
    : await fetchExistingExplorations(db, userId);
  const clusteredQuestionIds = new Set(
    existingExplorations.flatMap((exploration) => exploration.question_ids),
  );
  const clusteredNoteIds = new Set(
    existingExplorations.flatMap((exploration) => exploration.note_ids),
  );

  const questionRows = await fetchAllTypedQuestions(db, userId);
  const candidateUnclustered = questionRows.filter((q) => !clusteredQuestionIds.has(q.id));

  // 分類済みメモ上の問いだけを「振り分け対象の未整理」とする（件数表示と一致）
  const typedNoteIdsForUnclustered = await fetchTypedNoteIds(
    db,
    userId,
    [...new Set(candidateUnclustered.map((q) => q.note_id))],
  );
  const unclustered = candidateUnclustered.filter((q) =>
    typedNoteIdsForUnclustered.has(q.note_id),
  );

  // 既存があり未整理ゼロ → AI 不要（呼び出し側で skipped）
  if (existingExplorations.length > 0 && unclustered.length === 0) {
    return null;
  }

  // 初回は問いが2件以上必要
  if (existingExplorations.length === 0 && questionRows.length < 2) {
    return null;
  }

  const clusteredOpen = questionRows.filter(
    (q) => clusteredQuestionIds.has(q.id) && !q.answered,
  );
  const clusteredAnswered = questionRows.filter(
    (q) => clusteredQuestionIds.has(q.id) && q.answered,
  );

  const selected: QuestionRow[] = [];
  const seen = new Set<string>();
  takeQuestions(unclustered, MAX_UNCLUSTERED_FOR_AI, selected, seen);
  takeQuestions(clusteredOpen, 15, selected, seen);
  takeQuestions(clusteredAnswered, MAX_QUESTIONS - selected.length, selected, seen);

  const scopedQuestions = dedupeQuestions(selected).slice(0, MAX_QUESTIONS);
  if (scopedQuestions.length < 1) return null;
  if (existingExplorations.length === 0 && scopedQuestions.length < 2) return null;

  const noteIds = [...new Set(scopedQuestions.map((q) => q.note_id))];
  // 既存探究のメモもコンテキストに含める
  for (const exploration of existingExplorations) {
    for (const noteId of exploration.note_ids) {
      if (!noteIds.includes(noteId)) noteIds.push(noteId);
    }
  }

  const { data: notes, error: notesError } = await db
    .from('notes')
    .select('id, raw_text, type, source_title, video_title, is_video')
    .eq('user_id', userId)
    .in('id', noteIds)
    .not('type', 'is', null);

  if (notesError) throw asError(notesError, 'Failed to fetch notes');

  const noteRows = (notes ?? []) as NoteRow[];
  if (existingExplorations.length === 0 && noteRows.length < 2) return null;

  const validNoteIds = new Set(noteRows.map((note) => note.id));
  const validQuestionIds = new Set(
    scopedQuestions.filter((q) => validNoteIds.has(q.note_id)).map((q) => q.id),
  );
  // 既存探究の問い id も valid に（更新時の完全リスト用）
  for (const exploration of existingExplorations) {
    for (const qid of exploration.question_ids) {
      validQuestionIds.add(qid);
    }
    for (const nid of exploration.note_ids) {
      validNoteIds.add(nid);
    }
  }

  const thoughtsByQuestionId = await fetchThoughtsForQuestions(
    db,
    userId,
    [...validQuestionIds],
  );

  const payload = {
    existing_explorations: existingExplorations.map((exploration) => ({
      id: exploration.id,
      title: exploration.title,
      short_label: exploration.short_label,
      synthesis: exploration.synthesis,
      note_ids: exploration.note_ids.filter((id) => validNoteIds.has(id)),
      question_ids: exploration.question_ids.filter((id) => validQuestionIds.has(id)),
    })),
    unclustered: {
      note_ids: noteIds.filter((id) => !clusteredNoteIds.has(id) && validNoteIds.has(id)),
      question_ids: scopedQuestions
        .filter((q) => !clusteredQuestionIds.has(q.id) && validNoteIds.has(q.note_id))
        .map((q) => q.id),
    },
    notes: noteRows.map((note) => ({
      id: note.id,
      type: note.type,
      label: noteLabel(note),
      raw_text: note.raw_text.slice(0, MAX_NOTE_TEXT),
      already_clustered: clusteredNoteIds.has(note.id),
    })),
    questions: scopedQuestions
      .filter((q) => validNoteIds.has(q.note_id))
      .map((question) => ({
        id: question.id,
        note_id: question.note_id,
        question_type: question.question_type,
        body: question.body.slice(0, MAX_QUESTION_BODY),
        answered: question.answered,
        user_thoughts: thoughtsByQuestionId.get(question.id) ?? [],
        already_clustered: clusteredQuestionIds.has(question.id),
      })),
  };

  return {
    payload,
    validNoteIds,
    validQuestionIds,
    scopedQuestions,
    thoughtsByQuestionId,
    existingExplorations,
    unclusteredCount: unclustered.length,
  };
}

function normalizeSubthemes(
  item: ClusterExploration,
  validQuestionIds: Set<string>,
): { label: string; question_ids: string[] }[] {
  const assigned = new Set<string>();
  const subthemes: { label: string; question_ids: string[] }[] = [];

  for (const subtheme of item.subthemes) {
    const question_ids = subtheme.question_ids.filter((id) => {
      if (!validQuestionIds.has(id) || assigned.has(id)) return false;
      assigned.add(id);
      return true;
    });
    if (question_ids.length > 0) {
      subthemes.push({ label: subtheme.label, question_ids });
    }
  }

  const orphanIds = item.question_ids.filter(
    (id) => validQuestionIds.has(id) && !assigned.has(id),
  );
  if (orphanIds.length > 0) {
    subthemes.push({
      label: subthemes.length === 0 ? 'まとめ' : 'その他',
      question_ids: orphanIds,
    });
  }

  return subthemes;
}

async function replaceExplorationLinks(
  db: SupabaseClient,
  explorationId: string,
  noteIds: string[],
  questionIds: string[],
  subthemes: { label: string; question_ids: string[] }[],
): Promise<void> {
  const { data: oldSubthemes } = await db
    .from('exploration_subthemes')
    .select('id')
    .eq('exploration_id', explorationId);
  const oldSubthemeIds = (oldSubthemes ?? []).map((row) => row.id as string);
  if (oldSubthemeIds.length > 0) {
    await db.from('exploration_subtheme_questions').delete().in('subtheme_id', oldSubthemeIds);
    await db.from('exploration_subthemes').delete().eq('exploration_id', explorationId);
  }
  await db.from('exploration_notes').delete().eq('exploration_id', explorationId);
  await db.from('exploration_questions').delete().eq('exploration_id', explorationId);

  if (noteIds.length > 0) {
    const { error: notesLinkError } = await db.from('exploration_notes').insert(
      noteIds.map((note_id) => ({ exploration_id: explorationId, note_id })),
    );
    if (notesLinkError) throw asError(notesLinkError, 'Failed to link notes');
  }

  if (questionIds.length > 0) {
    const { error: questionsLinkError } = await db.from('exploration_questions').insert(
      questionIds.map((item_id) => ({ exploration_id: explorationId, item_id })),
    );
    if (questionsLinkError) throw asError(questionsLinkError, 'Failed to link questions');
  }

  for (const [position, subtheme] of subthemes.entries()) {
    const { data: createdSubtheme, error: subthemeError } = await db
      .from('exploration_subthemes')
      .insert({
        exploration_id: explorationId,
        label: subtheme.label,
        position,
      })
      .select('id')
      .single();

    if (subthemeError || !createdSubtheme) {
      throw asError(subthemeError, 'Failed to create exploration subtheme');
    }

    if (subtheme.question_ids.length === 0) continue;

    const { error: subthemeQuestionsError } = await db
      .from('exploration_subtheme_questions')
      .insert(
        subtheme.question_ids.map((item_id) => ({
          subtheme_id: createdSubtheme.id,
          item_id,
        })),
      );
    if (subthemeQuestionsError) {
      throw asError(subthemeQuestionsError, 'Failed to link subtheme questions');
    }
  }
}

function shouldMarkStale(existing: ExistingExploration): boolean {
  // 見取り図がある探究を振り分けで更新したら stale
  if (existing.graphic_rec_status === 'done' || existing.graphic_rec_status === 'stale') {
    return true;
  }
  return !!existing.graphic_rec_storage_path;
}

async function markGraphicRecStale(
  db: SupabaseClient,
  userId: string,
  explorationId: string,
): Promise<void> {
  const { error } = await db
    .from('explorations')
    .update({ graphic_rec_status: 'stale' })
    .eq('id', explorationId)
    .eq('user_id', userId);
  if (error) {
    // 制約未適用でも振り分け自体は成功させる（クライアントは updated_at で判定）
    console.error('Failed to mark graphic_rec stale:', explorationId, error);
  }
}

/** AI が existing_exploration_id を省略しても、メモの重なりから既存探究に紐づける */
function resolveExistingExploration(
  item: NormalizedExploration,
  existingById: Map<string, ExistingExploration>,
  existingList: ExistingExploration[],
  claimedIds: Set<string>,
): ExistingExploration | undefined {
  const byId = item.existing_exploration_id
    ? existingById.get(item.existing_exploration_id)
    : undefined;
  if (byId && !claimedIds.has(byId.id)) return byId;

  let best: ExistingExploration | undefined;
  let bestOverlap = 0;
  for (const existing of existingList) {
    if (claimedIds.has(existing.id)) continue;
    const overlap = item.note_ids.filter((id) => existing.note_ids.includes(id)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = existing;
    }
  }
  // メモが2件以上重なる、または新規側メモの過半が既存に含まれる
  if (
    best &&
    (bestOverlap >= 2 || (item.note_ids.length > 0 && bestOverlap / item.note_ids.length >= 0.5))
  ) {
    return best;
  }
  return undefined;
}

export async function runClusterExplorations(
  db: SupabaseClient,
  userId: string,
  options?: { mode?: ClusterMode },
): Promise<ClusterResult> {
  const mode: ClusterMode = options?.mode === 'rebuild' ? 'rebuild' : 'incremental';

  const built = await buildClusterInput(db, userId, {
    ignoreExisting: mode === 'rebuild',
  });
  if (!built) {
    return { created: 0, updated: 0, skipped: true, remaining_unclustered: 0, mode };
  }

  const {
    payload,
    validNoteIds,
    validQuestionIds,
    scopedQuestions,
    thoughtsByQuestionId,
    existingExplorations,
    unclusteredCount,
  } = built;

  const aiPayload =
    mode === 'rebuild'
      ? { notes: payload.notes, questions: payload.questions }
      : payload;

  const unclusteredInBatch = new Set(
    mode === 'rebuild'
      ? scopedQuestions.map((q) => q.id)
      : (((payload.unclustered as { question_ids?: string[] } | undefined)?.question_ids ??
          []) as string[]),
  );
  if (unclusteredCount > unclusteredInBatch.size) {
    console.log(
      `cluster: ${unclusteredCount} unclustered total, sending ${unclusteredInBatch.size} to AI`,
    );
  }

  const existingById = new Map(
    mode === 'rebuild' ? [] : existingExplorations.map((row) => [row.id, row]),
  );

  const { data: clustered, inputTokens, outputTokens } = await callAnthropicJsonWithUsage(
    mode === 'rebuild' ? REBUILD_EXPLORATIONS_SYSTEM : CLUSTER_EXPLORATIONS_SYSTEM,
    JSON.stringify(aiPayload),
    clusterExplorationsResultSchema,
    { maxTokens: 16_384 },
  );

  await recordUsage(
    db,
    userId,
    mode === 'rebuild' ? 'rebuild-explorations' : 'cluster-explorations',
    inputTokens,
    outputTokens,
  );

  const questionNoteById = new Map(scopedQuestions.map((q) => [q.id, q.note_id]));
  // 既存探究の問い→メモも補完
  for (const exploration of existingExplorations) {
    for (const qid of exploration.question_ids) {
      if (!questionNoteById.has(qid)) {
        // note_id は exploration_notes 経由では取れないので、後で notes から補う必要はない
        // question の note_id は thread_items にあるが scoped 外の場合がある
      }
    }
  }

  // scoped 外の問いの note_id を一括取得
  const missingQuestionIds = [...validQuestionIds].filter((id) => !questionNoteById.has(id));
  if (missingQuestionIds.length > 0) {
    const { data: extraQuestions } = await db
      .from('thread_items')
      .select('id, note_id')
      .in('id', missingQuestionIds);
    for (const row of extraQuestions ?? []) {
      questionNoteById.set(row.id as string, row.note_id as string);
    }
  }

  const explorations = clustered.explorations
    .map((item) => {
      const question_ids = item.question_ids.filter((id) => validQuestionIds.has(id));
      const noteIdsFromQuestions = question_ids
        .map((id) => questionNoteById.get(id))
        .filter((id): id is string => !!id && validNoteIds.has(id));
      const note_ids = [
        ...new Set([
          ...item.note_ids.filter((id) => validNoteIds.has(id)),
          ...noteIdsFromQuestions,
        ]),
      ];
      return {
        ...item,
        note_ids,
        question_ids,
        subthemes: normalizeSubthemes(
          { ...item, note_ids, question_ids },
          validQuestionIds,
        ),
      };
    })
    .filter(
      (item) =>
        item.note_ids.length >= 1 &&
        item.question_ids.length >= 1 &&
        item.subthemes.length >= 1,
    )
    .slice(0, 6);

  if (explorations.length === 0) {
    if (mode === 'rebuild') {
      // 組み直しで有効な束が0なら既存を消さない
      throw new Error('組み直せる探究の束を作れませんでした。問いがもう少し溜まってから試してください。');
    }
    // AI が空でも、同じメモの探究へ機械的に足せるものは足す
    await attachOrphansBySharedNote(
      db,
      userId,
      [...unclusteredInBatch],
      questionNoteById,
    );
    const remaining = await countRemainingUnclustered(
      db,
      userId,
      await fetchExistingExplorations(db, userId),
    );
    return { created: 0, updated: 0, skipped: false, remaining_unclustered: remaining, mode };
  }

  // 組み直しは有効な束ができたあとに消す（失敗・空結果で既存を失わない）
  if (mode === 'rebuild') {
    const wiped = await wipeUserExplorations(db, userId);
    console.log(`cluster rebuild: wiped ${wiped} explorations after AI`);
  }

  const answeredById = new Map(scopedQuestions.map((q) => [q.id, q.answered]));
  // 既存問いの answered も補完
  const needAnswered = explorations
    .flatMap((item) => item.question_ids)
    .filter((id) => !answeredById.has(id));
  if (needAnswered.length > 0) {
    const { data: answerRows } = await db
      .from('thread_items')
      .select('id, answered')
      .in('id', [...new Set(needAnswered)]);
    for (const row of answerRows ?? []) {
      answeredById.set(row.id as string, Boolean(row.answered));
    }
  }

  let created = 0;
  let updated = 0;
  const claimedExistingIds = new Set<string>();

  for (const item of explorations) {
    const progress = computeEngagedProgress(
      item.question_ids,
      answeredById,
      thoughtsByQuestionId,
    );

    const existing = resolveExistingExploration(
      item,
      existingById,
      existingExplorations,
      claimedExistingIds,
    );

    if (existing) {
      claimedExistingIds.add(existing.id);
      // AI が差分だけ返しても既存メンバーを落とさない
      const note_ids = [...new Set([...existing.note_ids, ...item.note_ids])];
      const question_ids = [...new Set([...existing.question_ids, ...item.question_ids])];
      const subthemes = normalizeSubthemes(
        { ...item, note_ids, question_ids },
        new Set(question_ids),
      );
      const progressMerged = computeEngagedProgress(
        question_ids,
        answeredById,
        thoughtsByQuestionId,
      );
      const markStale = shouldMarkStale(existing);
      const updatePayload: Record<string, unknown> = {
        title: item.title,
        short_label: item.short_label,
        synthesis: item.synthesis,
        progress: progressMerged,
      };
      if (markStale) {
        updatePayload.graphic_rec_status = 'stale';
      }

      let { error: updateError } = await db
        .from('explorations')
        .update(updatePayload)
        .eq('id', existing.id)
        .eq('user_id', userId);

      // stale 制約未適用でも title 等は更新する（updated_at が動き、UI が古さを検知できる）
      if (updateError && markStale) {
        const msg = String((updateError as { message?: string }).message ?? '');
        console.warn('graphic_rec_status=stale failed; retrying without stale', msg);
        delete updatePayload.graphic_rec_status;
        ({ error: updateError } = await db
          .from('explorations')
          .update(updatePayload)
          .eq('id', existing.id)
          .eq('user_id', userId));
      }
      if (updateError) throw asError(updateError, 'Failed to update exploration');

      await replaceExplorationLinks(db, existing.id, note_ids, question_ids, subthemes);
      if (markStale && !updatePayload.graphic_rec_status) {
        // リトライで外した場合も、単独で再試行（成功すれば status も揃う）
        await markGraphicRecStale(db, userId, existing.id);
      }
      updated += 1;
      continue;
    }

    const { data: inserted, error: insertError } = await db
      .from('explorations')
      .insert({
        user_id: userId,
        title: item.title,
        short_label: item.short_label,
        synthesis: item.synthesis,
        progress,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      throw asError(insertError, 'Failed to create exploration');
    }

    await replaceExplorationLinks(
      db,
      inserted.id,
      item.note_ids,
      item.question_ids,
      item.subthemes,
    );
    created += 1;
  }

  // AI が未整理を残した場合: 同じメモが既にある探究へ足す
  const afterExplorations = await fetchExistingExplorations(db, userId);
  const clusteredAfter = new Set(
    afterExplorations.flatMap((e) => e.question_ids),
  );
  const stillOrphan = [...unclusteredInBatch].filter((id) => !clusteredAfter.has(id));
  if (stillOrphan.length > 0) {
    console.log(`cluster: attaching ${stillOrphan.length} orphans by shared note`);
    await attachOrphansBySharedNote(db, userId, stillOrphan, questionNoteById);
  }

  const remaining = await countRemainingUnclustered(
    db,
    userId,
    await fetchExistingExplorations(db, userId),
  );

  return { created, updated, skipped: false, remaining_unclustered: remaining, mode };
}
