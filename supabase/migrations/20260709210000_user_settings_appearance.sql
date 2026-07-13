alter table user_settings
  add column if not exists appearance text not null default 'system'
  check (appearance in ('system', 'light', 'dark'));
