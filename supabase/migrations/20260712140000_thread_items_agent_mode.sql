-- research / dig の再実行時にモードを復元するため
alter table thread_items
  add column if not exists agent_mode text
  check (agent_mode is null or agent_mode in ('research', 'dig'));

comment on column thread_items.agent_mode is
  'kind=request|result のエージェント処理モード（research / dig）。再実行用。';
