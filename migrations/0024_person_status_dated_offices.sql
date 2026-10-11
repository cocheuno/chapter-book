-- Optional dates. Existing people and offices keep them empty until an editor fills them.
alter table persons add column if not exists deceased_on date;
alter table affiliations add column if not exists started_on date;
alter table affiliations add column if not exists ended_on date;
