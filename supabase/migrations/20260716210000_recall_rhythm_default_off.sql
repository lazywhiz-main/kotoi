-- 別角度の呼び戻し: 新規ユーザーは既定オフ（棚でオンを促す）
alter table user_settings
  alter column recall_rhythm set default 'off';

comment on column user_settings.recall_rhythm is
  '別角度の呼び戻し: off|daily|weekdays|weekly（既定 off。棚でオン誘導）';
