-- Optional post-nominals and a salutation override. Existing people keep both empty.
alter table persons add column if not exists post_nominals text;
alter table persons add column if not exists salutation_override text;
