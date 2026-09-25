-- An event can own one website page. An announcement can point at that event
-- so the public card shows the event page plus the announcement's own words.
alter table events add column if not exists public_item_id text;
alter table site_items add column if not exists gathering_id text;

create index if not exists site_items_gathering_idx
  on site_items (chapter_id, gathering_id)
  where gathering_id is not null and gathering_id <> '';
