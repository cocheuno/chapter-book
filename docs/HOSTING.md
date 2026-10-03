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

Do not paste these into GitHub, Slack, or chat.

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

Empty Neon is fine. `npm run build` on Vercel runs `scripts/migrate.mjs` and applies `migrations/` to that environment's database. A Preview build skips this until `ALLOW_PREVIEW_MIGRATIONS=on` (see below).

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
- Until step 1 below is done, they apply to Production, Preview, and Development.
- Their settings are in Vercel → **Storage** → the Neon database.

**Never reset the database password in the Neon Console.** Vercel's copy would not update, and the live site would lose its database until the integration is reconnected. If a reset is ever needed, do it through the integration (Vercel → Storage), or ask Vercel support.

**Until step 3:**

- Preview builds skip migrations (`scripts/migrate.mjs`).
- A running preview deployment still reads and writes the **production** database. Do not edit content on a preview.

**"Needs Attention" on the database variables.** Vercel marks the integration's password-bearing variables `readable-secret`: anyone with access to the project can read them back.

- They were created on 2026-09-18, after Vercel's April 2026 incident, so that incident did not expose them.
- No password reset is needed.
- `BETTER_AUTH_SECRET` is already stored as Sensitive, with separate values for Production and Preview. Nothing to do there.

Do not paste a password, connection string, or secret into git, GitHub, Slack, or chat.

1. **Turn on Preview Branching.**
   - In Vercel, open **Storage** and click the Neon database. Open **Projects**, then the `chapter-book` connection's settings, then **Advanced Options → Deployments Configuration**.
   - Turn on **Preview** and **Resource must be active before deployment**. Save.
   - If the connection cannot be edited there, stop. The alternative is removing and reconnecting the project, which briefly removes the production variables and needs a careful plan.

   From then on, each preview deployment gets its own Neon branch, `preview/<git-branch>`, a fresh copy of production. Its connection is injected at deploy time and does not appear under Environment Variables.
2. **Check it.** Redeploy a preview: Deployments → a preview → **⋯** → **Redeploy**.
   - A branch named `preview/<git-branch>` appears in the Neon Console.
   - The build log still says `[migrate] preview build: skipping migrations`; that is expected until step 3.
3. **Allow preview migrations, only after step 2 shows the branch.**
   - Settings → **Environment Variables** → add `ALLOW_PREVIEW_MIGRATIONS` with the value `on`, for **Preview** only.
   - Redeploy a preview. Its build log shows `[migrate] target: <host> · VERCEL_ENV=preview`, and that host must differ from the one in the latest **Production** build log.
   - If Preview Branching is not on, this flag would let previews migrate production.
4. **Protect previews.**
   - Settings → **Deployment Protection** → turn **Vercel Authentication** on, with scope **Standard Protection**. Never choose **All Deployments**: it would lock the public site.
   - Then create a **Protection Bypass for Automation** secret and store it in a password manager. Vercel exposes it to deployments as `VERCEL_AUTOMATION_BYPASS_SECRET`. The WP-00 content snapshot sends it as the header `x-vercel-protection-bypass`. Do not commit it.
5. **Check access** in a private browser window:
   - The preview URL asks for a Vercel login.
   - `https://chapter-book-beryl.vercel.app/p/ai-conference` and `https://scs-wisconsin-usa.org` load without it.
   - Check those two addresses, not a raw `*.vercel.app` deployment URL: Standard Protection can lock generated deployment URLs while the production domain stays public.
6. **Clean up.**
   - The manual Neon branch named `preview`, made on 2026-10-02, is no longer needed. Delete it in the Neon Console when convenient.
   - Branches the integration creates are deleted when their Vercel deployments expire (6 months by default). Delete old ones in Neon to save space.

## Cloudflare (later)

Point **For Members** at the Vercel URL. Do not put Postgres on Cloudflare.

## Check

- `https://<vercel-host>/login` shows Sign in, not “New volunteer”
- Empty book: “Open the book” once
- Chapter → Operators after you are in
- `/site` still does not list CRM people
