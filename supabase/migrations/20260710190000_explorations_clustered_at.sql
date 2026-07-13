-- 最後に探究の振り分けを実行した時刻（「探究は最新です」判定用）

alter table user_settings
  add column if not exists explorations_clustered_at timestamptz;
