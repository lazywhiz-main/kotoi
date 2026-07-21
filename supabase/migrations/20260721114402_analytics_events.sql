-- CX / product analytics (L1). Memo body must never land in props (enforced in Edge track-event).

create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  schema_ver  smallint not null default 1,
  created_at  timestamptz not null default now()
);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at desc);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (name, created_at desc);

alter table public.analytics_events enable row level security;

create policy own_analytics_events_select on public.analytics_events
  for select using (user_id = auth.uid());

-- Inserts go through Edge track-event (service role). No authenticated INSERT.

grant select on public.analytics_events to authenticated;
