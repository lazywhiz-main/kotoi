import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
