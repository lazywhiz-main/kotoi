import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function sendPushToUser(
  db: SupabaseClient,
  userId: string,
  payload: PushPayload,
  settingKey: 'notify_agent_done' | 'notify_weekly_review' = 'notify_agent_done',
): Promise<void> {
  const { data: settings } = await db
    .from('user_settings')
    .select('notify_agent_done, notify_weekly_review')
    .eq('user_id', userId)
    .maybeSingle();

  const enabled = settings?.[settingKey] ?? true;
  if (!enabled) return;

  const { data: tokens, error } = await db
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId);

  if (error || !tokens?.length) return;

  const messages = tokens.map((row) => ({
    to: row.expo_push_token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('Expo push error:', detail);
  }
}
