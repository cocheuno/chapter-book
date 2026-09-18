-- Gatherings are private or free (DESIGN.md). Default free so existing rows stay
-- invite-only-to-the-chapter until an editor marks them private.
alter table events add column if not exists admission text not null default 'free';
