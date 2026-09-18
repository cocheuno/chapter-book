# Architecture and functionality review

**Status:** Review only. Do not stand up Neon, Vercel, Stripe, or SMTP until this freeze is agreed.

**Subject:** Chapter Book (`main` at `1166f31`) vs the Wisconsin chapter’s stated needs.

**Public site today:** [scs-wisconsin-usa.org](https://scs-wisconsin-usa.org/) on GoDaddy. Registration is a static form (`formsubmitter.html`) and a QR code. Cloudflare is already used on other projects.

**Decisions already taken (this conversation):**

| Question | Answer |
| --- | --- |
| What is Chapter Book to the website? | Part of scs-wisconsin-usa.org, **only for authorized users** |
| Footer **For Members** | Chapter leadership only (Admin / Editor / Viewer) |
| Money | Conference tickets **and** donations |
| Courses | Full operations desk (enrollment, attendance, materials), not website cards only |
| Sales pipeline | Not wanted |
| Database | Hosted Postgres (Neon recommended). Not this PC. Not GoDaddy shared MySQL |
| Cloudflare | DNS/SSL in front of the public domain is enough. Not the database. Not a Workers rewrite |

---

## Verdict

V1 is a working **leadership operations book** for people, partner houses, Gold Mass and conference *execution*, and a *private shelf* of website copy.

It is **not** yet the chapter system you described. Missing, in order of how soon they block real use:

1. A locked door (invite-only operators; no public signup)
2. A hosted Postgres (not this laptop)
3. Public registration that writes into the book, with confirmation mail
4. Attendee “view my registration” on the **public** site (not CRM login)
5. A real mailbox
6. Courses as gatherings
7. Payments (tickets + gifts)
8. A publish path so Website-desk copy can appear on GoDaddy
9. SMS (after email actually leaves the building)

Do not buy Neon/Vercel until (1) is designed and (2) is the first host step. Hosting an open-signup CRM on the internet would make every new account an **editor**.

---

## Target architecture (two rooms, one book)

```
scs-wisconsin-usa.org          (GoDaddy pages; Cloudflare DNS/SSL)
  Announcements, articles, documents, events, courses
  Register / view registration / donate
  Footer: For Members ──HTTPS──► chapter-book.<same domain>
                                      │
                                      │ leadership only
                                      ▼
                               Chapter Book (Node app)
                                      │
                                      │ DATABASE_URL (injected)
                                      ▼
                               Managed Postgres (Neon, US East)
                                      ▲
                         Stripe webhooks, SMTP (later)
```

Rules:

- **One Postgres.** People, RSVPs, gifts, and website copy live there.
- **GoDaddy never speaks SQL.** Public forms POST to Chapter Book over HTTPS.
- **CRM people never render on the public site** (already in `docs/DESIGN.md`).
- **Attendees do not get CRM accounts.** Magic link or confirmation code on the public site.
- **This PC** stays a development machine (PGLite). Production data never lives here.

The build is already aimed at that split: Nitro `preset: "vercel"`, `DATABASE_URL` → Neon, migrations on deploy (`scripts/migrate.mjs`). Cloudflare stays on the **name**, not in the data path.

---

## As-built architecture

| Layer | What is in the repo |
| --- | --- |
| UI | TanStack Router/Start, React 19, parchment/ink/bronze shell |
| API | Server functions in `src/lib/crm/actions.ts` and `site.ts`, gated by `authMiddleware` |
| Auth | Better Auth at `/api/auth/*`. Email/password **on**. Google/X buttons talk to a **Grok auth broker**, not a chapter-owned Google app |
| Data | Postgres. No `DATABASE_URL` → in-process **PGLite** (wiped on restart). With URL → `pg` pool (Neon) |
| Schema | `migrations/0001`–`0008`. Chapter-scoped rows via `chapter_id` |
| Mail | Templates + typed-count “send” writes `mailings` / `mail_messages` / `touches`. **No SMTP** |
| Public `/site` | Ungated page that reads `site_settings` / `site_items`. Sample copy of the Wisconsin homepage |
| Host shape | Vite 8, Node ≥ 22.12, Nitro Vercel preset, PWA install leftovers from the builder |

Leftovers that should not drive V2:

- `schools` table and `/schools` redirects (design: a school is a partner)
- Default timezone `America/Denver` (Wisconsin is `America/Chicago`)
- First-sign-in seed: fictional Santa Fe names and `.example` emails (correct for git; wrong as live Wisconsin data)
- Grok PWA / grok-sandbox OAuth popup path
- Open “New volunteer? Create an account”

Membership rule today (`src/lib/crm/member.ts`):

- First user → **admin**, bootstraps the chapter
- Every later signup with no row → **editor** on the only chapter  
  There is no invite, no disable, no role desk, no password-reset desk.

---

## Functionality scorecard

Scale: **done** / **partial** / **absent**.

### Stated needs

| Need | Score | Notes |
| --- | --- | --- |
| Contact book, religious and laity | **Done** | Titles, full address, dietary, roles, affiliations, touches. Email is the person key |
| Parishes, dioceses, schools, universities | **Done** | Partner types + “people of this house.” No second schools database |
| Gold Mass execution | **Partial** | Workspace, checklist (pastor, celebrant, bulletin, schools), invites, door check-in, nametags. No stored **faculty/permission** from the bishop |
| Conference execution (April 2027 AI) | **Partial** | Conference type, sessions, checklist including “open registration.” No public register, no ticket, no paid waitlist |
| Course execution | **Absent** | `site_items.kind = course` is a card. `createEvent` only allows `gold_mass` \| `conference` |
| Manage website content | **Partial** | Website desk edits masthead + event/article/document/course. Nothing publishes to GoDaddy. No **announcements** kind. No long-form essay |
| For Members → CRM | **Partial** | `/login` exists. Not on the chapter domain. Not invite-only. 2FA not in V1 (still right) |
| Operator credential management | **Absent** | Open signup. No user list, invite, role change, disable |
| Individual + group email | **Partial** | Group compose + templates + skip reasons. No one-off “email this person.” Send does not leave the server |
| SMS | **Absent** | Mobile stored. No consent, no carrier |
| Auto-email on register | **Absent** | No public register endpoint; no mailer |
| Register on website; view registration | **Absent** | Live site uses `formsubmitter.html`. Submissions do not enter the book |
| Conference payments | **Absent** | `admission` is `private` \| `free` only. `events.capacity` unused for paid caps |
| Donations | **Absent** | Person role `donor` only. No gift, fund, receipt |
| No CRM pipeline | **Done** | Intentionally omitted |

### Desks as shipped

| Desk | What it does well | What it does not |
| --- | --- | --- |
| Home | Next gathering, RSVP counts, checklist due, quiet schools since August | Hard-wired to Gold Mass/conference; no money or registrations-from-the-web |
| People | Names, contact, duplicates, dietary, touches | No SMS flag, no “SCS national member,” no gift history |
| Partners | Offices, chairs, venues, diocese parent | Wisconsin’s five dioceses not seeded; leftover `schools` table |
| Events | Gold Mass + conference ops | No course; no public RSVP; no payment state on participation |
| Website | Private copy of public shelves | Not the live site; no announce; no publish |
| Mail | Careful typed-count, unsubscribed/do-not-contact skips | Ledger only; merge field `unsubscribe_url` is the text `(unsubscribe)` |
| Chapter | Mailbox line, title/state/country lists, shows your role | Cannot manage other operators |
| `/site` | Ungated preview of website copy | Conflicts with “authorized users only.” Should not be the public chapter |

---

## Gaps that are in the way of going live

### 1. The door is open

Anyone who can reach `/login` can create an editor. That is unsafe on the public internet and wrong for “authorized users.” V2 must be **invite-only** before a hostname exists.

### 2. Public register is a different app

Madison Gold Mass already asks people to register so you can count lunch and reach them if plans change. That form is not Chapter Book. Until a public HTTPS endpoint creates a `persons` + `participations` row, the book will not match the door list.

Attendee self-service belongs on **scs-wisconsin-usa.org**, not in the CRM shell.

### 3. Mail does not mail

`sendMail` inserts rows with `status = 'sent'`. No message reaches an inbox. Confirmation mail, bulletin asks, and “type the count” are theater until SMTP (or a transactional provider) is wired. SMS is a later desk.

### 4. Courses are not gatherings

You asked for a full course desk. That means a third `type_key` (or a sibling object) with enrollment, sessions, attendance, materials, and the same person book — not another `site_items` card.

### 5. Money is a label

Tickets and donations need a processor (Stripe is the usual fit), webhooks, a `payments` / `gifts` table, and receipts. Do not store card numbers. Wisconsin charitable-solicitation and gift acknowledgments are policy, not schema, but the book must be able to produce a letter.

### 6. Website desk does not move the homepage

Editors can change copy in Postgres. GoDaddy will not see it. V2 needs a deliberate publish path (static fragment, JSON feed, or a small public read API). Until then, the live site and the book will drift (they already have: the live homepage has announcements and a long essay the desk cannot represent).

### 7. Template auth vs chapter auth

Google/X on the login page federate through a **Grok builder broker**. A live chapter should own email/password (already on) and, if wanted, its own Google OAuth client. Do not depend on grok-sandbox hosts in production.

---

## Capabilities you did not list, but will need

These appear as soon as Gold Masses, a paid conference, and a public form are real:

1. Invite, role, disable, password reset for operators  
2. Magic link / code for “view or change my registration”  
3. Working unsubscribe and bounce handling (CAN-SPAM)  
4. SMS written consent and STOP (TCPA), separate from email  
5. Capacity + waitlist that know free vs paid (Madison lunch count)  
6. Party size / bus groups / walk-ups who are not yet in the book (check-in already has walk-up)  
7. Bishop/pastor **permission** as a dated record, not only a checklist tick  
8. Audit log for gifts, registrations, and operator changes  
9. Hosted backups (Neon’s job if you use Neon)  
10. Flag “also an SCS (national) member” without becoming the national CRM  
11. Default timezone `America/Chicago`  
12. Announcements as a public kind, distinct from operational events  

Two-factor for leadership remains post-V1, but should ship with operator management, not years later.

---

## What not to build

- A sales pipeline, lead scoring, or “deals”  
- A pixel-clone of scs-wisconsin-usa.org inside Chapter Book  
- A second schools database  
- Cloudflare Workers / D1 as the CRM runtime  
- Postgres on GoDaddy shared hosting or on a chapter laptop  
- Attendee accounts inside the leadership shell  

---

## Recommended freeze (V2), still one desk at a time

Do this **in order**. Hosting is step 2, not step 1.

| Step | Desk | Outcome |
| --- | --- | --- |
| 0 | **Agree this review** | DESIGN.md updated only after you say so |
| 1 | **Operators** | Invite-only; close public signup; Admin can set role / disable. 2FA can wait one step |
| 2 | **Host the book** | Neon (US East) + Chapter Book on Vercel; `DATABASE_URL` and `BETTER_AUTH_SECRET` injected; Cloudflare DNS for **For Members**. First live admin is a named operator, not “whoever signed up” |
| 3 | **Public register** | GoDaddy (or a Chapter Book public route that is not the CRM shell) → person + RSVP; confirmation email (forces SMTP) |
| 4 | **View/update registration** | Magic link on the public site |
| 5 | **Courses** | Third gathering type with enrollment and attendance |
| 6 | **Stripe** | Conference tickets, then donations; webhook → paid / gift |
| 7 | **Publish** | Website desk → GoDaddy (add announcements) |
| 8 | **SMS** | Only after email is actually sending |

V1’s “not in this version” list stays right until the matching step: no 2FA until operators exist, no SMTP until register exists, no pixel-clone ever.

---

## Stop line

No Neon project, no Vercel project, no Stripe, no DNS change, until you accept this review (or mark the deltas).

If you accept it, next concrete work is **step 1 in code** (invite-only operators) while this PC still uses PGLite. Hosting is the step after that door is shut.
