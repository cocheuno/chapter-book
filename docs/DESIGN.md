# Chapter Book — V1 design

A small CRM for a Society of Catholic Scientists chapter: people, partners, Gold Masses and conferences, mail, and the public chapter site.

Commercial CRMs were too large. This book is meant to stay small and to grow one desk at a time.

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
| Public site | Masthead + events, articles, documents, courses. Ungated. CRM people never appear there |
| Two-factor | Planned for leadership sign-in from the chapter website. **Not in V1** |

## Desks

- **People** — scientists, teachers, clergy, students, friends
- **Partners** — parishes, dioceses, schools, campuses; offices on each house
- **Events** — Gold Mass / conference workspace, invites, check-in, checklist
- **Website** — public copy the chapter already publishes
- **Mail** — compose to a typed count; preview records as sent until a real mailbox is wired
- **Chapter** — mailbox line and the dropdown lists

## Data (shape, not dumps)

See `migrations/`. Ids are text UUIDs from the app. Chapter rows are scoped by `chapter_id` from `chapter_members` for the signed-in user.

Public site tables: `site_settings`, `site_items` (`event` | `article` | `document` | `course`). Operational events (RSVPs, celebrant, hall, `admission` private|free) stay on `events`. Per-event dietary lives on `participations.dietary_for_this_event`.

## What is not V1

- Two-factor authentication
- SMTP / a real mailbox
- Pixel-clone of scs-wisconsin-usa.org (same content, Chapter Book’s parchment/ink/bronze)
- Extra languages
- A second schools database
