-- A conference on the Events desk can fill the public conference page.
-- Speaker text is typed for the public page. It is not a person from the book.
alter table events add column if not exists public_item_id text;

alter table event_sessions add column if not exists public_speaker text;
alter table event_sessions add column if not exists when_label text;
alter table event_sessions add column if not exists track text;
alter table event_sessions add column if not exists summary text;
alter table event_sessions add column if not exists body text;
alter table event_sessions add column if not exists article_url text;
alter table event_sessions add column if not exists image_id text;
alter table event_sessions add column if not exists featured boolean not null default false;
alter table event_sessions add column if not exists site_item_id text;
