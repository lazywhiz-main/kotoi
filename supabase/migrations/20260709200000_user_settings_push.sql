-- user_settings: 通知などユーザー設定
create table user_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  notify_agent_done    boolean not null default true,
  notify_weekly_review boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger user_settings_updated
  before update on user_settings
  for each row execute function set_updated_at();

alter table user_settings enable row level security;

create policy own_user_settings on user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- push_tokens: Expo Push Token
create table push_tokens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  expo_push_token  text not null,
  platform         text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index push_tokens_user_idx on push_tokens (user_id);

create trigger push_tokens_updated
  before update on push_tokens
  for each row execute function set_updated_at();

alter table push_tokens enable row level security;

create policy own_push_tokens on push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
