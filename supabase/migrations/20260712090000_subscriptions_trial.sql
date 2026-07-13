-- M6: 到達トライアル / 課金状態
-- ペイウォールは「2枚目の見取り図生成」または安全弁。1枚目は完全に渡す。

create type trial_state as enum
  ('active', 'achieved', 'expired', 'subscribed', 'read_only');

create type plan_kind as enum
  ('monthly', 'annual', 'student_monthly', 'student_annual');

create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_state trial_state not null default 'active',
  trial_started_at timestamptz not null default now(),
  trial_achieved_at timestamptz,
  paywall_shown_at timestamptz,
  free_graphic_rec_exploration_id uuid references explorations(id) on delete set null,
  plan plan_kind,
  is_student boolean not null default false,
  student_verified_at timestamptz,
  store text,
  store_txn_id text,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated
  before update on subscriptions
  for each row execute function set_updated_at();

alter table subscriptions enable row level security;

-- クライアントは読み取りのみ。状態変更は Edge Function（service_role）のみ。
create policy own_sub_select on subscriptions
  for select using (user_id = auth.uid());

grant select on subscriptions to authenticated;

-- 新規ユーザーに trial 行を自動作成
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_subscription on auth.users;
create trigger on_auth_user_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

-- 既存ユーザーを埋める
insert into public.subscriptions (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- すでに見取り図があるユーザーは 1 枠消費済み扱いにする
update public.subscriptions s
set
  free_graphic_rec_exploration_id = first_done.exploration_id,
  trial_state = case
    when s.trial_state = 'active' then 'achieved'::trial_state
    else s.trial_state
  end,
  trial_achieved_at = coalesce(s.trial_achieved_at, first_done.generated_at)
from (
  select distinct on (e.user_id)
    e.user_id,
    e.id as exploration_id,
    coalesce(e.graphic_rec_generated_at, e.updated_at) as generated_at
  from public.explorations e
  where e.graphic_rec_status = 'done'
  order by e.user_id, e.graphic_rec_generated_at asc nulls last, e.created_at asc
) first_done
where s.user_id = first_done.user_id
  and s.free_graphic_rec_exploration_id is null;

create or replace view trial_progress
with (security_invoker = true)
as
  select
    s.user_id,
    s.trial_state,
    s.trial_started_at,
    s.free_graphic_rec_exploration_id,
    (select count(*)::int from notes n where n.user_id = s.user_id) as note_count,
    (select count(*)::int from explorations e where e.user_id = s.user_id) as exploration_count,
    (select count(*)::int from explorations e
       where e.user_id = s.user_id and e.graphic_rec_status = 'done') as graphic_rec_done_count,
    (select coalesce(sum(u.cost_usd), 0) from usage_ledger u where u.user_id = s.user_id) as total_cost_usd,
    extract(day from now() - s.trial_started_at)::int as days_elapsed
  from subscriptions s
  where s.user_id = auth.uid();

grant select on trial_progress to authenticated;
