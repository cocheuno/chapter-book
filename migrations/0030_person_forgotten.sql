-- Forget a person. Existing rows keep this empty until an admin forgets someone.
alter table persons add column if not exists forgotten_at timestamptz;
