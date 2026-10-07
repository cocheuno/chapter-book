-- Talks can be kept off the homepage Articles shelf. Every existing item stays where it is.
alter table site_items add column if not exists on_shelf boolean not null default true;
