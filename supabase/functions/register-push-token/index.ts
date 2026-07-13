import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const expo_push_token = (body.expo_push_token as string | undefined)?.trim();
    const platform = (body.platform as string | undefined)?.trim() ?? 'unknown';

    if (!expo_push_token) {
      return jsonResponse({ error: 'expo_push_token is required' }, 400);
    }

    const db = getServiceClient();

    const { error: tokenError } = await db.from('push_tokens').upsert(
      {
        user_id: user.id,
        expo_push_token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' },
    );

    if (tokenError) throw tokenError;

    const { error: settingsError } = await db.from('user_settings').upsert(
      { user_id: user.id },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );

    if (settingsError) throw settingsError;

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});
