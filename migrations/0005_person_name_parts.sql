-- First, middle, last, suffix as separate fields. Titles belong on the listed name.

alter table persons add column if not exists middle_initial text;
alter table persons add column if not exists suffix text;

update persons
set display_name = trim(both from honorific || ' ' || display_name)
where honorific is not null
  and honorific <> ''
  and display_name is not null
  and lower(left(display_name, length(honorific))) <> lower(honorific);
