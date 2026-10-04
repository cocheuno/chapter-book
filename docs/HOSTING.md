# Hosting Chapter Book (Neon + Vercel)

Step 2 of the accepted review. Operators are invite-only first. Secrets stay in the host environment, never in git. See `docs/PRIVACY.md`.

## What you are standing up

| Piece | Host |
| --- | --- |
| Public brochure | GoDaddy (`scs-wisconsin-usa.org`) — unchanged |
| Chapter Book | Vercel |
| Postgres | Neon, AWS **US East (Ohio)** or **N. Virginia** |
| DNS later | Cloudflare CNAME for **For Members** — not this step |

## Environment variables (Vercel → Settings → Environment Variables)

The database variables come from Vercel's Neon integration; the others are typed here. See [Preview database and secrets (H1)](#preview-database-and-secrets-h1) for previews.

| Name | Value |
| --- | --- |
| `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`, `PG*`, `POSTGRES_*`) | **Set by the Neon integration** (Vercel → **Storage**). Not typed or edited by hand |
| `BETTER_AUTH_SECRET` | Long random string (32+ bytes). Not the database password. |
| `BETTER_AUTH_URL` | Public origin, currently `https://chapter-book-beryl.vercel.app` (no trailing slash) |
| `VITE_AUTH_ENABLED` | `true` |
| `ALLOW_PREVIEW_MIGRATIONS` | **Preview** only. `off` until H1 step 3; then exactly `on` |
| `PRODUCTION_DB_ENDPOINT` | **Preview** only. Production's Neon endpoint id (`ep-…`); see H1 step 3 |
| `FOUNDER_EMAIL` | **Production** only. The address of the chapter's admin account. Only that address can open an empty hosted book. |
| `GROK_CHROME` | **Production and Preview:** `off`. Stops Grok's page chrome (the grok.com script and share-tag rewriting) on Vercel. Grok's own workspace preview is not affected. |
| `BROKER_SIGNIN` | Leave unset on Vercel (Production and Preview). Grok's Google/X sign-in service then stays off wherever `BETTER_AUTH_URL` is set. Set to `on` only for a deployment that must use it. |

Do not paste these into GitHub, Slack, or chat.

## Security headers

Every response sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. A header that is already present is left as it is, including the CORS headers on `/api/public-site`.

When `BETTER_AUTH_URL` is set and not blank (Vercel Production and Preview), the response also sends `Strict-Transport-Security: max-age=31536000`, `X-Frame-Options: DENY`, and `Content-Security-Policy-Report-Only` with `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src https://challenges.cloudflare.com; form-action 'self' https://checkout.stripe.com; base-uri 'self'; frame-ancestors 'none'`. Grok's workspace preview leaves `BETTER_AUTH_URL` unset and shows the app in an iframe, so those three stay off there. The content security policy is report-only until TanStack Start supports nonces.

Generate a secret locally (do not commit the output):

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Neon

**As built:** the database was created through Vercel's Neon integration, in Vercel-Managed mode. The Neon organization is "Vercel: cocheuno's projects", and the project is `chapter-book-db`. Its settings live in Vercel → **Storage**. The manual steps below are kept for reference only.

1. Sign in at https://console.neon.tech
2. **New project** named `chapter-book`
3. Region: **AWS US East (Ohio)** `aws-us-east-2` (or N. Virginia). Region cannot be moved later.
4. **Connect** → enable **connection pooling** → copy the URI into Vercel as `DATABASE_URL`

Empty Neon is fine. `npm run build` on Vercel runs `scripts/migrate.mjs` and applies `migrations/` to that environment's database. A Preview build skips this unless `ALLOW_PREVIEW_MIGRATIONS=on` and its database is not production's (see H1 step 3 below).

## Vercel

1. Import https://github.com/cocheuno/chapter-book
2. Framework: leave as the repo `vercel.json` (`npm run build`)
3. Add the env vars above
4. Deploy
5. After the first URL exists, set `BETTER_AUTH_URL` to that origin and redeploy if you did not know it yet

