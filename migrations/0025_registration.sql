-- Parts of a gathering people come to: Thursday evening, Friday, Saturday, a lunch.
create table if not exists event_parts (
  id text primary key,
  chapter_id text not null,
  event_id text not null references events (id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer,                  -- null: no limit
  held integer not null default 0,   -- seats in unpaid checkouts
  taken integer not null default 0,  -- seats paid, free, or comped
  is_meal boolean not null default false,
  sort_order integer not null default 0
);

-- What people buy. An admission ticket covers parts; an add-on (a meal) covers one.
create table if not exists ticket_types (
  id text primary key,
  chapter_id text not null,
  event_id text not null references events (id) on delete cascade,
  kind text not null default 'admission' check (kind in ('admission', 'add_on')),
  name text not null,                -- "General", "Student", "Clergy and religious", "Saturday only"
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'usd',
  for_minors boolean not null default false,   -- attendee must be under 18; consent required
  needs_code boolean not null default false,   -- only with a promo code (speakers, comps)
  sales_start timestamptz,
  sales_end timestamptz,                       -- early bird ends by date
  active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists ticket_type_parts (
  ticket_type_id text not null references ticket_types (id) on delete cascade,
  part_id text not null references event_parts (id) on delete cascade,
  primary key (ticket_type_id, part_id)
);

create table if not exists promo_codes (
  id text primary key,
  chapter_id text not null,
  event_id text not null references events (id) on delete cascade,
  code text not null,                          -- stored upper-case
  kind text not null check (kind in ('percent', 'amount', 'comp')),
  value integer not null default 0,            -- percent 1–100, or cents off
  ticket_type_id text references ticket_types (id),   -- null: any ticket
  max_uses integer,
  used integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true
);
create unique index if not exists promo_codes_uq on promo_codes (event_id, code);

-- The order. One purchaser, one or more attendees.
create table if not exists registrations (
  id text primary key,
  chapter_id text not null,
  event_id text not null references events (id),
  code text not null,                          -- short, for the door and the phone: AI27-7KQ4
  status text not null default 'pending' check (status in
    ('pending', 'paid', 'free', 'cancelled', 'expired', 'refunded', 'partly_refunded')),
  purchaser_name text not null,
  purchaser_email text not null,
  purchaser_phone text,
  purchaser_person_id text references persons (id),
  organization_id text references organizations (id),   -- school or parish paying for a group
  total_cents integer not null default 0,
  currency text not null default 'usd',
  promo_code_id text references promo_codes (id),
  stripe_session_id text,
  stripe_payment_intent_id text,
  hold_until timestamptz,
  manage_token_hash text not null,             -- sha256, like operator invites
  heard_from text,
  utm_source text,
  news_opt_in boolean not null default false,
  needs_review text,                           -- e.g. 'paid after hold expired'
  notes text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz
);
create unique index if not exists registrations_code_uq on registrations (chapter_id, code);
create unique index if not exists registrations_session_uq
  on registrations (stripe_session_id) where stripe_session_id is not null;
create index if not exists registrations_event_idx on registrations (event_id, status);

create table if not exists registration_attendees (
  id text primary key,
  chapter_id text not null,
  registration_id text not null references registrations (id) on delete cascade,
  given_name text not null,
  family_name text not null,
  email text,
  badge_affiliation text,                      -- parish, school, university, company
  is_minor boolean not null default false,
  grade text,
  school_organization_id text references organizations (id),
  dietary text,
  accessibility text,
  person_id text references persons (id),      -- set when matched or created
  participation_id text references participations (id),
  review_changes jsonb,                        -- typed values that differ from the person record
  consent_token_hash text,                     -- minors: link a teacher can forward to a parent
  cancelled_at timestamptz
);
create index if not exists reg_attendees_reg_idx on registration_attendees (registration_id);

-- What each attendee bought (admission plus add-ons), at the price charged.
create table if not exists attendee_items (
  attendee_id text not null references registration_attendees (id) on delete cascade,
  ticket_type_id text not null references ticket_types (id),
  price_cents integer not null,
  primary key (attendee_id, ticket_type_id)
);

create table if not exists guardian_consents (
  id text primary key,
  chapter_id text not null,
  attendee_id text not null unique references registration_attendees (id) on delete cascade,
  guardian_name text not null,
  guardian_email text,
  guardian_phone text not null,
  relationship text,
  emergency_name text,
  emergency_phone text,
  medical_notes text,            -- optional; hidden from Viewers; deleted 30 days after the event
  photo_release boolean not null default false,
  consent_text_id text not null, -- the exact consent text they agreed to (consent_texts)
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  method text not null default 'online' check (method in ('online', 'paper')),
  received_by text,              -- operator who marked a paper form received
  received_at timestamptz
);

-- Money in and out. Stripe rows and hand-entered rows (check, cash, invoice, comp).
create table if not exists payments (
  id text primary key,
  chapter_id text not null,
  registration_id text not null references registrations (id),
  kind text not null check (kind in ('charge', 'refund')),
  method text not null check (method in ('stripe', 'check', 'cash', 'invoice', 'comp')),
  amount_cents integer not null check (amount_cents >= 0),
  fee_cents integer,
  currency text not null default 'usd',
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  check_number text,
  recorded_by text not null,     -- operator user id, or 'stripe'
  happened_at timestamptz not null default now(),
  note text
);
create unique index if not exists payments_charge_uq
  on payments (stripe_charge_id) where kind = 'charge' and stripe_charge_id is not null;
create unique index if not exists payments_refund_uq
  on payments (stripe_refund_id) where stripe_refund_id is not null;

-- Every Stripe event once. Retries and duplicates are expected.
create table if not exists stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table if not exists audit_log (
  id text primary key,
  chapter_id text not null,
  actor text not null,           -- operator user id, 'stripe', or 'public'
  action text not null,          -- 'refund', 'comp', 'offline_payment', 'export', 'role_change', …
  entity text not null,
  entity_id text,
  detail jsonb,
  at timestamptz not null default now()
);

-- Public-form throttle (per IP per hour).
create table if not exists public_throttle (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- The exact wording people agree to, kept forever. Editing the consent copy adds a row.
create table if not exists consent_texts (
  id text primary key,
  chapter_id text not null,
  event_id text references events (id),
  kind text not null check (kind in ('guardian', 'privacy', 'refund', 'conduct', 'photo')),
  html text not null,            -- sanitized <section> HTML as shown
  created_at timestamptz not null default now(),
  created_by text not null
);

-- Guardian ↔ student, spouse, and similar links between people in the book.
create table if not exists person_relationships (
  person_id text not null references persons (id) on delete cascade,
  related_person_id text not null references persons (id) on delete cascade,
  kind text not null check (kind in ('guardian_of', 'spouse_of', 'household')),
  created_at timestamptz not null default now(),
  primary key (person_id, related_person_id, kind)
);

alter table participations add column if not exists registration_attendee_id text;

-- News is separate from receipts. 'unknown' keeps today's behavior for people leadership entered.
alter table persons add column if not exists news_consent text not null default 'unknown';
alter table persons add column if not exists news_consent_at timestamptz;

create table if not exists mail_outbox (
  id text primary key,
  chapter_id text not null,
  stream text not null check (stream in ('transactional', 'broadcast')),
  template_key text,
  to_address text not null,
  to_name text,
  person_id text,
  registration_id text,
  mailing_id text,
  subject text not null,
  text_body text not null,
  html_body text,
  status text not null default 'held' check (status in
    ('held', 'queued', 'sending', 'sent', 'failed', 'bounced', 'cancelled')),
  send_after timestamptz,
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists mail_outbox_status_idx on mail_outbox (status, send_after);

create table if not exists registration_pages (
  event_id text primary key references events (id) on delete cascade,
  chapter_id text not null,
  use_book_registration boolean not null default false,
  intro text,
  for_schools text,
  manage_message text,
  updated_at timestamptz not null default now(),
  updated_by text
);
