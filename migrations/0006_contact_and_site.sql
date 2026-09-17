-- Contact fields, a full middle name, and the public website shelf.
-- Idempotent: 0005 may not have applied on an already-running preview.

alter table persons add column if not exists middle_initial text;
alter table persons add column if not exists middle_name text;
alter table persons add column if not exists suffix text;
alter table persons add column if not exists street text;
alter table persons add column if not exists postal_code text;
alter table persons add column if not exists mobile text;
alter table persons add column if not exists website text;

update persons
set middle_name = middle_initial
where middle_name is null and middle_initial is not null;

create table if not exists site_settings (
  chapter_id text primary key references chapters (id),
  public_title text not null,
  public_tagline text,
  about text,
  contact_email text,
  updated_at timestamptz not null default now()
);

create table if not exists site_items (
  id text primary key,
  chapter_id text not null references chapters (id),
  kind text not null,
  title text not null,
  subtitle text,
  summary text,
  url text,
  location text,
  when_label text,
  audience text,
  featured boolean not null default false,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists site_items_chapter_kind_idx
  on site_items (chapter_id, kind, sort_order);

create unique index if not exists site_items_title_uq
  on site_items (chapter_id, kind, lower(title));
