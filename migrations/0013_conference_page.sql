-- A published event can open as a conference page. Other shelf items
-- point at that event with conference_id. Null layout is an ordinary page.
alter table site_items add column if not exists layout text;
alter table site_items add column if not exists conference_id text;

create index if not exists site_items_conference_idx
  on site_items (chapter_id, conference_id)
  where conference_id is not null and conference_id <> '';
