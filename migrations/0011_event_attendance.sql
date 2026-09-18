-- Named guests (same name may appear more than once) and Mass / dinner / lecture.
alter table participations add column if not exists guest_name text;
alter table participations add column if not exists coming_to_mass boolean not null default true;
alter table participations add column if not exists coming_to_dinner boolean not null default false;
alter table participations add column if not exists coming_to_lecture boolean not null default false;
