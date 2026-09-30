# Build plan for Grok Build

**What this is:** the step-by-step instructions for the changes proposed in `docs/REVIEW-2026-09.md`. The review says *what* and *why*. `docs/PAYMENTS.md` and `docs/MAIL.md` are detailed specs. This file says *how*, in small work packages (WP) that Grok Build can take one at a time.

## How to use it

1. Give Grok Build **one work package at a time, in order.** One package = one branch = one pull request.
2. Use the prompt template below with the package number.
3. A package marked **Needs D#** waits for that decision, and one marked **Needs H#** waits for a human task. Both are listed below, with the defaults.
4. Review each pull request against the package's **Done when** list before merging.

**Prompt template** (replace `WP-XX`):

> Read docs/BUILD-PLAN.md: the "House rules" section and work package WP-XX, plus any review, PAYMENTS.md, or MAIL.md sections it names. Implement only WP-XX, on a new branch. Follow the steps, meet every "Done when" item, and add the listed tests. Run `npm test`, `npm run typecheck`, and `npm run lint`, and fix anything they report. Open a pull request titled "WP-XX: <package title>". If a step does not match the code as it is now, stop and explain the mismatch instead of guessing.

## House rules (every package)

**Stack**

- TanStack Start (React 19, Vite 8), deployed on Vercel through Nitro.
- **Server functions:** `createServerFn` (see `src/lib/crm/actions.ts`).
- **Server routes:** `createFileRoute(...)({ server: { handlers } })` (see `src/routes/api/public-site.ts`).
- **Database:** Postgres through `getSql()` tagged templates (`src/lib/db.ts`). Neon in production; PGLite locally and in the Grok preview.
- **Auth:** Better Auth (`src/lib/auth/server.ts`).

**Database changes**

- Add a new numbered file in `migrations/`. The next number is `0019`; check the highest existing number first.
- Idempotent: `create table if not exists`, `add column if not exists`. PGLite-safe: no extensions. Never edit a migration that already exists.
- Ids are text from `nid()` (`src/lib/crm/ids.ts`).
- Every table has `chapter_id`, and every query filters on it.
- **Migrations run on every Vercel build against that environment's database**, so each one must be safe on production data.

**`getSql()` runs each statement on whichever pooled connection is free.**

- `begin` / `commit` sent as separate calls is **not** a transaction.
- Use single-statement conditional updates (`update … where … returning id`).
- Or add a `transaction(fn)` helper to `src/lib/db.ts` that holds one client.

**Server functions for operators**

1. `.middleware([authMiddleware])`
2. `const m = await loadMember(context.userId)`
3. `assertEditor(m.role)` for writes, or `assertAdmin(m.role)` for admin-only actions
4. Validate input with `.validator(z.object({...}).parse)`

**Public server functions** (no sign-in):

- only read, unless the package says otherwise
- never return CRM people
- validate every input

**Tests**

- Put rules in small pure modules, like `src/lib/crm/operator-rules.ts`.
- Test them with `node:test` in a sibling `*.test.ts`, importing with the `.ts` extension.
- `npm test` finds every `*.test.ts` under `src/`.

**Public copy**

- Multi-line editor copy is rendered with `PublicCopy` (after WP-09). A value that is `<section>…</section>` is sanitized HTML; anything else is plain text.
- Never use `dangerouslySetInnerHTML` on an unsanitized string.

**Privacy (`docs/PRIVACY.md`)**

- No real names, emails, phones, or addresses in code, tests, seeds, or docs. Use `.example` addresses.
- No `.env` files. New host variables go in `.env.example` as **names only**.

**Grok Build's own scaffolding.** Do not edit these, except where a package says so:

- `server/middleware/grok-pwa.ts`
- `scripts/grok-*`
- `public/__grok/`
- `src/lib/auth/preview.ts`
- `src/lib/preview-host-bridge.ts`
- `src/lib/auth/gate*`
- `src/routeTree.gen.ts`: the router plugin regenerates it. Commit the regenerated file; never hand-edit it.

**Keep the Grok preview working.** Anything that depends on the deployed host (framing rules, production-only switches) checks a host variable, so the preview keeps today's behavior.

**Line numbers in the review drift.** Find code by function name.

**UI wording** matches the existing desks: short, plain sentences ("the book", "desk", "shelf").

**Docs.** Update `docs/*.md` when behavior changes. Change `docs/DESIGN.md` only for decisions the chapter has accepted.

---

## Decisions (made by the chapter, not Grok)

| ID | Decision | Default if nobody objects | Blocks |
| --- | --- | --- | --- |
| D1 | Where the public site lives (review §9): **A** GoDaddy stays the shell, or **B** the book serves the site | **B, in two steps** | WP-44 (A) or WP-45 (B) only |
| D2 | Do one-line fields (titles, when, where, labels) also accept `<section>` HTML? (review §7) | **No, plain text** | Scope of WP-09 |
| D3 | Conference parts, tiers, prices, capacity, early-bird dates, refund policy (PAYMENTS.md, Open decisions) | Entered as data by editors | Go-live only (WP-25) |
| D4 | Is a minor admitted without guardian consent on file? | **No** | WP-22 |
| D5 | Mail provider (MAIL.md) | **Resend** | WP-50 |

## Human tasks (not for Grok)

