-- ============================================================
-- MONDO — Supabase schema (migration 0001_init)
-- Postgres 15 / Supabase. Apply as: supabase/migrations/0001_init.sql
-- 単一ユーザー前提だが、全行に user_id を持たせRLSで保護する。
-- ============================================================

-- ---- enums ----
create type note_type   as enum ('seed','learn','task','feeling','ref');
create type item_author as enum ('ai','user','agent');
create type item_kind   as enum ('summary','question','note','request','result','answer');
create type question_type as enum ('dig','con','ref','act','exp'); -- 深掘り/接続/反証/行動/拡張
create type item_status  as enum ('pending','done','error');

-- ---- notes (ルートメモ) ----
create table notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  raw_text      text not null default '',
  type          note_type,                    -- classify-note が後から埋める（初期はnull）
  is_video      boolean not null default false,
  source_url    text,                          -- 動画/記事リンク
  source_title  text,                          -- OG / oEmbed タイトル
  source_image_url text,                       -- OG / oEmbed サムネ
  video_title   text,
  video_transcript text,                       -- fetch-transcript が保存
  transcript_status item_status,              -- 動画の文字起こし状態（null=非動画）
  classified_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index notes_user_created_idx on notes (user_id, created_at desc);

-- ---- thread_items (スレッドにぶら下がる全要素) ----
-- 1メモに対する 要約/問い/ユーザー追記/依頼/結果/回答 を時系列で保持
create table thread_items (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid not null references notes(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  author        item_author not null,
  kind          item_kind not null,
  question_type question_type,                 -- kind='question' のときのみ
  body          text not null default '',
  parent_item_id uuid references thread_items(id) on delete set null, -- 問い→枝, 依頼→結果 の連結
  status        item_status not null default 'done', -- agent処理中は 'pending'
  answered      boolean not null default false,       -- 問いに回答/対応したか（問いの棚のフィルタ）
  answered_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index thread_items_note_idx on thread_items (note_id, created_at);
create index thread_items_open_questions_idx
  on thread_items (user_id, created_at desc)
  where kind = 'question' and answered = false;

-- ---- explorations (探究 / テーマクラスタ) ----
create table explorations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  short_label  text,                           -- 問いの地図の中心ノード用（短縮名）
  synthesis    text,                           -- 「この束が示唆すること」
  progress     int not null default 0,         -- 0-100
  graphic_rec_status text check (graphic_rec_status in ('pending', 'done', 'error', 'stale')),
  graphic_rec_variant text check (graphic_rec_variant in ('metaphor', 'narrative', 'human', 'spatial')),
  graphic_rec_storage_path text,
  graphic_rec_prompt_version text,
  graphic_rec_selection_reason text,
  graphic_rec_error text,
  graphic_rec_generated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index explorations_user_idx on explorations (user_id, updated_at desc);

-- 探究に属するメモ
create table exploration_notes (
  exploration_id uuid not null references explorations(id) on delete cascade,
  note_id        uuid not null references notes(id) on delete cascade,
  primary key (exploration_id, note_id)
);

-- 探究に属する問い（thread_items の question を参照）
create table exploration_questions (
  exploration_id uuid not null references explorations(id) on delete cascade,
  item_id        uuid not null references thread_items(id) on delete cascade,
  primary key (exploration_id, item_id)
);

-- ---- tags (ドメインタグ: 仕事/私事/案件名 等。分類=typeとは別) ----
create table tags (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  name     text not null,
  unique (user_id, name)
);
create table note_tags (
  note_id uuid not null references notes(id) on delete cascade,
  tag_id  uuid not null references tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

-- ---- usage_ledger (日次コスト制御) ----
create table usage_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  day          date not null default current_date,
  fn           text not null,                  -- 呼んだEdge Function名
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd     numeric(10,4) not null default 0,
  created_at   timestamptz not null default now()
);
create index usage_ledger_day_idx on usage_ledger (user_id, day);

-- ---- classification_feedback (分類の訂正ログ → プロンプト改善用) ----
create table classification_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  note_id     uuid not null references notes(id) on delete cascade,
  from_type   note_type,
  to_type     note_type not null,
  created_at  timestamptz not null default now()
);

-- ---- updated_at 自動更新 ----
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
create trigger notes_updated       before update on notes        for each row execute function set_updated_at();
create trigger explorations_updated before update on explorations for each row execute function set_updated_at();

-- ============================================================
-- RLS: 全テーブル、本人の行のみ
-- ============================================================
alter table notes                  enable row level security;
alter table thread_items           enable row level security;
alter table explorations           enable row level security;
alter table exploration_notes      enable row level security;
alter table exploration_questions  enable row level security;
alter table tags                   enable row level security;
alter table note_tags              enable row level security;
alter table usage_ledger           enable row level security;
alter table classification_feedback enable row level security;

-- user_id を直接持つテーブル
create policy own_notes        on notes                 for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_items        on thread_items          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_expl         on explorations          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_tags         on tags                  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_usage        on usage_ledger          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_feedback     on classification_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 連結テーブルは親のuser_id経由で判定
create policy own_expl_notes on exploration_notes for all
  using (exists (select 1 from explorations e where e.id = exploration_id and e.user_id = auth.uid()))
  with check (exists (select 1 from explorations e where e.id = exploration_id and e.user_id = auth.uid()));
create policy own_expl_qs on exploration_questions for all
  using (exists (select 1 from explorations e where e.id = exploration_id and e.user_id = auth.uid()))
  with check (exists (select 1 from explorations e where e.id = exploration_id and e.user_id = auth.uid()));
create policy own_note_tags on note_tags for all
  using (exists (select 1 from notes n where n.id = note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from notes n where n.id = note_id and n.user_id = auth.uid()));

-- ============================================================
-- 便利ビュー: 問いの棚（未回答の問い一覧）
-- ============================================================
create view open_questions as
  select ti.id, ti.user_id, ti.note_id, ti.question_type, ti.body, ti.created_at,
         n.raw_text as note_raw, n.is_video, n.video_title
  from thread_items ti
  join notes n on n.id = ti.note_id
  where ti.kind = 'question' and ti.answered = false;
