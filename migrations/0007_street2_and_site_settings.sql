-- Apartment line, and the public site identity block.
-- 0006 may already be applied; every statement is idempotent.

alter table persons add column if not exists street2 text;
alter table persons add column if not exists website text;

create table if not exists site_settings (
  chapter_id text primary key references chapters (id),
  public_title text not null,
  public_tagline text,
  about text,
  contact_email text,
  updated_at timestamptz not null default now()
);
