-- Password reset links an admin hands out. Only a hash of each token is kept.
create table if not exists operator_resets (
  id text primary key,
  chapter_id text not null references chapters (id),
  user_id text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists operator_resets_user_idx on operator_resets (user_id, created_at);
