-- 探究内の「切り口」ハブ（問いの地図・中間リング用）
create table exploration_subthemes (
  id             uuid primary key default gen_random_uuid(),
  exploration_id uuid not null references explorations(id) on delete cascade,
  label          text not null,
  position       int not null default 0
);
create index exploration_subthemes_exploration_idx
  on exploration_subthemes (exploration_id, position);

create table exploration_subtheme_questions (
  subtheme_id uuid not null references exploration_subthemes(id) on delete cascade,
  item_id     uuid not null references thread_items(id) on delete cascade,
  primary key (subtheme_id, item_id)
);

alter table exploration_subthemes          enable row level security;
alter table exploration_subtheme_questions   enable row level security;

create policy own_expl_subthemes on exploration_subthemes for all
  using (exists (
    select 1 from explorations e
    where e.id = exploration_id and e.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from explorations e
    where e.id = exploration_id and e.user_id = auth.uid()
  ));

create policy own_expl_subtheme_qs on exploration_subtheme_questions for all
  using (exists (
    select 1 from exploration_subthemes s
    join explorations e on e.id = s.exploration_id
    where s.id = subtheme_id and e.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from exploration_subthemes s
    join explorations e on e.id = s.exploration_id
    where s.id = subtheme_id and e.user_id = auth.uid()
  ));

grant select, insert, update, delete on exploration_subthemes to authenticated;
grant select, insert, update, delete on exploration_subtheme_questions to authenticated;
