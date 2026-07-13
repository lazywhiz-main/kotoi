-- graphic_rec_status に stale を追加（振り分け後・内容変更時）

alter table explorations
  drop constraint if exists explorations_graphic_rec_status_check;

alter table explorations
  add constraint explorations_graphic_rec_status_check
  check (graphic_rec_status is null or graphic_rec_status in ('pending', 'done', 'error', 'stale'));
