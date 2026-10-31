alter table registration_attendees add column if not exists prior_guest_status text;
alter table registration_attendees add column if not exists created_participation boolean not null default false;
alter table registration_pages add column if not exists hold_hours integer;
