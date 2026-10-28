alter table registration_attendees add column if not exists details jsonb;
alter table registration_attendees add column if not exists emergency_name text;
alter table registration_attendees add column if not exists emergency_phone text;
alter table registration_pages add column if not exists housing_info text;
alter table registration_pages add column if not exists housing_nights text;
alter table registration_pages add column if not exists refund_policy text;
alter table ticket_types add column if not exists affiliation_prompt text;
alter table ticket_types add column if not exists person_role text;
