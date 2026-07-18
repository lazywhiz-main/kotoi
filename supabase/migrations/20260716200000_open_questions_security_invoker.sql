-- open_questions: ビュー既定の security definer をやめ、下の RLS を効かせる
-- （trial_progress と同型。問いの棚 / タブ件数の読み取り用）

alter view open_questions set (security_invoker = true);

comment on view open_questions is
  '問いの棚用: 未回答 question + メモ抜粋。security_invoker で thread_items/notes の RLS を適用';
