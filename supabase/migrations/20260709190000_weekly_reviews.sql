-- 週次ふりかえりの履歴（Insert のみ・時系列で蓄積）
create table weekly_reviews (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  period_start             timestamptz not null,
  period_end               timestamptz not null,
  period_label             text not null,
  stats                    jsonb not null,
  recurring_theme          text not null,
  hottest_question_id      uuid references thread_items(id) on delete set null,
  hottest_question_note_id uuid references notes(id) on delete set null,
  hottest_question_body    text,
  hottest_question_type    text,
  recall_question_id       uuid references thread_items(id) on delete set null,
  recall_question_note_id  uuid references notes(id) on delete set null,
  recall_prompt            text,
  recall_weeks_ago         int,
  exploration_id           uuid references explorations(id) on delete set null,
  activity_watermark       timestamptz not null,
  generated_at             timestamptz not null default now()
);

create index weekly_reviews_user_time_idx
  on weekly_reviews (user_id, generated_at desc);

alter table weekly_reviews enable row level security;

create policy own_weekly_reviews on weekly_reviews for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert on weekly_reviews to authenticated;
