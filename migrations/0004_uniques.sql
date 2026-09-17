-- Duplicate guards. Application checks stay; these catch races.

create unique index if not exists orgs_name_city_uq
  on organizations (chapter_id, lower(name), lower(coalesce(city, '')));

create unique index if not exists persons_name_no_email_uq
  on persons (chapter_id, lower(display_name))
  where email is null;

create unique index if not exists affiliations_person_org_current_uq
  on affiliations (organization_id, person_id)
  where is_current;

create unique index if not exists affiliations_singular_office_uq
  on affiliations (organization_id, role_key)
  where is_current and role_key in (
    'pastor', 'bishop', 'vicar_general', 'chaplain', 'campus_minister',
    'parish_secretary', 'faith_formation', 'liturgy_coordinator', 'chancellor',
    'communications', 'office_of_worship', 'science_chair', 'principal', 'front_office'
  );

create unique index if not exists participations_person_event_uq
  on participations (event_id, person_id)
  where person_id is not null and party_type = 'person';

create unique index if not exists participations_org_event_uq
  on participations (event_id, organization_id)
  where organization_id is not null and party_type = 'organization';

create unique index if not exists events_title_active_uq
  on events (chapter_id, lower(title))
  where status <> 'cancelled';
