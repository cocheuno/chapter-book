# What is public, and what is not

A **public GitHub repository** is the right place for Chapter Book’s *code* and *design*. It is the wrong place for the chapter’s *people*, *passwords*, and *host secrets*.

Those three live in different rooms.

| Room | Lives in | Public GitHub? |
| --- | --- | --- |
| Source and design docs | This repository | Yes |
| Demo seed (fictional parishes, `.example` emails) | This repository | Yes — it is not real |
| Public website copy (Gold Masses, articles, documents, courses) | This repository *as sample copy*; live edits in the database | Sample only. Live copy is edited in **Website** and stored in the database |
| Real people, partners, RSVPs, dietary notes, mail | Postgres (the chapter’s database) | **Never** |
| Sign-in passwords | Hashed in the auth tables of that database | **Never** |
| `DATABASE_URL`, `BETTER_AUTH_SECRET`, mail-host keys | The host’s environment (Vercel / Neon), not files | **Never** |

## Secrets (keys, not people)

The app **does not** read a committed `.env` file. On a real deploy the host injects:

- `DATABASE_URL` — the chapter’s Postgres
- `BETTER_AUTH_SECRET` — signs sessions
- OAuth client credentials for Google / X, if you use them

Rules:

1. Do not create `.env`, `.env.local`, or paste keys into `docs/` or issues.
2. Do not put connection strings in screenshots or chat logs that you later commit.
3. Rotate a secret if it ever lands in git. Treat history as public forever.
4. Mail in this version records a send in the book; it does not store an SMTP password in source.

`.gitignore` already excludes `.env*`, keys, dumps, and builder internals.

## Real chapter information (people, not keys)

The book of people is **not** in git. It is rows in Postgres, scoped to the signed-in chapter.

- First sign-in does **not** seed a dummy membership list. Enter real people, partners, and gatherings in the live book (Neon). Do not put those rows in git.
- The public site seed copies **already-public** Wisconsin chapter material (Mass times, parish addresses, article DOIs). That is website copy, not the CRM. Live website copy is still edited from **Website** and stored in `site_settings` / `site_items`.
- Exports (nametag CSV, mail recipient lists) stay on the operator’s machine. Do not add them to the repo.
- GitHub issues and pull requests should use roles (“the pastor at the host parish”), not home addresses or personal emails.

When the chapter is live:

- Leadership signs in to Chapter Book (two-factor comes later, as planned).
- Visitors read the public site without an account.
- Nobody clones the repo in order to get the membership list — they cannot; it is not there.

## Forget and the after-event purge

An admin runs these from the desk. Nothing else rewrites these rows.

**Forget** removes the person's name, contact details, notes and dietary needs, other emails, tags, relationships, roles and offices, and their registration details: form answers, emergency contacts, grade, school, the consent link, and their name in confirmation emails (replaced with "Removed person"). Where they signed a consent as a guardian, their name and contact details are removed. The consent row stays, with the consent date, method, consent text, and photo release. Purchaser source fields and payment notes are cleared. Their attendance stays in event counts as "Removed person".

**After-event purge** runs 30 days after the event's last day. For every attendee of that event it clears emergency contacts, medical notes, dietary needs and allergies, accessibility needs, form notes, roommate names, dietary tags, and guardians' phone and email. It keeps guardian name, relationship, signed name, signed date, method, photo release, consent text, attendee names, tickets, payments, and housing nights.

## Viewers

On the registration desk a viewer sees the purchaser's name, the code, the status, and the totals, plus each attendee's name, tickets, and cancelled status, and a Needs care badge when a dietary need, an accessibility need, a note, or a dietary tag is present. A viewer does not receive form answers, dietary text, accessibility text, emergency contacts, email, phone, minor or consent flags, or review changes. A viewer cannot open a mailing.

## Before every push (short checklist)

- [ ] No `.env` or key files
- [ ] No real emails, phones, or street addresses in `src/` or `docs/`
- [ ] No database dumps or nametag CSVs
- [ ] Seed still uses `.example` addresses
- [ ] Commit message does not paste a secret “for debugging”

If a real member record was ever committed, it is not enough to delete the file on `main`. Assume GitHub history still has it, rewrite or rotate, and treat that person as notified.
