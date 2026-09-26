-- Speakers belong to the conference, not to a single text field on one session.
-- Adding a speaker inserts a row. It does not rewrite another speaker.
create table if not exists event_speakers (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  name text not null,
  role text,
  body text,
  image_id text,
  sort_order integer not null default 0
);

alter table event_sessions add column if not exists speaker_id text;

create index if not exists event_speakers_event_idx
  on event_speakers (event_id, sort_order);
