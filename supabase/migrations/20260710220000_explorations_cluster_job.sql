-- 探究の振り分け／組み直しジョブ（ユーザー単位・非同期）

alter table user_settings
  add column if not exists explorations_job_status text
    check (explorations_job_status is null or explorations_job_status in ('pending', 'error')),
  add column if not exists explorations_job_mode text
    check (explorations_job_mode is null or explorations_job_mode in ('incremental', 'rebuild')),
  add column if not exists explorations_job_error text,
  add column if not exists explorations_job_started_at timestamptz;