The first person to sign in on the **empty** hosted book is founder **admin**. After that, sign-up without the invite token is refused. Use a real operator email there — it lives in Neon, not in git.

## Preview database and secrets (H1)

**How the database is connected.** Vercel's Neon integration (Vercel-Managed) owns `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PG*`, and `POSTGRES_*`.

- You cannot edit or remove them under Environment Variables.
- They are set for Production, Preview, and Development. Since step 1, each new preview deployment of a branch **other than `main`** gets its own Neon branch's values, for its build and its running site, in place of production's.
- Their settings are in Vercel → **Storage** → `chapter-book-db`.

**Never reset the database password in the Neon Console.** Vercel's copy would not update, and the live site would lose its database until the integration is reconnected. If a reset is ever needed, do it through the integration (Vercel → Storage), or ask Vercel support.

**Where this stands (2026-10-03): H1 is done.** Steps 1–6 are complete.

- A preview of any branch other than `main` gets its own Neon branch, `preview/<git-branch>`, a copy of production. Its build migrates that copy, and its running site reads and writes it. The copy holds real records, which is why step 4 matters.
  - Verified on 2026-10-03: the `claude/chapter-book-review-enhancements-ez1onx` preview logged `[migrate] target: ep-… · VERCEL_ENV=preview` with the copy's endpoint id, and Neon showed only that copy waking up. Production stayed asleep.
- **A preview built from `main` gets no copy.** Its build and its running site both use **production**. Neon never makes a `preview/main` branch.
  - On 2026-10-03, a redeploy of a `main` preview with the old flag-only guard ran `scripts/migrate.mjs` against production. Nothing was applied (`[migrate] up to date.`).
  - The guard now skips such builds with `[migrate] WARNING … production's`.
  - **Do not edit content on a preview of `main`: it is the live database.**
- A preview built **before** 2026-10-03 also reads and writes **production**. Do not edit content on one; redeploy it first.
- Vercel redacts full database hosts in build logs (`[REDACTED]`). That is why the migrate line prints only the endpoint id (`ep-…`).

**"Needs Attention" on the database variables.** Vercel marks the integration's password-bearing variables `readable-secret`: anyone with access to the project can read them back.

- They were created on 2026-09-18, after Vercel's April 2026 incident, so that incident did not expose them.
- No password reset is needed.
- `BETTER_AUTH_SECRET` is already stored as Sensitive, with separate values for Production and Preview. Nothing to do there.

Do not paste a password, connection string, or secret into git, GitHub, Slack, or chat.

1. **Turn on Preview Branching.** *Done 2026-10-03.*
   - In Vercel, open **Storage** and click `chapter-book-db`. Open the **Projects** tab.
   - On the `chapter-book` row, click **⋯**. Two choices appear:
     - **Update Project Connection**: click this one.
     - **Remove Project Connection**: never click this one. It takes the database variables away from the live site.
   - The **Update Project Connection** dialog has three parts. There is no "Advanced Options" button.
     - **Environments**: leave **Production**, **Preview**, and **Development** all ticked. Unticking Production removes the live site's database.
     - **Require Active Resource Before Deploy**: turn the **Required** switch on. A new option appears, **Create database branch for deployment**, with checkboxes for **Preview** and **Production**.
       - Tick **Preview**.
       - **Never tick Production.** The live site must keep using Neon's `main` branch, where the chapter's records are. A branch per production deploy would point the live site at a fresh copy, and entries made after the copy would be left behind.
     - **Custom Environment Variable Prefix**: leave it empty. A prefix renames the variables (for example `X_DATABASE_URL`), and the book reads `DATABASE_URL`.
   - Click **Save**.

   From then on, each preview deployment gets its own Neon branch, `preview/<git-branch>`, a fresh copy of production. Its connection is injected at deploy time and does not appear under Environment Variables.
