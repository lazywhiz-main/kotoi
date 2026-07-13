-- 探究「見取り図」（グラレコ風 AI 画像）

alter table explorations
  add column if not exists graphic_rec_status text
    check (graphic_rec_status in ('pending', 'done', 'error')),
  add column if not exists graphic_rec_variant text
    check (graphic_rec_variant in ('metaphor', 'narrative', 'human', 'spatial')),
  add column if not exists graphic_rec_storage_path text,
  add column if not exists graphic_rec_prompt_version text,
  add column if not exists graphic_rec_selection_reason text,
  add column if not exists graphic_rec_error text,
  add column if not exists graphic_rec_generated_at timestamptz;

-- Storage: exploration-graphic-rec/{user_id}/{exploration_id}.png
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exploration-graphic-rec',
  'exploration-graphic-rec',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy exploration_graphic_rec_select_own
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'exploration-graphic-rec'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
