alter table site_settings add column if not exists top_item_id text;
alter table site_settings add column if not exists top_auto boolean not null default false;
alter table site_settings add column if not exists home_sections text;