| ID | Task | Needed by |
| --- | --- | --- |
| H1 | Vercel: give Preview its own Neon branch, or no `DATABASE_URL`. Never production (review S9) | Now |
| H2 | Vercel Production: set `FOUNDER_EMAIL` (the current admin's address), `GROK_CHROME=off`, `PUBLIC_ORIGIN` | WP-02, WP-03, WP-12 |
| H3 | Cloudflare: a chapter hostname for the book (review W2). Then update `BETTER_AUTH_URL` and the embed `<script src>` on GoDaddy | Before flyers |
| H4 | A short address on the main domain, for example `scs-wisconsin-usa.org/ai`, redirecting to the conference page. Use it on all print | Before flyers |
| H5 | After WP-01 ships: open Chapter → Operators → "Accounts without access", remove any you don't recognize, and re-issue pending invites | After WP-01 |
| H6 | Vercel plan: Pro, or Vercel's written OK, before live payments (PAYMENTS.md, Before live money #4) | WP-25 |
| H7 | Stripe account: nonprofit details, EIN, bank, two owners with two-factor, statement descriptor, receipts on, branding, cards and wallets only (PAYMENTS.md #5–9) | WP-21 (test), WP-25 (live) |
| H8 | Stripe webhook endpoint and secret; test keys on Preview, live keys on Production | WP-21, WP-25 |
| H9 | Cloudflare Turnstile site and secret keys | WP-20 |
| H10 | Vercel Blob store (creates `BLOB_READ_WRITE_TOKEN`) | WP-41 |
| H11 | Pastoral and venue work in review §4: bishop, chancery permission for Mass, celebrant, letters of suitability, diocesan safe-environment coordinator, venue contract and insurance, hotel block, schools | See the review's dated checklist |
| H12 | Chapter mailbox, sending provider, DNS records (MAIL.md, "Switching it on" 1–4) | WP-50 |
| H13 | For D1 = B: a list of every current GoDaddy page address, for redirects; the DNS switch itself | WP-45 |

---

## Order

| WP | Title | Depends on | Status | Review |
| --- | --- | --- | --- | --- |
| **Phase 0: security and foundations (October)** | | | | |
| 01 | Invites need the token | — | Ready | S1 |
| 02 | Founder path only for `FOUNDER_EMAIL`; one chapter | 01 | Ready (H2) | S6 |
| 03 | No Grok script or share-tag stripping in production | — | Ready (H2) | S12, W1 |
| 04 | Broker sign-in off in production | — | Ready | S3 |
| 05 | Security headers and safer editor HTML | 03 | Ready | S4, S5 |
| 06 | Public reads only read; honest errors; caching | — | Ready | S2, S7, S8 |
| 07 | Chapter scoping and safe CSV | — | Ready | S10, S11 |
| 08 | Lockfile, lint, CI | — | Ready | W5 |
| **Phase 0b: website and CRM basics (Oct–Nov)** | | | | |
| 09 | `<section>` HTML on every public field | 05 | Ready (D2 default) | §7 |
| 10 | Website quick fixes | 09 | Ready | §9 |
| 11 | Real dates on events | 10 | Ready | §9 |
| 12 | Server-rendered public pages, share cards, JSON-LD, real 404 | 03, 09, 11 | Ready (H2) | W1 |
| 13 | Conference page for three days | 11, 12 | Ready | W3 |
| 14 | Post-nominals and salutations | — | Ready | §5 |
| 15 | Conference checklist and treasurer hat | — | Ready | §4 |
| 16 | Password reset links | 01 | Ready | §8 |
| 17 | Person statuses and dated affiliations | — | Ready | §8 |
| **Phase 1–3: registration and payments (Oct–Dec)** | | | | |
| 20 | Free registration and the mail outbox | 01, 05, 06, 09 | Ready (H9) | PAYMENTS Phase 1, MAIL seam |
| 21 | Stripe in test mode | 20 | Needs H7, H8 | PAYMENTS Phase 2 |
| 22 | Minors, groups, safe-environment records | 20 | Needs D4 | PAYMENTS Phase 3, §4 |
| 23 | Audit log everywhere | 20 | Ready | C8 |
| 24 | Two-factor for admins | 01 | Ready | C9 |
| 25 | Go live | 21–24 | Needs D3, H6–H8 | PAYMENTS Phase 4 |
| **Data quality and reach** | | | | |
| 30 | Merge people | 23 | Ready | C15 |
| 31 | CSV import with duplicate preview | 07, 34 | Ready | §8 |
| 32 | Full export | 07, 23 | Ready | §8, C17 |
| 33 | Tags and saved segments | — | Ready | §8 |
| 34 | Secondary emails | — | Ready | §8 |
| 35 | Task assignee and "My tasks" | — | Ready | §8 |
| 36 | Engagement counts | — | Ready | §8 |
| 38 | Forget a person | 23 | Ready | §8 |
| **Pages (review §9)** | | | | |
| 40 | Content model: pages, drafts, revisions, redirects | 10, 11 | Ready | §9 |
| 41 | Media library with PDFs | 40 | Needs H10 | §9 |
| 42 | Menus | 40 | Ready | §9 |
| 43 | SEO fields, sitemap, robots | 12, 40 | Ready | §9 |
| 44 | Option A: page and menu hooks for GoDaddy | 40, 42 | Needs D1 = A | §9 |
| 45 | Option B: the book serves the public site | 40–43 | Needs D1 = B, H13 | §9 |
| **Mail** | | | | |
| 50 | Switch mail on | 20 | Needs D5, H12 | MAIL.md |

---

## Phase 0: security and foundations

### WP-01 Invites need the token

**Why:** today anyone who knows an invited address can sign up with it and receive the invite, including admin (review S1).

**Files:**

- `src/lib/auth/server.ts`
- `src/lib/crm/member.ts`
- `src/lib/crm/operators.ts`
- `src/lib/crm/operator-rules.ts` and its test
- `src/routes/login.tsx`
- `src/routes/chapter/index.tsx`

**Steps:**

1. **Rule.** In `operator-rules.ts`, add a pure `signUpAllowed({ bookEmpty, founderAllowed, email, invite })`. `invite` is either `null` or `{ email, expiresAt, acceptedAt }`. It returns `true` only when:
   - the book is empty and the founder rule allows this email, or
   - the invite exists, is unexpired and unaccepted, and its email equals the sign-up email (lower-cased).
2. **Guard sign-up.** In `server.ts`, add `hooks.before` using `createAuthMiddleware` and `APIError` from `better-auth/api`. Check the installed version under `node_modules/better-auth` for the exact API. If `ctx.path === "/sign-up/email"`:
   - read the header `x-invite-token`
   - hash it with `hashInviteToken`
   - look up the invite by `token_hash`
   - call `signUpAllowed`
   - if it is not allowed: `throw new APIError("FORBIDDEN", { message: "Chapter Book is invite-only." })`

   Merge with any existing `hooks`.
3. **Accept with the token.** In `operators.ts`, add the server function `acceptInvite` (`authMiddleware`, input: the token string):
   - Find the invite by hash.
   - Refuse it if it is missing, used, or expired, or if the signed-in user's email differs from the invite ("This invite is for a different email.").
   - Claim it with `update operator_invites set accepted_at = now() where id = … and accepted_at is null returning id`. Insert into `chapter_members` **only** if a row came back.
4. **Remove email-only acceptance.** In `member.ts`, delete the branch of `loadMember` that accepts an invite by email (the `operator_invites` lookup).
5. **Login page.** In `login.tsx`, when `?invite=` is present:
   - Pass the token on sign-up: `authClient.signUp.email({ ..., fetchOptions: { headers: { "x-invite-token": token } } })`.
   - Call `acceptInvite` before redirecting.
   - On sign-in with a token (an existing account accepting an invite), also call `acceptInvite`.
6. **Accounts without access.** On Chapter → Operators, add an admin-only list: rows in `"user"` with no `chapter_members` row. Each has a Remove button that deletes that user's `"session"`, `"account"`, and `"user"` rows, and only when they have no membership. This frees an address someone claimed before the fix.

**Done when:**

- Posting to `/api/auth/sign-up/email` without a valid token fails with 403, except on the founder path.
- A token cannot be accepted by a different email.
- An invited person signs up and lands in the book with the invited role.
- An admin can remove an account that has no access.

**Tests:** `signUpAllowed` covering:

- empty book with the founder email
- empty book with another email
- a matching invite
- an invite for a different email
- an expired invite
- an accepted invite
- no invite at all

### WP-02 Founder path only for `FOUNDER_EMAIL`; one chapter

**Why:** an empty database makes the first visitor admin (review S6).

**Steps:**

1. **Founder rule.** Add `founderAllowed(email, env)` in `operator-rules.ts`:
   - `true` when `FOUNDER_EMAIL` is set and matches the email (case-insensitive).
   - When `FOUNDER_EMAIL` is unset: `true` only if there is no `DATABASE_URL` (local PGLite and the Grok preview).
2. **Use it** in `loadMember` before `bootstrapChapter`, and in WP-01's `signUpAllowed`.
3. **Login state.** `getLoginState` reports `founder: true` only when the book is empty. It never reveals the founder address.
4. **One chapter.** Migration: `create unique index if not exists chapters_one_uq on chapters ((true));`. The database then refuses a second chapter, even from two first sign-ups at once.
5. **Docs.** Add `FOUNDER_EMAIL` to `.env.example` (name only) and to `docs/HOSTING.md`.

**Done when:** on a hosted empty database, only `FOUNDER_EMAIL` can open the book, and a second chapter row cannot be inserted.

**Tests:** `founderAllowed` cases.

### WP-03 No Grok script or share-tag stripping in production

**Why:** `server/middleware/grok-pwa.ts` runs `injectGrokPwaHead` (`scripts/grok-pwa-shared.mjs`) on every HTML page **in production**. It does two things:

- **It deletes every `og:` and `twitter:` tag the page sets** (`stripShareMetaTags`) and replaces them with one site-wide card. Per-page share cards (WP-12) cannot work while it runs.
- **It adds `<script src="https://grok.com/grok-app-builder/extensions.js">` to every page,** including `/login` and the future register and manage pages. A third-party script there can read passwords and personal data (review S12).

**Steps:**

1. **Switch.** Add a pure `grokChromeEnabled(env)` in `src/lib/grok-chrome.ts`. It returns `false` when `GROK_CHROME === "off"`, and `true` otherwise, so the Grok preview is unchanged.
2. **Guard the middleware.** At the top of the handler in `server/middleware/grok-pwa.ts`, pass the response through untouched when `grokChromeEnabled` is false.
   - This is the **one** allowed change to that file: a guard, nothing else. If Grok Build regenerates the file, re-apply the guard.
3. **Docs.** Add `GROK_CHROME` to `.env.example`. Document in `docs/HOSTING.md`: set `GROK_CHROME=off` on Vercel Production.

**Done when:**

- With `GROK_CHROME=off`, `curl -s <host>/login` and `curl -s <host>/p/ai-conference` contain no `grok.com`.
- With it unset, the Grok preview behaves as before.

**Tests:** `grokChromeEnabled` cases.

### WP-04 Broker sign-in off in production

**Why:** the Grok sign-in service can sign people in to production, and it links accounts by email without local verification (review S3).

**Steps:**

1. **Rule.** Add a pure `brokerSignInEnabled({ authConfigured, betterAuthUrl, flag })`: `true` only when `authConfigured` is true **and** (`betterAuthUrl` is empty, as in the preview, **or** `flag === "on"`).
2. **Use it** in `server.ts` for `grokOAuthPlugin`, and to leave the Grok providers out of `accountLinking.trustedProviders` when disabled.
3. **Do not change `authConfigured`.** `src/lib/auth/verify.server.ts` uses it to decide whether sign-in is enforced. Changing it would switch sign-in off, or crash with a database configured.
4. **Docs.** Add `BROKER_SIGNIN` to `.env.example` and `docs/HOSTING.md`: leave it unset in production.

**Done when:** in production, email and password work, and the Grok OAuth routes are gone. In the preview, sign-in behaves as before. If the preview sets `BETTER_AUTH_URL`, use `BROKER_SIGNIN=on` there.

**Tests:** `brokerSignInEnabled` cases.

### WP-05 Security headers and safer editor HTML

**Why:** review S4 and S5. This must keep `<section>` HTML working everywhere.

**Steps:**

1. **Headers on every response.** Add a Nitro middleware, `server/middleware/security-headers.ts`. Files in `server/middleware/` register automatically; wrap `next()` the way `grok-pwa.ts` does.
   - Always: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
   - **Only when `BETTER_AUTH_URL` is set** (deployed; the Grok preview shows the app in an iframe):
     - `Strict-Transport-Security: max-age=31536000`
     - `X-Frame-Options: DENY`
     - `Content-Security-Policy-Report-Only`:
       `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src https://challenges.cloudflare.com; form-action 'self' https://checkout.stripe.com; base-uri 'self'; frame-ancestors 'none'`
   - Keep the CORS headers on `/api/public-site`.
2. **Style allowlist.** In `announcement-html.ts`, replace `safeStyle` with an allowlist. Parse `property: value` pairs and keep only:
   - `text-align`, `color`, `background-color`
   - `font-size`, `font-weight`, `font-style`, `text-decoration`, `line-height`
   - `margin` and `margin-*`, `padding` and `padding-*`
   - `width`, `max-width`, `height`
   - `border`, `border-radius`
   - `list-style-type`, `vertical-align`

   Keep the existing `STYLE_BAD` checks on the values. Everything else is dropped: `position`, `z-index`, `opacity`, `transform`, `display`, and so on.
3. **Contain the copy.** In `src/styles.css`: `.announcement-html { contain: paint; }`. In `public/embed/chapter-site.js`, wrap rich HTML in `<div class="scs-rich" style="contain:paint">`.

**Done when:**

- The headers appear on the deployed host. Framing is refused there, and the Grok preview still loads.
- `position:fixed` and `z-index` are removed from editor HTML.

**Tests:** in `announcement-html.test.ts`, allowed properties are kept, blocked properties are dropped, and mixed declarations keep only the allowed part.

### WP-06 Public reads only read; honest errors; caching

**Why:** review S2, S7, S8.

**Steps:**

1. **Public reads stop writing.** In `site.ts`, remove the `ensureSiteContent`, `backfillSlugs`, and `backfillConference` calls from `loadPublishedSite` and `getPublicPage`. `listSite` keeps them, for operators.
2. **Seed once.** In `member.ts`, stop calling `ensureSite` in `loadMember`. The sample shelf is seeded only in `bootstrapChapter`.
3. **Honest errors.**
   - `loadPublishedSite` lets database errors throw.
   - `/api/public-site` answers them with **503** `{ "error": "unavailable" }` and `Cache-Control: no-store`.
   - `getPublicPage` returns `null` only for "not found" and throws on errors. The page says "This page is not available right now. Please try again shortly." WP-12 turns this into a real 503.
4. **Cache the feed.** In `public-cors.ts`, successful feed responses get `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=600`. Keep `Vary: Origin`.
5. **Drop the cache-buster.** In `chapter-site.js`, remove `?t=Date.now()`.
6. **Cache images.** `/api/site-image/$id` sends `Cache-Control: public, max-age=31536000, immutable`.

**Done when:**

- Deleting every shelf item leaves the shelf empty after a refresh.
- With the database unreachable, the GoDaddy homepage keeps its own content.
- A repeat feed request within a minute is a cache hit (`x-vercel-cache: HIT`).

**Tests:** update `public-cors.test.ts`.

### WP-07 Chapter scoping and safe CSV

**Why:** review S10 and S11.

**Steps:**

1. **Scope by chapter.** In `listInvites`, `exportNametags`, `previewMail`, and `sendMail`, add the chapter filter to every event lookup: join `events` and check `chapter_id = ${m.chapterId}`. Search for `where e.id = ${data.eventId}` and `where p.event_id = ${eventId}`.
2. **Safe CSV.** New `src/lib/crm/csv.ts` with `csvCell(value)`:
   - quote the value and double any `"`
   - put `'` in front of a value that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return

   Use it in `exportNametags`, and in every export from now on.

**Done when:** no query in `actions.ts` reads an event's rows without the chapter filter, and exports neutralize formulas.

**Tests:** `csvCell`.

### WP-08 Lockfile, lint, CI

**Steps:**

1. **Lockfile.** Run `npm install` and commit the updated `package-lock.json`, so that `npm ci` works.
2. **Lint errors.** Fix the four:
   - the empty block in `src/lib/app-data/client.server.ts` (add a comment saying why it is empty)
   - `prefer-const` in `actions.ts`
   - the control-character regex in `announcement-html.ts` (build it from `\u0000-\u001f`, or add a single disable comment with the reason)
   - the useless escape in `announcement-html.ts`
3. **CI.** Add `.github/workflows/ci.yml`. It runs on pull requests and on pushes to `main`:
   - `actions/setup-node` with `node-version-file: .nvmrc` and the npm cache
   - `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`

**Done when:** the pull request's CI run is green.

---

## Phase 0b: website and CRM basics

### WP-09 `<section>` HTML on every public field

**Why:** the chapter's rule is that every public-facing piece of copy accepts `<section>…</section>` HTML. Today several fields print raw tags (review §7). One-line fields stay plain text (D2).

**Steps:**

1. **One helper.** In `announcement-html.ts`, add `publicCopyHtml(raw)`:
   - If the trimmed value is one whole `<section>…</section>`: sanitize it and return it.
   - Else, if it contains tags (older bare HTML in page bodies): sanitize and wrap it in `<section>`.
   - Else: return `null`, meaning plain text.

   Switch `PublicCopy` and every caller of `publicRichHtml`, `announcementRichHtml`, and `announcementCardHtml` to it. Keep the old names as thin wrappers if tests use them.
2. **One component.** Render with `PublicCopy`:
   - the conference summary at the top of `conference-page.tsx`
   - the notice strip in `conference-page.tsx`
   - the masthead "about" on `/site`
   - `CopyCard` summaries on `/site`
   - any other multi-line public field
3. **Excerpts.** For the speaker lineup excerpt, and anywhere else text is clamped: plain words from `announcementPlainText(publicCopyHtml(x))`, falling back to `x`, then clamp. Fix `biographyText` in `conference-page.ts` so no tags reach an excerpt.
4. **Feed.**
   - `publicSiteDto` always sends `summaryHtml` as one `<section>`.
   - It adds `settings.aboutHtml`.
   - `chapter-site.js` renders `aboutHtml` for `data-scs="about"` when `safeSection` passes, and otherwise uses `textContent`.
5. **Editor hints.** On each multi-line field on the Website desk and in the conference builder, add the hint "Start with `<section>` for HTML". Show the live preview the Website desk already has for summaries.

**Done when:** `<section><h2>Hi</h2><p>Text</p></section>` in any multi-line public field renders formatted on:

- `/p/…` pages
- `/site`
- the conference page, the notice strip, and the lineup excerpt (as plain words)
- the GoDaddy embed, masthead included

No literal `<section` or `&lt;section` appears anywhere public.

**Tests:**

- `publicCopyHtml`: section, bare HTML, plain text, and hostile input
- `publicSiteDto` emits `<section>`-wrapped `summaryHtml` and `aboutHtml`
- lineup excerpts contain no `<`

### WP-10 Website quick fixes

**Why:** review §9.

**Steps:**

1. **Talks leave the shelves.** Items of kind `article` with a `conference_id` are conference talks. Leave them out of:
   - the feed (`publicSiteDto` and `loadPublishedSite`)
   - `/site`
   - the Website desk's Articles tab. Show them there as "Talk on <conference>", edited in the conference builder.

   Notices (announcements with a `conference_id`) stay on the announcements shelf.
2. **Drafts by default.** New items start unpublished: `emptyItem` sets `published: false`, and the server uses `data.published ?? false`. Lists show a "Draft" badge.
3. **Preview drafts.**
   - New server function `getPreviewPage(slug)` with `authMiddleware`: the same data as `getPublicPage`, but without the `published` filter.
   - `/p/$slug?preview=1` uses it for signed-in operators and shows a banner: "Preview: not published."
   - The Website desk's link for a draft opens the preview.
4. **Confirm before removing.** Remove asks first: "Remove <title> from the site? Its page stops working." Use the Radix alert dialog already in the dependencies.

**Done when:**

- Talks appear only on the conference page.
- A new item is a draft until published, and its preview works for operators only.
- Remove asks first.

**Tests:** a pure shelf filter, with talks and notices.

### WP-11 Real dates on events

**Steps:**

1. **Migration:** `alter table site_items add column if not exists starts_on date; … ends_on date;`.
2. **Website desk:** date fields for events, and an optional "Show until" (`ends_on`) for announcements and courses. For an event item linked to a gathering, default to that gathering's `starts_at` date.
3. **Upcoming.** Public event lists sort by `starts_on`. An item whose `ends_on` (or `starts_on`, when there is no end) is before today in `America/Chicago` leaves "Upcoming" by itself. It keeps its `/p/` address and appears under "Past events" on `/site`.
4. **"When" text.** When `when_label` is empty, derive it from the dates. For example: "Thursday–Saturday, April 15–17, 2027".
5. **Feed:** add `startsOn` and `endsOn`.

**Done when:** a past event drops off "Upcoming" with no editor action, and events list in date order.

**Tests:** an event today stays; the Chicago midnight edge; label formatting for one day and for a range.

### WP-12 Server-rendered public pages, share cards, JSON-LD, real 404

**Needs:** WP-03 (otherwise Grok's middleware strips the share tags), WP-09, WP-11, and `PUBLIC_ORIGIN` (H2).

**Steps:**

1. **Server rendering.** In `src/routes/p/$slug/index.tsx`, `src/routes/p/$slug/speakers/$speaker.tsx`, and `src/routes/site/index.tsx`:
   - Load the data in the route `loader` and render from `Route.useLoaderData()`, not `useEffect`.
   - The canonical redirect becomes `throw redirect(...)` in the loader.
   - Not found becomes `throw notFound()` with status 404. Unavailable becomes 503.
2. **Per-route `head`:**
   - title "<page title> · <public title>"
   - `description`: the plain summary, 160 characters at most. After WP-43, the SEO field.
   - `link rel=canonical` built from `PUBLIC_ORIGIN`
   - `og:title`, `og:description`, `og:type`, `og:url`, and `og:image` (an absolute URL to `/api/site-image/<id>`)
   - `twitter:card` = `summary_large_image`
3. **JSON-LD** on event and conference pages: schema.org `Event` with:
   - `name`, `startDate` and `endDate` (WP-11), `description`, `image`
   - `location` (a `Place`)
   - `organizer` (an `Organization`)
   - `eventAttendanceMode` = Offline, `eventStatus` = Scheduled

   `offers` is added in WP-21.
4. **Check** with `curl -s <host>/p/ai-conference`:
   - the HTML contains the title and summary text
   - exactly one `og:title`, the JSON-LD block, and no "Opening the page…"
   - an unknown address returns 404

**Tests:** a pure `eventJsonLd(item)` and `pageHead(item)`.

### WP-13 Conference page for three days

**Steps:**

1. **Program by day.** Group the program using `event_sessions.starts_at` from the conference builder. Talks without a time go under "To be scheduled".
2. **Calendar file.** Add a `/p/<slug>/calendar.ics` server route built from `starts_on` / `ends_on`, the location, and the page address. Link it as "Add to calendar".
3. **Chapter home link.** The conference header's chapter link goes to the same place as on ordinary pages: `https://scs-wisconsin-usa.org/` until D1 is settled.
4. **Content, not code.** Venue, parking, accessible entrance, hotel block, "For schools", and "Reading" are typed as `<section>` copy by editors. Add those headings to the editor hint as a suggested outline.

**Done when:** the program groups by Thursday, Friday, and Saturday, and the `.ics` file opens in Google and Apple calendars.

**Tests:** grouping by day in `America/Chicago`; `.ics` output (escaped text, all-day versus timed).

### WP-14 Post-nominals and salutations

**Why:** review §5.

**Steps:**

1. **Migration:** `persons` add `post_nominals text` and `salutation_override text`.
2. **Move degrees out of the title list.**
   - Degrees and order initials become post-nominals: "Ph.D.", "M.D.", "Sc.D.", "M.Sc.", "M.A.", "B.S." move out of the academic-title seed and stored lists into a new list `post_nominal`. Add S.J., O.P., O.F.M., O.S.B., C.S.C., and O.Carm.
   - The migration moves existing `academic_title` degree values into `post_nominals`.
3. **Names.** `composePersonName`: the prefix is the religious title, or else the academic prefix; then `, <post-nominals>`. Example: "Rev. John Doe, S.J., Ph.D."
4. **Salutations.** A pure `salutation(person)` following the table in review §5; `salutation_override` wins. Women religious get "Dear Sister <given name>" by default; the override covers sisters known by surname.
5. **Mail.**
   - Add the merge field `{{salutation}}`.
   - Seeds: `Dear {{honorific}} {{family_name}},` becomes `Dear {{salutation}},`.
   - Migration: `update mail_templates set body = replace(body, 'Dear {{honorific}} {{family_name}},', 'Dear {{salutation}},')`.
6. **Person form:** a post-nominals field, and a salutation preview with an override box.

**Done when:** the person page and mail preview show correct names and salutations for every row of the §5 table.

**Tests:** `names.test.ts`, one case per row of the table, plus a priest-scientist with both titles.

### WP-15 Conference checklist and treasurer hat

**Steps:**

1. **New checklist.** Replace `CONFERENCE_CHECKLIST` in `src/lib/crm/constants.ts` with the table in review §4: keys, titles, offsets, hats.
2. **Treasurer hat.** Add `treasurer` wherever hats are listed; search for `hat`.
3. **Refresh an existing event.** On the event desk, add "Add missing checklist items". It adds items whose keys are missing and never touches existing tasks. This updates the AI conference already in the book.

**Done when:** for an event starting 2027-04-16, the due dates match the review's table.

**Tests:** offsets to dates.

### WP-16 Password reset links

**Why:** there is no way back in for a locked-out operator (review §8).

**Steps:**

1. **Use Better Auth's own reset.** Set `emailAndPassword.sendResetPassword`, and `revokeSessionsOnPasswordReset` if the installed version has it. Check `node_modules/better-auth` for the current names (`requestPasswordReset` / `resetPassword`).
2. **Until mail exists,** `sendResetPassword` stores the link in a new table, `operator_resets (id, chapter_id, user_id, url, created_at, used_at)`, instead of sending it.
3. **Operators desk.** "Reset link" (admin only) triggers the reset for that operator and shows the stored link to copy, the same way invites work today.
4. **Login page.** Handle the reset link: new password twice, then sign in.

**Done when:** an admin can hand a locked-out operator a link that sets a new password and ends their old sessions. After WP-50, the same callback sends the link by email.

### WP-17 Person statuses and dated affiliations

**Why:** review §8.

**Steps:**

1. **Statuses.** Allowed values: `active`, `inactive`, `moved`, `deceased`, `do_not_contact`. Add `persons.deceased_on date`.
   - Deceased and do-not-contact people are left out of every audience and every invite.
   - A deceased person shows a small cross or "†" on their page and in lists. Their history is kept.
2. **Dated affiliations.** Migration: `affiliations` add `started_on date`, `ended_on date`.
   - Marking an office "not current" sets `ended_on` to today.
   - The partner desk shows "since <year>".
3. **June reminder.** On Home, from June 1: if no task with `checklist_key = 'clergy_assignments_<year>'` exists, create "Check clergy assignments (most change July 1)" for the secretary.

**Done when:** deceased people never appear in audiences, and past offices keep their dates.

**Tests:** the audience filter (pure); the June task rule.

---

## Phase 1–3: registration and payments

### WP-20 Free registration and the mail outbox

Follow `docs/PAYMENTS.md`, **Phase 1**, with the Phase 1 prompt there, and `docs/MAIL.md`, "The seam". Also:

- `news_consent` is added (PAYMENTS.md, Data), and `resolveAudience` skips `news_consent = 'no'`.
- Turnstile uses `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (H9). With no keys, which happens only in the preview, the check is skipped.
- Every export in the registrations desk uses `csvCell` (WP-07).
- Register-page copy blocks use `PublicCopy` (WP-09). The form and buttons are outside them.

### WP-21 Stripe in test mode

`docs/PAYMENTS.md`, **Phase 2**. Also add `offers` to the event JSON-LD (WP-12): price range, `availability`, `validFrom`.

### WP-22 Minors, groups, safe-environment records

`docs/PAYMENTS.md`, **Phase 3**, with D4 (default: no admission without consent). Also, from review §4, add safe-environment fields to people:

- program
- training date
- diocese
- background check date and expiry
- letter of suitability (requested / received / expires) for visiting clergy

A desk list shows "Volunteers with minors: cleared / not cleared". Viewers never receive medical or emergency fields from the server.

### WP-23 Audit log everywhere

The `audit_log` table comes from WP-20. Write a row for:

- invites, role changes, disable and restore, reset links
- site publish, unpublish, remove
- every export
- merges (WP-30) and forgets (WP-38)

Add an admin-only "Activity" list on the Chapter desk, with filters by action and date.

### WP-24 Two-factor for admins

1. **Server and client.** Add Better Auth's `twoFactor` plugin on the server and `twoFactorClient` on the client (TOTP with backup codes).
2. **Tables.** Write the migration by hand from the plugin's schema for the installed version. This repo does not use the Better Auth CLI.
3. **Admins must enroll.** `loadMember`: an admin without two-factor can reach only the enrollment page.
4. **Refunds** (WP-21) and role changes also require a two-factor session.

**Done when:** an admin cannot use the book until enrolled; editors and viewers are unaffected.

### WP-25 Go live

`docs/PAYMENTS.md`, **Phase 4**: human tasks H6–H8, then:

- a $1 live ticket and its refund
- then open registration

Code: a small "Test mode" banner on the registrations desk whenever the Stripe key starts with `sk_test_`.

---

## Data quality and reach

### WP-30 Merge people

On a person page, "Merge with…" picks the other record and shows the two side by side, field by field.

- The survivor keeps chosen fields. Every link moves to it: affiliations, participations, touches, tasks, roles, registrations, relationships, tags.
- The other email becomes a secondary email (WP-34).
- Write an audit row. Admin or editor.

**Tests:** the pure field-merge function.

### WP-31 CSV import with duplicate preview

People → Import:

1. Upload a CSV and map its columns.
2. The preview sorts each row as **new**, **matches an existing person** (by any email), or **possible duplicate** (same name, and the same city or partner).
3. Import creates only the new people, with `source = 'import'` and `news_consent = 'unknown'`. It never overwrites; differences are listed as review tasks.

Up to 2,000 rows per file.

**Tests:** the row classification.

### WP-32 Full export

Chapter → Export (admin): a CSV for each of people, affiliations, partners, events, participations, and touches, with `csvCell`, zipped. Write an audit row. Also documents "Restore to a Neon branch once a quarter" in `docs/HOSTING.md`.

### WP-33 Tags and saved segments

- **Tables:** `tags` and `person_tags`. Tags can be added from the person page and from lists.
- **Segments** are saved filters: roles, tags, partner type, city or state, attended event X, excluding unsubscribed, do-not-contact, and deceased. They are stored as JSON.
- **Mail compose** gains the audience "Saved segment".

**Tests:** segment filter to SQL conditions (pure).

### WP-34 Secondary emails

`person_emails` (person, email, label), unique per chapter on `lower(email)` across primary and secondary addresses. Duplicate checks, web matching (WP-20), and import (WP-31) look at all of them.

### WP-35 Task assignee and "My tasks"

`tasks.assignee_user_id` (optional). Home shows "My tasks" for the signed-in operator; the hat still shows.

### WP-36 Engagement counts

- **Person page:** "Events attended: N · last: <date>".
- **Partner page:** "People who came through this house: N", counted from participations whose person is affiliated with the partner.

### WP-38 Forget a person

Admin action:

- Clear names, contact details, notes, and dietary to "Removed", and delete relationships and secondary emails.
- Keep participations for counts.
- Write an audit row.
- Ask for the typed name to confirm.

---

## Pages (review §9)

### WP-40 Content model: pages, drafts, revisions, redirects

**Steps:**

1. **Migration.** `site_items` add:
   - `status` (`draft` / `review` / `published` / `archived`)
   - `parent_id`
   - `publish_at`, `unpublish_at`
   - `updated_at`, `updated_by`
   - `seo_description`, `share_image_id`, `noindex`

   Backfill `status` from `published`, and keep `published` in step with `status` until every reader uses `status`. Add kind `page` to `SITE_KINDS` and to the validator.
2. **Revisions.** Table `site_item_revisions (id, chapter_id, item_id, snapshot jsonb, saved_by, saved_at)`, written on every save. The editor gets "History": list, compare, restore.
3. **Redirects.** Table `site_redirects (chapter_id, from_path, to_path, created_at)`, added automatically when an address changes. `/p/<old>` answers 301 to the new address.
4. **No silent overwrites.** A save sends the `updated_at` it loaded. The server refuses when the row changed since: "Someone else saved this page. Reload to see their changes."
5. **Archive, not delete.** Remove becomes Archive, and Archived items can be restored.
6. **Scheduling.** `publish_at` and `unpublish_at` are honored by the public readers (no background job needed).
7. **Ordering.** Drag-to-reorder within each shelf writes `sort_order`. Events keep date order (WP-11).
8. **Page tree.** Standalone pages (kind `page`, optional `parent_id`) appear at `/p/<slug>` and in the Website desk's "Pages" tab as a tree.

**Done when:** an editor can create an About page as a draft, preview it, schedule it, publish it, change its address without breaking the old one, and restore an earlier version.

**Tests:** the status/schedule visibility function, redirect lookup, and the concurrency check.

### WP-41 Media library with PDFs

**Needs:** H10.

1. **Storage.** Add `@vercel/blob`. Browsers upload **directly** to Blob with a server-issued token; Vercel functions cap a request at about 4.5 MB.
2. **Table.** `site_files (id, chapter_id, url, name, mime, size, alt, uploaded_by, created_at)`. Pictures, and PDFs up to 20 MB.
3. **Media tab** on the Website desk:
   - upload, search, alt text (required for pictures), replace, delete (blocked while a page uses the file)
   - "Copy address" for use in `<section>` HTML
4. **Documents.** A Documents item can point at a library PDF.
5. **Existing pictures.** Keep `site_images` as they are; the picture picker offers library files too.

**Done when:** an editor uploads a 10 MB PDF and a picture with alt text, and uses both inside `<section>` copy.

### WP-42 Menus

1. **Table:** `site_nav (id, chapter_id, menu 'main'|'footer', label, item_id, url, parent_id, sort_order)`.
2. **Menus tab** on the Website desk: add, nest one level, reorder, pick a page or type a URL.
3. **Feed:** `/api/public-site` gains `nav: { main, footer }`.

### WP-43 SEO fields, sitemap, robots

1. **Editor fields:** description (160 characters), share picture, and "Hide from search". `head()` (WP-12) uses them.
2. **Server routes:**
   - `/sitemap.xml`: published, non-hidden pages, events, conference, and talks, with `lastmod` = `updated_at`
   - `/robots.txt`: allow public pages, disallow the leadership desks and `/api/`, and point to the sitemap

### WP-44 Option A: page and menu hooks for GoDaddy

**Needs:** D1 = A. For B, do only step 1, for the homepage, as the interim.

1. **Page hook.** `chapter-site.js`: `data-scs-page="<slug>"` fills the element with that page's `<section>` body from a new feed field. It uses the same `safeSection` check.
2. **Menu hook.** `data-scs-nav="main"` renders the menu as a `<ul>` of links.
3. **Docs.** Update `docs/PUBLISH.md` with the new hooks.

### WP-45 Option B: the book serves the public site

**Needs:** D1 = B and H13. Build it on a branch, and switch DNS only when every GoDaddy page exists in the book.

1. **Split by host.** The public site is served on `PUBLIC_HOST` (for example `scs-wisconsin-usa.org`) and the leadership book on its own host (for example `book.scs-wisconsin-usa.org`), from one deployment, split by the `Host` header in a Nitro middleware.
   - The public root `/` is the public home. Desks are not served on the public host.
   - Update `BETTER_AUTH_URL` and the CORS rules.
2. **Public layout:**
   - a header with the main menu, a footer with the footer menu and contact
   - a chapter theme (the existing parchment, ink, and bronze), not a copy of the GoDaddy design
3. **Home page.** Composed on the Website desk from ordered blocks: hero, upcoming events, announcements, articles, documents, courses, and free `<section>` blocks.
4. **Old addresses.** Import the old GoDaddy addresses (H13) into `site_redirects`, for example `/formsubmitter.html` → the register page.
5. **Checklist before the switch:**
   - every old address redirects
   - the sitemap is live
   - forms work
   - the embed script is no longer needed

---

## Mail

### WP-50 Switch mail on

**Needs:** D5 and H12. Follow `docs/MAIL.md`, "Switching it on", steps 4–9, then:

- the password-reset callback (WP-16) sends email
- "Find my registration" and the reminders in MAIL.md, "After mail is on"
