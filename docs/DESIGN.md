# Chapter Book — design

A small CRM for a Society of Catholic Scientists chapter: people, partners, Gold Masses and conferences, mail, and the public chapter site.

Commercial CRMs were too large. This book is meant to stay small and to grow one desk at a time.

The architecture and functionality review (`docs/REVIEW.md`) is **accepted**. Hosting (Neon, Vercel, Stripe, SMTP) waits until operators are invite-only.

## Two rooms (accepted)

| Room | Who | Where |
| --- | --- | --- |
| Public chapter site | Anyone | GoDaddy: [scs-wisconsin-usa.org](https://scs-wisconsin-usa.org/) |
| Chapter Book | Admin / Editor / Viewer | Linked from **For Members**. Leadership only. Attendees do not get CRM accounts. |

One Postgres (not this PC, not GoDaddy MySQL). The public site talks to Chapter Book over HTTPS, never SQL. CRM people never render on the public site.

## Frozen V1

| Decision | V1 |
| --- | --- |
| Language | English only |
| Roles | Admin / Editor / Viewer |
| Partners | Parish, diocese, university, Catholic high school, other. **No separate schools table** — a school is a partner |
| Gatherings | Gold Mass and conference |
| Events | Private or free; RSVP and door check-in |
| Mail | Typed-count send; recipient is a person or a partner’s main email (no extra FK) |
| Dietary | On the person; per-event override on the invite |
| Names | Religious title, academic title, first, middle, last, suffix. Religious title wins. Lists show the composed name |
| Contact | Email, phone, mobile, street, apt, city, state, postal, country, website |
| Lists (admin) | Religious titles, academic titles, states, countries |
| Partner desk | People of this house: religious and laity offices, added from People |
| Duplicates | Email is the person key; same name without email is a duplicate; partner unique on name+city |
| Public site | Masthead + events, articles, documents, courses as *copy in the book*. Live pages stay on GoDaddy. CRM people never appear on the public site |
| Two-factor | Planned for leadership. **Not in V1 or this operators step** |
| Operators | **Invite-only.** No public “create an account.” First empty book may open one founder admin. Admin invites by email and role; invitee sets a password from a copied link (no SMTP yet). Admin can change role, disable, restore. The book keeps at least one admin. Google/X broker buttons are not the chapter door. |

## Desks

- **People** — scientists, teachers, clergy, students, friends
- **Partners** — parishes, dioceses, schools, campuses; offices on each house
- **Events** — Gold Mass / conference workspace, invites, check-in, checklist
- **Website** — public copy the chapter already publishes
- **Mail** — compose to a typed count; preview records as sent until a real mailbox is wired
- **Chapter** — mailbox line, dropdown lists, **operators** (invite, role, disable)

## Data (shape, not dumps)

See `migrations/`. Ids are text UUIDs from the app. Chapter rows are scoped by `chapter_id` from `chapter_members` for the signed-in user.

Public site tables: `site_settings`, `site_items` (`event` | `article` | `document` | `course`). Operational events (RSVPs, celebrant, hall, `admission` private|free) stay on `events`. Per-event dietary lives on `participations.dietary_for_this_event`.

## What is not this step

- Neon / Vercel / DNS for For Members
- Two-factor authentication
- SMTP / a real mailbox (invites are a copied link)
- Public register, magic-link “view my registration”
- Courses as a gathering type
- Stripe (tickets and donations)
- Publish Website-desk copy to GoDaddy
- SMS
- Pixel-clone of scs-wisconsin-usa.org
- Extra languages
- A second schools database
- A sales pipeline
