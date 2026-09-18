-- Partner street line 2 and postal code (street, email, phone already exist).
alter table organizations add column if not exists street2 text;
alter table organizations add column if not exists postal_code text;
