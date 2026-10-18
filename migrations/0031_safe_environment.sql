-- Safe-environment dates stay empty until an editor saves them.
alter table persons add column if not exists works_with_minors boolean not null default false;
alter table persons add column if not exists safe_env_program text;
alter table persons add column if not exists safe_env_trained_on date;
alter table persons add column if not exists safe_env_diocese text;
alter table persons add column if not exists background_check_on date;
alter table persons add column if not exists background_check_expires_on date;
alter table persons add column if not exists suitability_requested_on date;
alter table persons add column if not exists suitability_received_on date;
alter table persons add column if not exists suitability_expires_on date;
