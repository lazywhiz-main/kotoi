import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { fetchLinkPreview } from '../_shared/linkPreview.ts';
import { getUserFromRequest } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return jsonResponse({ error: 'url is required' }, 400);
    }

    const preview = await fetchLinkPreview(url.trim());
    return jsonResponse(preview);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('fetch-link-preview error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
