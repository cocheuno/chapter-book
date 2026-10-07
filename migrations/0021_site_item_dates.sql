-- Optional dates for events, and "Show until" for announcements and courses. Existing items stay undated.
alter table site_items add column if not exists starts_on date;
alter table site_items add column if not exists ends_on date;
