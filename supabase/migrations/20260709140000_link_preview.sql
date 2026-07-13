-- リンク先のタイトル・サムネ（OG / oEmbed）
alter table notes
  add column if not exists source_title text,
  add column if not exists source_image_url text;
