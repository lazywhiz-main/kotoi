-- 記事URLの本文取得（動画の video_transcript に相当）
alter table notes
  add column if not exists article_body text,
  add column if not exists article_status item_status;

comment on column notes.article_body is '記事ページから抽出した本文（要約・問いの材料）';
comment on column notes.article_status is 'pending/done/error。非記事は null';
