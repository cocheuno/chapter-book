# Conference registration and payments (Stripe)

**Status:** Proposed design, to be built in phases (see the end of this document). No mailbox is needed. Read with `docs/REVIEW-2026-09.md`.

**Rule 1 applies** (`docs/BUILD-PLAN.md`): this design only adds tables and columns. It never changes existing people, events, or website content, except when an editor acts.

**Settled:**

- Stripe is the processor.
- People register on a **public Chapter Book page**.
- No donations.
- High-school students may attend.
- The conference is Friday, April 16, 2027, possibly with Thursday evening (April 15) and all day Saturday (April 17).

**Still to decide:** prices, tiers, parts, capacity, and the refund policy. They are data in the book, so the design does not wait on them. See [Open decisions](#open-decisions).

## What this adds

- A visitor registers one or more people on `/p/ai-conference/register`.
- They pay by card through Stripe, or pay nothing if their tickets are free or comped.
- Each attendee lands in the book as a **person** plus a **participation** on the existing door list, so check-in and nametags keep working.
- Operators can see every registration, record checks and cash, comp, refund, and export for the caterer and the treasurer.
- Minors register only with a guardian's consent.

Not in scope:

- donations
- attendee accounts (attendees get a private manage link instead)
- storing card data
- Stripe Connect
- sales tax. Stripe Tax stays off unless the treasurer says otherwise. Ask your accountant whether any part of the ticket, such as meals, is taxable in Wisconsin.

## Shape

```
scs-wisconsin-usa.org ─► /p/ai-conference            conference page (exists)
                               │ Register
                               ▼
                  /p/ai-conference/register            public; no CRM login; <section> copy + app-drawn form
                  who · which days · tickets · consents
                               │ createRegistration (server)
                               │   price from the book, never from the browser
                               │   hold seats (one atomic UPDATE per part)
            total is $0 ───────┼──────────► status 'free' ─► /r/<token>
                               │ total > $0
                               ▼
                  Stripe Checkout (checkout.stripe.com)    card, Apple Pay, Google Pay
                               │ paid
              ┌────────────────┴──────────────────┐
              ▼                                   ▼
  /r/<token>?session_id=…              POST /api/stripe/webhook
  manage page: status, code,           signature checked → 'paid'
  add to calendar                      → persons + participations
                                       → payments row, outbox row, audit row
```

## Why Stripe's hosted Checkout

- **No card data touches Chapter Book.** That keeps the chapter at the lightest PCI level (SAQ A).
- **Stripe handles the hard parts:** Apple Pay, Google Pay, 3-D Secure, receipts, declines, and fraud screening.
- **Prices live in the book.** Checkout takes the price with each request (`price_data`), so editors never have to create products in the Stripe Dashboard.
- **Stripe emails the receipt.** Turn on *Settings → Customer emails → Successful payments* (and *Refunds*). That covers receipts until the chapter has a mailbox (MAIL.md).

## Before live money

| # | Item | Why |
| --- | --- | --- |
| 1 | S1 in the review is fixed (invites need the token) | Admins will be able to refund |
| 2 | Two-factor for admins (Better Auth `twoFactor`); refunds are admin-only | Money can leave |
| 3 | Chapter hostname (review W2) | Trust on the flyer and at checkout |
| 4 | **Vercel plan.** Vercel's Hobby plan is for non-commercial use, and its fair-use guidelines count taking payments from visitors as commercial use. If the book is on Hobby, move to Pro, or get Vercel's answer in writing | Terms of service |
| 5 | Stripe account: nonprofit, EIN, chapter bank account, **two owners** (for example president and treasurer) with two-factor, statement descriptor such as `SCS WISCONSIN` (22 characters or fewer) | Fewer "I don't recognize this charge" disputes |
| 6 | Stripe public details: support email and phone, logo and colors for Checkout | Required by Stripe, and shown on receipts. Use the chapter contact address that already appears on the site |
| 7 | Payment methods: cards and wallets. Leave bank debits (ACH) off for Checkout at first | Card payments settle immediately; ACH adds a "processing" state |
| 8 | Fees: Stripe's nonprofit discount applies to donation volume, not tickets, so plan on standard card pricing. Stripe keeps its fee when you refund | Put that into the refund policy |
| 9 | Refund policy text: deadline, and whether a processing fee is kept | Shown on the register page and at Checkout (`custom_text`) |

## Data

One migration, for example `migrations/0019_registration.sql`. House rules:

- text ids from `nid()`
- `create table if not exists`
- `chapter_id` on every row
- PGLite-safe (no extensions)

`jsonb` works in both Neon and PGLite.

```sql
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
```

Code changes that go with it:

- `events.admission` has no check constraint. Add `{ key: "paid", label: "Paid (tickets)" }` to `ADMISSIONS` (`src/lib/crm/constants.ts:164`) and to the `createEvent` / `updateEvent` validators (`src/lib/crm/actions.ts:973`, `1048`).
- Add a `treasurer` hat.
- `resolveAudience` skips people with `news_consent = 'no'`.

## Seats without overselling

`getSql()` hands each statement to whichever pooled connection is free. So `begin` / `commit` sent as separate `sql` calls do **not** form a transaction.

Instead, hold each part with **one conditional UPDATE**, which Postgres runs atomically:

```sql
update event_parts
set held = held + ${n}
where id = ${partId}
  and (capacity is null or taken + held + ${n} <= capacity)
returning id
```

- **No row back:** that part is full. Release any parts already held in this request (`held = held - n`) and offer the waitlist.
- **Paid or free:** `held = held - n, taken = taken + n`.
- **Expired or cancelled before payment:** `held = held - n`.
- **Refunded and cancelled after payment:** `taken = taken - n`.

Move seats only after a **conditional status change** succeeds. For example:

```sql
update registrations set status = 'paid', paid_at = now()
where id = ${id} and status = 'pending' returning id
```

Then a duplicate webhook cannot count a seat twice.

If a payment arrives after its hold expired, **mark it paid anyway**. Add the seats even past capacity, set `needs_review = 'paid after hold expired'`, and show it on the desk. Never refuse money silently.

Promo codes use the same pattern: `update promo_codes set used = used + 1 where id = … and (max_uses is null or used < max_uses) returning id`, released on expiry.

If you would rather have real transactions, add a `transaction(fn)` helper to `src/lib/db.ts`: `pool.connect()` plus `BEGIN`/`COMMIT` on that one client for pg, and `db.transaction()` for PGLite. Use it for registration writes only.

## Public register page

Route: `src/routes/p/$slug/register.tsx`. It is public (no `authMiddleware`).

**Editor copy on this page accepts `<section>` HTML**, like every other public field (review section 7). Copy blocks are kept per event and rendered with `PublicCopy`:

- page intro
- each ticket type's description
- "For schools"
- refund policy
- code of conduct
- guardian consent text
- the message on the manage page

The **form, prices, and Pay button are drawn by the app, outside those blocks**. Together with the tighter style list and `contain: paint` (review S5), editor HTML cannot cover or restyle them.

Where Stripe or a nametag needs text (Checkout `custom_text`, line-item names), the book sends the plain words from `announcementPlainText`.

**The purchaser**

- name, email, phone (optional)
- "I'm registering": myself / myself and others / a school or parish group

**Each attendee**

- first and last name
- email (optional for minors)
- admission ticket and any add-ons, which set the parts (Thursday evening / Friday / Saturday / meals)
- badge affiliation (parish, school, university, company)
- dietary needs and accessibility needs
- "Under 18?"
  - If yes: grade and school, then the **guardian block** (below)

**Group (school or parish)**

- organization, lead chaperone (an adult attendee), number of students and chaperones
- Names may be "TBD" until the roster deadline. Consent links are sent through the teacher.

**Promo code**

- optional; checked on the server

**Checkboxes**

- privacy notice (required)
- refund policy (required)
- "Send me news about future chapter events" (optional, unchecked)
- code of conduct (required)

**"How did you hear about us?"** plus `utm_source` from the URL.

**Bots:** Cloudflare Turnstile (free, and you already use Cloudflare), a hidden honeypot field, and `public_throttle` (for example 10 attempts per IP per hour).

### `createRegistration` (public server function)

Same pattern as `getPublicPage`: no `authMiddleware`.

1. Validate with zod. Verify the Turnstile token. Count against `public_throttle`.
2. Load ticket types, parts, and the promo code **from the database**. Compute every price on the server; the browser's numbers are ignored.
3. Check sales windows and `for_minors`. Check that every minor has a guardian block, or belongs to a group with a lead chaperone.
4. Hold seats and the promo code, using the atomic updates above.
5. Insert the registration, attendees, and items.
   - `code`: `AI27-` plus 4 Crockford base32 characters; retry if taken.
   - `manage_token`: `randomBytes(32)`, stored as `hashInviteToken(token)` (`src/lib/crm/operator-rules.ts:12`).
6. **If the total is $0:** mark `free`, run the same "fulfil" step as a payment (below), and return `/r/<token>`.
7. **Otherwise:** create a Checkout Session and return its `url`. The browser goes there with `window.location.assign(url)`.

```ts
// src/lib/payments/stripe.server.ts
import Stripe from "stripe";
import { env } from "@/lib/env.server";

export function stripe() {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Payments are not set up yet.");
  return new Stripe(key); // pin the SDK version in package.json; upgrade on purpose
}

// in createRegistration
const session = await stripe().checkout.sessions.create(
  {
    mode: "payment",
    line_items: lines.map((l) => ({            // one line per ticket type, quantity = attendees
      quantity: l.quantity,
      price_data: {
        currency: "usd",
        unit_amount: l.unitCents,               // after any promo discount
        product_data: { name: `${l.ticketName} — ${eventTitle}` },
      },
    })),
    customer_email: purchaserEmail,
    client_reference_id: registrationId,
    metadata: { registration_id: registrationId, chapter_id: chapterId },
    payment_intent_data: {
      metadata: { registration_id: registrationId },
      description: `${eventTitle} · ${code}`,
    },
    custom_text: { submit: { message: refundPolicyPlainWords } }, // announcementPlainText(policy), max 1200 chars
    success_url: `${origin}/r/${manageToken}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/p/${slug}/register?cancelled=${code}`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,   // Stripe's minimum is 30 minutes
  },
  { idempotencyKey: `checkout-${registrationId}` },
);
// save session.id on the registration; hold_until = expires_at + 5 minutes
```

`origin` comes from a host variable (for example `PUBLIC_ORIGIN`), not from the request's `Host` header.

## Webhook

Route: `src/routes/api/stripe/webhook.ts`. It follows the pattern of `src/routes/api/public-site.ts`. It has no `authMiddleware` and no CORS. It must read the **raw** body before anything parses it.

```ts
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const signature = request.headers.get("stripe-signature") ?? "";
        let event: Stripe.Event;
        try {
          event = stripe().webhooks.constructEvent(body, signature, env("STRIPE_WEBHOOK_SECRET") ?? "");
        } catch {
          return new Response("bad signature", { status: 400 });
        }
        await handleStripeEvent(event); // throws on failure → 500 → Stripe retries
        return new Response("ok");
      },
    },
  },
});
```

`handleStripeEvent`:

1. `insert into stripe_events (id, type) values (…) on conflict (id) do nothing`. If the row exists and `processed_at` is set, return. Otherwise continue; this is a retry of a failed attempt.
2. Handle the event:

| Event | Do |
| --- | --- |
| `checkout.session.completed` with `payment_status = 'paid'` | **Fulfil**: `pending → paid`; move seats; record a `payments` charge (the fee comes from `latest_charge.balance_transaction` when the PaymentIntent is retrieved with `expand`); match or create people; create participations; queue the confirmation in `mail_outbox` (MAIL.md); write `audit_log` |
| `checkout.session.async_payment_succeeded` / `…_failed` | Only if bank debits are ever turned on: fulfil, or release |
| `checkout.session.expired` | `pending → expired`; release held seats and the promo code |
| `charge.refunded` | Record each refund (unique on `stripe_refund_id`); status `refunded` or `partly_refunded` |
| `charge.dispute.created` | Set `needs_review`; open a task for the treasurer |

3. Set `processed_at`, or store `error` and rethrow.

Every step must be safe to run twice. The unique indexes and conditional status updates make that true.

The manage page (`/r/<token>?session_id=…`) retrieves the session from Stripe on the server. If the session is paid and the webhook has not arrived yet, the page runs the same fulfil step. It never trusts the query string on its own.

In the Stripe Dashboard, add the endpoint `https://<book host>/api/stripe/webhook` with the events above. Locally: `stripe listen --forward-to localhost:8080/api/stripe/webhook`.

## People and the door list

In the fulfil step, for each attendee:

1. **Has an email and matches a person** (`lower(email)`, same chapter): link `person_id`.
   - **Do not update the person.** Store any typed values that differ (name, phone, dietary) in `review_changes`.
   - Open a task "Web registration: check changes for …" (hat `secretary`).
   - A stranger who types someone else's email must not rewrite that person.
2. **No match:** create a person with `source = 'web'`. Add the role `student` for minors and student tickets.
   - `news_consent`: `'yes'` only for the purchaser who ticked the box. Everyone else is `'no'`: somebody else registered them.
3. **Same name and school, no email** (common for students): create the person, and open a "possible duplicate" task. Never auto-merge.
4. **Create a participation:**
   - `party_type 'person'`, `kind_key 'guest'` (`'speaker'` for speaker comps)
   - `guest_status 'attending'`, `source 'web'`
   - `dietary_for_this_event` = the attendee's dietary
   - `registration_attendee_id`

   The invites, check-in, report, and nametag screens then work unchanged.

Never reveal on a public page whether an email is already in the book.

## Minors

- `for_minors` tickets, or "Under 18" ticked, require a guardian block:
  - guardian name, phone, and email
  - relationship
  - emergency contact
  - optional medical notes
  - photo release yes/no
  - typed signature and consent checkbox
- The server stores `consent_text_id` (the exact `<section>` wording shown), `signed_at`, and `signed_ip`.
- The guardian also becomes a **person** (`source = 'web'`, `news_consent = 'no'`), linked to the student with `person_relationships` (`guardian_of`). They are matched by email, like everyone else.
- If the purchaser **is** the guardian, they sign during registration.
- **School groups:** each student gets a consent link, `/c/<token>` (`consent_token_hash`). The teacher forwards it to parents from their own email; no chapter mailbox is needed. Or the school collects paper forms, and an editor marks them **received**.
- The desk shows **"consent missing"** per student. The door list flags them. Decide in advance whether a student without consent is admitted; the diocese's safe-environment coordinator will have a view.
- Viewers never see `medical_notes` or emergency contacts.
- A scheduled cleanup (or a desk button) deletes medical and emergency fields 30 days after the event, and writes an audit row.

## Groups and offline money

- **School or parish group:** the purchaser is a teacher or coordinator, `organization_id` is set, and attendees can be "TBD" until the roster deadline. Editors (and later the manage page) can rename attendees until then. That is cheaper than a refund and a new sale.
- **Pay by check or purchase order:** the registration is created on the desk (or public "Pay by check" if you allow it) with status `pending` and a longer hold. When the check arrives, an editor records a `payments` row (`method 'check'`, check number) and the fulfil step runs.
- **Stripe invoice (optional):** schools that need an invoice can get one from Stripe Invoicing. Stripe emails it and takes card or ACH. There is an extra Invoicing fee. Record the result like any Stripe charge.
- **Comps** (clergy and religious, seminarians, speakers, volunteers): `comp` promo codes, or an editor marks an attendee comped (`payments` row with `method 'comp'`, amount 0, audit row).

## Registrations desk

A new tab on the event, `src/routes/events/$eventId/registrations.tsx`, for editors. Viewers get read-only access without medical fields.

**Counts**

- per ticket type
- per part against capacity (held / taken / left)
- gross, Stripe fees, refunds, net
- meals by dietary need

**List**

- code, purchaser, attendees, status, amount, school, consents
- filters: unpaid, consent missing, needs review, waitlist

**Actions**

| Action | Who |
| --- | --- |
| Record offline payment | Editor |
| Comp | Editor |
| Rename attendee | Editor |
| Mark paper consent received | Editor |
| Cancel | Editor |
| **Refund** (full or partial) | **Admin only**. Calls `stripe().refunds.create({ payment_intent, amount }, { idempotencyKey })`; the webhook records the result |

Every action writes `audit_log`.

**At the door**

"Take payment" creates a Checkout Session for a walk-up registration and shows its URL as a **QR code** on the operator's screen. The attendee pays on their own phone, and the webhook marks it paid. No card reader is needed.

**Exports**

- attendees
- caterer (per meal, dietary counts)
- badges (extends `exportNametags`: name, affiliation, a QR with the registration code, a no-photo marker)
- treasurer ledger (payments with fees, for reconciling Stripe payouts)

All cells are guarded against formula injection (review S11).

**Home desk:** registrations since yesterday, money to date, seats left.

**Conference page:** an event setting, "Use Chapter Book registration", is **off by default**. While it is off, the Register button keeps the editor's typed link and nothing public changes (BUILD-PLAN.md, Rule 1). When an editor turns it on:

- the button points at `/p/<slug>/register`
- it shows the state ("Opens January 11", "Sold out – join the waitlist")
- the JSON feed gains `registration: { state, fromPriceCents }`, so the GoDaddy card can say the same

## Host variables

Add the names to `.env.example`. Values go in Vercel only (`docs/PRIVACY.md`).

| Name | Where | Note |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Production: live. Preview: **test** | A **restricted key** is better: write access to Checkout Sessions and Refunds, read access to PaymentIntents and Charges |
| `STRIPE_WEBHOOK_SECRET` | One per endpoint | `whsec_…` from the Dashboard (or from `stripe listen` locally) |
| `PUBLIC_ORIGIN` | Both | For example `https://events.scs-wisconsin-usa.org` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Both | Cloudflare Turnstile |

With no `STRIPE_SECRET_KEY`, the register page still takes **free** registrations and says "Online payment opens soon" for paid tickets. Local development and Grok Build previews therefore work without keys.

## Testing

**Test cards**

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0025 0000 3155` | Asks for 3-D Secure |

**Webhook behavior**

- Replay the same event twice: nothing is counted twice.
- Deliver `expired` after `completed`: the registration stays paid.
- Pay after the hold expired: the registration is paid and flagged.
- Refund part, then the rest: the status moves `partly_refunded` → `refunded`.

**Capacity**

- Two browsers buy the last seat: exactly one holds it.
- The other gets the waitlist.

**Privacy**

- Typing an existing person's email does not change that person.
- Editor `<section>` copy on the register page cannot cover or restyle the form or the Pay button. Test with `position: fixed`, `z-index`, and a large negative margin.
- `npm test` (privacy check included) stays green.

**Live check before opening**

- One real $1 ticket, then refund it.
- Confirm the Stripe receipt, the statement descriptor, and the payout to the chapter account.

## Open decisions

To be settled by the chapter. They are data, not code.

- **Parts:** Thursday evening (lecture? dinner?), Friday, Saturday, and which meals are separate.
- **Tiers:** for example General, Student, Teacher, Clergy and religious (often complimentary), Seminarian, SCS member. SCS national membership can't be checked from the book, so use a **member code** sent to members rather than a checkbox.
- **Early bird:** dates (for example January 11 to March 2).
- **Capacity:** per part (room size, caterer minimum).
- **Refunds:** deadline (for example April 9), whether the processing fee is kept, and substitutions allowed until the roster deadline.
- **Schools:** group price, chaperone ratio, roster and consent deadline (for example March 19, before Holy Week).
- **Admission without consent:** whether a minor without consent on file is admitted.

## Phases

Each phase can be merged and deployed on its own. These phases are work packages WP-20, WP-21, WP-22, and WP-25 in `docs/BUILD-PLAN.md`. Use that file's prompt template, which adds the house rules and the packages that must come first. The prompts below give the detail for each phase.

**Phase 1: free registration (no Stripe).** Migration, public register page, holds, fulfil step, manage page, registrations desk, exports, `mail_outbox` rows (MAIL.md).

> Read docs/PAYMENTS.md and docs/MAIL.md. Implement Phase 1 only: the migration in "Data" (all tables, even those used later), the public register page, createRegistration for $0 totals only, seat holds with the atomic UPDATE, the fulfil step (people and door list), the /r/<token> manage page, the registrations desk tab without refunds, and mail_outbox rows with status 'held'. Do not add Stripe yet. Register-page copy blocks accept <section> HTML through PublicCopy; the form and Pay button stay outside them. Add tests for pricing, holds, and person matching.

**Phase 2: Stripe (test mode).** Ticket prices, promo codes, Checkout Session, webhook, refunds (admin only), offline payments, walk-up QR, treasurer export.

> Read docs/PAYMENTS.md. Implement Phase 2: add the stripe package, src/lib/payments/stripe.server.ts, Checkout for totals above $0, the /api/stripe/webhook route with signature check and idempotent handling of the listed events, admin-only refunds, recording checks, cash, and comps, the walk-up QR, and the treasurer export. With no STRIPE_SECRET_KEY, paid tickets say "Online payment opens soon." Add tests for duplicate and out-of-order webhook events.

**Phase 3: minors and groups.** Guardian block, consent links, paper consent, group registration with "TBD" names, roster deadline, consent flags on the desk and door list, Viewer field hiding, cleanup after 30 days.

> Read docs/PAYMENTS.md, section "Minors" and "Groups and offline money", and docs/REVIEW-2026-09.md section 4. Implement Phase 3. Viewers must never receive medical notes or emergency contacts from the server, not just hidden in the UI.

**Phase 4: go live.** Everything in "Before live money", live keys on Production only, the $1 test, then open registration.
