create table if not exists person_emails (
  id text primary key,
  chapter_id text not null,
  person_id text not null references persons (id) on delete cascade,
  email text not null,
  label text,
  created_at timestamptz not null default now(),
  created_by text
);
create unique index if not exists person_emails_email_uq on person_emails (chapter_id, lower(email));
create index if not exists person_emails_person_idx on person_emails (person_id);
