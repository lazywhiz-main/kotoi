import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient, getUserFromRequest } from '../_shared/supabase.ts';

const GRAPHIC_BUCKET = 'exploration-graphic-rec';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== 'DELETE') {
      return jsonResponse({ error: 'confirm_required' }, 400);
    }

    const db = getServiceClient();
    const userId = user.id;

    // Best-effort: remove storage objects under user folder
    try {
      const { data: files } = await db.storage.from(GRAPHIC_BUCKET).list(userId, { limit: 1000 });
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        await db.storage.from(GRAPHIC_BUCKET).remove(paths);
      }
    } catch (storageErr) {
      console.error('delete-account storage cleanup:', storageErr);
    }

    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('delete-account error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
