-- 契約期間の開始（購読後の利用集計用）。実 Store でも Receipt 検証時に同じ列を更新する。
alter table subscriptions
  add column if not exists current_period_start timestamptz;

comment on column subscriptions.current_period_start is
  '現在の課金期間の開始。usage の「契約期間の利用」集計に使う。';
