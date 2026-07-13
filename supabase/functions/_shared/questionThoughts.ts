import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const MAX_THOUGHT_SNIPPET = 120;

type ThoughtRow = {
  parent_item_id: string | null;
  body: string;
};

function clipThought(body: string): string {
  const text = body.trim();
  return text.length > MAX_THOUGHT_SNIPPET ? `${text.slice(0, MAX_THOUGHT_SNIPPET)}…` : text;
}

function groupThoughtsByQuestionId(rows: ThoughtRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_item_id) continue;
    const list = map.get(row.parent_item_id) ?? [];
    list.push(clipThought(row.body));
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

export async function fetchThoughtsForQuestions(
  db: SupabaseClient,
  userId: string,
  questionIds: string[],
): Promise<Map<string, string[]>> {
  if (questionIds.length === 0) return new Map();

  const { data, error } = await db
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
