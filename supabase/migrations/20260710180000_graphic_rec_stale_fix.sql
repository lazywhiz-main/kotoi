-- graphic_rec_status の CHECK を確実に stale 対応へ（名前違いの旧制約も落とす）

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'explorations'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%graphic_rec_status%'
  loop
    execute format('alter table public.explorations drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.explorations
  add constraint explorations_graphic_rec_status_check
  check (graphic_rec_status is null or graphic_rec_status in ('pending', 'done', 'error', 'stale'));
