-- Pictures chosen in Chapter Book. The file bytes live here; site_items.image_id
-- points at one row. The public page serves /api/site-image/<id> from this table.
create table if not exists site_images (
  id text primary key,
  chapter_id text not null references chapters (id) on delete cascade,
  mime text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

alter table site_items add column if not exists image_id text;

create index if not exists site_items_image_idx
  on site_items (image_id)
  where image_id is not null and image_id <> '';
