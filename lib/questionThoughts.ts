import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_THOUGHT_SNIPPET = 120;

export type ThoughtRow = {
  parent_item_id: string | null;
  body: string;
};

export function clipThought(body: string, max = MAX_THOUGHT_SNIPPET): string {
  const text = body.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function groupThoughtsByQuestionId(rows: ThoughtRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_item_id) continue;
    const list = map.get(row.parent_item_id) ?? [];
    list.push(row.body);
    map.set(row.parent_item_id, list);
  }
  return map;
}

export function isQuestionEngaged(answered: boolean, thoughts: string[]): boolean {
  return answered || thoughts.length > 0;
}

export function computeEngagedProgress(
  questionIds: string[],
  answeredById: Map<string, boolean>,
  thoughtsByQuestionId: Map<string, string[]>,
): number {
  if (questionIds.length === 0) return 0;
  const engaged = questionIds.filter((id) =>
    isQuestionEngaged(answeredById.get(id) ?? false, thoughtsByQuestionId.get(id) ?? []),
  ).length;
  return Math.round((engaged / questionIds.length) * 100);
}

export function countEngagedQuestions(
  questionIds: string[],
  answeredById: Map<string, boolean>,
  thoughtsByQuestionId: Map<string, string[]>,
): number {
  return questionIds.filter((id) =>
    isQuestionEngaged(answeredById.get(id) ?? false, thoughtsByQuestionId.get(id) ?? []),
  ).length;
}

export async function fetchThoughtsForQuestions(
  supabase: SupabaseClient,
  userId: string,
  questionIds: string[],
): Promise<Map<string, string[]>> {
  if (questionIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('thread_items')
    .select('parent_item_id, body')
    .eq('user_id', userId)
    .eq('kind', 'note')
    .eq('author', 'user')
    .in('parent_item_id', questionIds)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return groupThoughtsByQuestionId((data ?? []) as ThoughtRow[]);
}
