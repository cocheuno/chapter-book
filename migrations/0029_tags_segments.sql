-- Tags and saved lists. New empty tables only.

create table if not exists tags (
  id text primary key,
  chapter_id text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tags_name_uq on tags (chapter_id, lower(name));

create table if not exists person_tags (
  person_id text not null references persons (id) on delete cascade,
  tag_id text not null references tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (person_id, tag_id)
);

create table if not exists segments (
  id text primary key,
  chapter_id text not null,
  name text not null,
  filter jsonb not null,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now()
);

create unique index if not exists segments_name_uq on segments (chapter_id, lower(name));