2. **Check it.** *Done 2026-10-03.* Redeploy a preview: Deployments → a preview → **⋯** → **Redeploy**.
   - A branch named `preview/<git-branch>` appears in the Neon Console, under Branches, made by Vercel. The 2026-10-03 check made `preview/h1-preview-migrations`.
   - The branch has its own compute, so its host (`ep-…-pooler…neon.tech`) differs from production's.
   - The build log says `[migrate] preview build: skipping migrations`; that is expected.
3. **Allow preview migrations.** *Done 2026-10-03.*
   - The guard (`migrateSkipReason` in `scripts/migration-plan.mjs`) lets a preview build migrate only when `ALLOW_PREVIEW_MIGRATIONS` is exactly `on` **and** its database is a Neon endpoint other than `PRODUCTION_DB_ENDPOINT`. If anything is missing or unclear, it skips.
   - **Find production's endpoint id.** The latest **Production** build log prints `[migrate] target: ep-… · VERCEL_ENV=production`; the `ep-…` part is the id. It is also in the Neon Console under Branches → `main` → Computes. It is not a password, but keep it out of git like every host detail.
   - Settings → **Environment Variables** → add `PRODUCTION_DB_ENDPOINT` with that id. **Sensitive: off** (it is config, not a secret). Environments: **Preview** only. Branch: leave empty.
   - Then edit `ALLOW_PREVIEW_MIGRATIONS`, still **Preview** only, and change `off` to exactly `on`: lowercase, no quotes or spaces.
   - Redeploy a preview of a branch **other than `main`** that was built after the guard was merged, and search its build log for `migrate`:
     - `[migrate] target: ep-… · VERCEL_ENV=preview` with an id **different** from production's, then `up to date` or `applied …`: the build migrated its own copy. This is the normal result.
     - `[migrate] WARNING preview build: skipping migrations. This build's DATABASE_URL is production's …`: the guard held. Expected for a preview of `main`. On any other branch, check that Preview Branching (step 1) is still on.
     - `PRODUCTION_DB_ENDPOINT is not a Neon endpoint id` or `ALLOW_PREVIEW_MIGRATIONS is not on`: fix that variable's value, then redeploy.
4. **Protect previews.** *Done 2026-10-03.*
   - Settings → **Deployment Protection** → turn **Vercel Authentication** on, with scope **Standard Protection**. Never choose **All Deployments**: it would lock the public site.
   - Then create a **Protection Bypass for Automation** secret and store it in a password manager. Leave the secret box empty so Vercel generates one: 32 letters and digits. Never use an example value from a document or chat, since anyone can read those. Vercel exposes it to deployments as `VERCEL_AUTOMATION_BYPASS_SECRET`. The WP-00 content snapshot sends it as the header `x-vercel-protection-bypass`, and sends `x-vercel-set-bypass-cookie: true`, only on requests to the site being snapshotted. Do not commit it.
5. **Check access** in a private browser window. *Done 2026-10-03.*
   - The preview URL asks for a Vercel login.
   - `https://chapter-book-beryl.vercel.app/p/ai-conference` and `https://scs-wisconsin-usa.org` load without it.
   - Check those two addresses, not a raw `*.vercel.app` deployment URL: Standard Protection can lock generated deployment URLs while the production domain stays public.
6. **Clean up.**
   - The manual Neon branch named `preview`, made on 2026-10-02, was deleted on 2026-10-03. Neon now has `main` (production) and the `preview/…` branches Vercel makes.
   - Branches the integration creates are deleted when their Vercel deployments expire (6 months by default). Delete old ones in Neon to save space.

## Cloudflare (later)

Point **For Members** at the Vercel URL. Do not put Postgres on Cloudflare.

## Check

- `https://<vercel-host>/login` shows Sign in, not “New volunteer”
- Empty book: “Open the book” once
- Chapter → Operators after you are in
- `/site` still does not list CRM people
