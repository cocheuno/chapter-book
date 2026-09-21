-- Public detail pages for website items (events, articles, …). Empty slug is unpublished-as-page.
alter table site_items add column if not exists slug text;
alter table site_items add column if not exists body text;

create unique index if not exists site_items_slug_uq
  on site_items (chapter_id, slug)
  where slug is not null and slug <> '';
