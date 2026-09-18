-- Invite-only operators (accepted review). Disable without deleting the person
-- who holds the login. Invites are a copied link until SMTP exists.

alter table chapter_members add column if not exists disabled_at timestamptz;

create table if not exists operator_invites (
  id text primary key,
  chapter_id text not null references chapters (id),
  email text not null,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  token_hash text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create index if not exists operator_invites_chapter_email_idx
  on operator_invites (chapter_id, email);
