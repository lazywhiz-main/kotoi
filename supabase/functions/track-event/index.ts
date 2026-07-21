import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

const ALLOWED = new Set([
  'session_started',
  'note_created',
  'thread_opened',
  'shelf_opened',
  'question_opened',
  'daily_question_shown',
  'daily_question_action',
  'daily_question_enable',
  'paywall_shown',
  'purchase_result',
  'annual_upgrade_tapped',
  'annual_upgrade_result',
]);

const FORBIDDEN_PROP_KEYS = new Set([
  'raw_text',
  'body',
  'email',
  'transcript',
  'password',
  'content',
  'text',
  'message',
  'prompt',
]);

function sanitizeProps(input: unknown): Record<string, string | number | boolean | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if (FORBIDDEN_PROP_KEYS.has(k)) continue;
    if (k.includes('raw_') || k.includes('transcript') || k.includes('password')) continue;
    if (value === null) {
      out[key] = null;
      continue;
    }
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      if (t === 'string' && (value as string).length > 200) {
        out[key] = (value as string).slice(0, 200);
      } else {
        out[key] = value as string | number | boolean;
      }
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || !ALLOWED.has(name)) {
      return jsonResponse({ error: 'invalid_event' }, 400);
    }

    const schema_ver =
      typeof body.schema_ver === 'number' && Number.isFinite(body.schema_ver)
        ? Math.trunc(body.schema_ver)
        : 1;
    const props = sanitizeProps(body.props);

    const db = getServiceClient();

    // Simple flood guard: same event name more than 40 times in 60s → drop silently
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await db
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('name', name)
      .gte('created_at', since);

    if ((count ?? 0) >= 40) {
      return jsonResponse({ ok: true, dropped: true });
    }

    const { error } = await db.from('analytics_events').insert({
      user_id: user.id,
      name,
      props,
      schema_ver,
    });
    if (error) throw error;

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
