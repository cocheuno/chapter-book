-- Chapter Book V1 schema. PGLite-safe: no extensions, text ids from the app.

create table if not exists chapters (
  id text primary key,
  name text not null,
  timezone text not null default 'America/Denver',
  contact_line text,
  from_name text not null default 'SCS Chapter',
  from_address text,
  reply_to text,
  created_at timestamptz not null default now()
);

create table if not exists chapter_members (
  user_id text primary key,
  chapter_id text not null references chapters (id),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists persons (
  id text primary key,
  chapter_id text not null references chapters (id),
  display_name text not null,
  given_name text,
  family_name text,
  honorific text,
  email text,
  phone text,
  city text,
  status text not null default 'active',
  dietary text,
  email_unsubscribed boolean not null default false,
  email_bounce_count integer not null default 0,
  last_touch_at timestamptz,
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists persons_email_uq
  on persons (chapter_id, lower(email))
  where email is not null;

create index if not exists persons_chapter_idx on persons (chapter_id);
create index if not exists persons_name_idx on persons (chapter_id, display_name);

create table if not exists person_roles (
  person_id text not null references persons (id) on delete cascade,
  role_key text not null,
  primary key (person_id, role_key)
);

create table if not exists organizations (
  id text primary key,
  chapter_id text not null references chapters (id),
  name text not null,
  type_key text not null,
  parent_id text references organizations (id),
  city text,
  street text,
  main_phone text,
  main_email text,
  website text,
  is_venue boolean not null default true,
  is_invitation_partner boolean not null default true,
  status text not null default 'active',
  last_touch_at timestamptz,
  capacity_church integer,
  capacity_hall integer,
  typical_mass_times text,
  liturgical_notes text,
  parking_notes text,
  hall_notes text,
  bulletin_deadline text,
  chancery_city text,
  created_at timestamptz not null default now()
);

create index if not exists orgs_chapter_idx on organizations (chapter_id, type_key);

create table if not exists schools (
  id text primary key,
  chapter_id text not null references chapters (id),
  organization_id text not null unique references organizations (id),
  name text not null,
  diocese_id text references organizations (id),
  city text,
  main_email text,
  main_phone text,
  grades_served text default '9–12',
  enrollment integer,
  science_dept_notes text,
  can_bus_students text,
  academic_calendar_notes text,
  preferred_door text not null default 'science_chair',
  status text not null default 'active',
  last_touch_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists schools_chapter_idx on schools (chapter_id);
create index if not exists schools_diocese_idx on schools (diocese_id);

create table if not exists affiliations (
  id text primary key,
  chapter_id text not null,
  person_id text not null references persons (id) on delete cascade,
  target_type text not null check (target_type in ('organization', 'school')),
  organization_id text references organizations (id),
  school_id text references schools (id),
  role_key text not null,
  is_primary boolean not null default false,
  is_current boolean not null default true
);

create index if not exists aff_person_idx on affiliations (person_id);
create index if not exists aff_school_idx on affiliations (school_id);
create index if not exists aff_org_idx on affiliations (organization_id);

create table if not exists events (
  id text primary key,
  chapter_id text not null references chapters (id),
  type_key text not null,
  title text not null,
  status text not null default 'idea',
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'America/Denver',
  venue_organization_id text references organizations (id),
  venue_detail text,
  capacity integer,
  summary text,
  internal_notes text,
  celebrant_id text references persons (id),
  cloned_from_id text,
  created_at timestamptz not null default now()
);

create index if not exists events_chapter_idx on events (chapter_id, starts_at);

create table if not exists event_slots (
  event_id text not null references events (id) on delete cascade,
  slot_key text not null,
  text_value text,
  person_id text,
  organization_id text,
  primary key (event_id, slot_key)
);

create table if not exists program_pieces (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  kind_key text not null,
  title text,
  starts_at timestamptz,
  location text,
  speaker_person_id text references persons (id),
  sort_order integer not null default 0
);

create table if not exists event_links (
  event_id_a text not null references events (id) on delete cascade,
  event_id_b text not null references events (id) on delete cascade,
  relation text not null default 'companion',
  primary key (event_id_a, event_id_b)
);

create table if not exists event_sessions (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  speaker_person_id text,
  room text,
  sort_order integer not null default 0
);

create table if not exists participations (
  id text primary key,
  chapter_id text not null,
  event_id text not null references events (id) on delete cascade,
  party_type text not null,
  person_id text references persons (id),
  organization_id text references organizations (id),
  school_id text references schools (id),
  kind_key text not null,
  guest_status text,
  publicity_status text,
  party_size integer not null default 1,
  dietary_for_this_event text,
  source text not null default 'invite',
  notes text,
  checked_in_at timestamptz
);

create index if not exists part_event_idx on participations (event_id);
create index if not exists part_person_idx on participations (person_id);

create table if not exists touches (
  id text primary key,
  chapter_id text not null,
  person_id text,
  organization_id text,
  school_id text,
  kind text not null,
  happened_at timestamptz not null default now(),
  summary text not null,
  event_id text,
  mailing_id text,
  author_id text not null
);

create index if not exists touches_person_idx on touches (person_id, happened_at desc);
create index if not exists touches_school_idx on touches (school_id, happened_at desc);

create table if not exists tasks (
  id text primary key,
  chapter_id text not null,
  title text not null,
  due_on date,
  status text not null default 'open',
  event_id text,
  person_id text,
  organization_id text,
  school_id text,
  checklist_key text,
  hat text,
  notes text
);

create index if not exists tasks_open_idx on tasks (chapter_id, status, due_on);

create table if not exists mail_templates (
  id text primary key,
  chapter_id text not null,
  key text not null,
  name text not null,
  audience_hint text not null,
  subject text not null,
  body text not null,
  attach_event_flyer boolean not null default false,
  event_type_key text
);

create unique index if not exists mail_templates_key_uq on mail_templates (chapter_id, key);

create table if not exists mailings (
  id text primary key,
  chapter_id text not null,
  template_id text,
  event_id text,
  subject_snapshot text,
  body_snapshot text,
  audience_source text not null,
  audience_count integer,
  status text not null default 'draft',
  created_by text not null,
  confirmed_by text,
  confirm_typed_count integer,
  created_at timestamptz not null default now()
);

create table if not exists mailing_skips (
  id text primary key,
  mailing_id text not null references mailings (id) on delete cascade,
  party_type text not null,
  school_id text,
  organization_id text,
  person_id text,
  reason text not null
);

create table if not exists mail_messages (
  id text primary key,
  mailing_id text not null references mailings (id) on delete cascade,
  recipient_kind text not null,
  person_id text,
  school_id text,
  organization_id text,
  address text not null,
  status text not null,
  skip_reason text,
  sent_at timestamptz,
  touch_id text
);

create index if not exists mail_msg_mailing_idx on mail_messages (mailing_id);
