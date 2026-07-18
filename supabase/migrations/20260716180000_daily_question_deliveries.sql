-- 今日の問い（別角度の呼び戻し）+ user_settings 拡張

alter table user_settings
  add column if not exists recall_rhythm text not null default 'weekly'
    check (recall_rhythm in ('off', 'daily', 'weekdays', 'weekly')),
  add column if not exists recall_weekday smallint not null default 0
    check (recall_weekday >= 0 and recall_weekday <= 6),
  add column if not exists recall_hour smallint not null default 8
    check (recall_hour >= 0 and recall_hour <= 23),
  add column if not exists notify_daily_question boolean not null default true;

comment on column user_settings.recall_rhythm is '別角度の呼び戻し: off|daily|weekdays|weekly';
comment on column user_settings.recall_weekday is 'weekly 時の曜日 0=日..6=土';
comment on column user_settings.recall_hour is '配信時刻 JST 0-23';

create table daily_question_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  question_type        text not null check (question_type in ('dig', 'con', 'ref', 'act', 'exp')),
  body                 text not null,
  why_now              text,
  anchor_note_id       uuid not null references notes(id) on delete cascade,
  anchor_question_id   uuid references thread_items(id) on delete set null,
  status               text not null default 'active'
    check (status in ('active', 'saved', 'dismissed', 'expired')),
  delivered_on         date not null,
  saved_thread_item_id uuid references thread_items(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, delivered_on)
);

create index daily_question_deliveries_user_active_idx
  on daily_question_deliveries (user_id, delivered_on desc)
  where status = 'active';

create trigger daily_question_deliveries_updated
  before update on daily_question_deliveries
  for each row execute function set_updated_at();

alter table daily_question_deliveries enable row level security;

create policy own_daily_question_deliveries on daily_question_deliveries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on daily_question_deliveries to authenticated;
