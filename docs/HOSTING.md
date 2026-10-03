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

Set these on **Production**. Preview gets its own values only in [Preview database and secrets (H1)](#preview-database-and-secrets-h1). Do not point Preview at the production database.

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string (`-pooler` in the hostname, `sslmode=require`) |
| `BETTER_AUTH_SECRET` | Long random string (32+ bytes). Not the database password. |
| `BETTER_AUTH_URL` | Public origin, currently `https://chapter-book-beryl.vercel.app` (no trailing slash) |
| `VITE_AUTH_ENABLED` | `true` |

Do not paste these into GitHub, Slack, or chat.

Generate a secret locally (do not commit the output):

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Neon

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

Do this in the dashboards. Do not paste a password, connection string, or secret into git, GitHub, Slack, or chat. Until step 7, preview builds skip migrations and do not open the production database.

1. In Vercel, open the project → **Settings** → **Environment Variables**. Find `DATABASE_URL`. Hover over the yellow **Needs Attention** badge and write down the exact message before changing anything.
2. In the Neon Console, open the project and select the branch the live site uses (the branch menu at the top of the sidebar; the default name is often `main`). Under **Postgres database**, select **Roles**. On the role's **⋯** menu, choose **Reset password**, then **Reset**. The old password stops working on the next connection. Expect a few minutes of downtime until step 5 finishes. Click **Connect**, leave **Connection pooling** on, and copy the pooled connection string (the hostname contains `-pooler`). Put that string only in your password manager, not in a file in this repo.
3. Back in Vercel → **Settings** → **Environment Variables**, open `DATABASE_URL`'s **⋯** menu and remove it. **Add Environment Variable** again with the new pooled string. Set the environment filter to **Production** only. Under **Type**, choose **Secret** (older screens called this Sensitive). The deployment that is already running keeps the old value until step 5 redeploys it.
4. Do the same for `BETTER_AUTH_SECRET`: remove it, then add a new random value from the command above, **Production** only, type **Secret**. Use a different value from the database password. Everyone is signed out once, when the redeploy in step 5 picks up this new value.
5. Open **Deployments**, find the latest **Production** deployment, and choose **Redeploy** from its **⋯** menu. In the build log, confirm a line `[migrate] target:` whose hostname is the production host and `VERCEL_ENV=production`. Then open the public site and confirm it loads.
6. In Neon, create a branch named `preview` from the production branch, including its current data. Open **Connect** on that branch, leave **Connection pooling** on, and copy its pooled connection string. Its hostname must differ from production's.
7. In Vercel → **Settings** → **Environment Variables**, add these for **Preview** only, each with type **Secret**:
   - `DATABASE_URL` — the preview branch's pooled string
   - `BETTER_AUTH_SECRET` — another new random value, not the production one
   - `ALLOW_PREVIEW_MIGRATIONS` — the value `on`
8. Open **Settings** → **Deployment Protection**. Turn **Vercel Authentication** on. Set the scope to **Standard Protection**. Do not choose **All Deployments** — that would lock the public site. Then create a **Protection Bypass for Automation** secret and store it in the password manager. Vercel exposes that value to deployments as `VERCEL_AUTOMATION_BYPASS_SECRET`. Do not commit it. The content snapshot (WP-00) sends it as the header `x-vercel-protection-bypass` when the variable is set.
9. Redeploy a preview deployment. In its build log, the `[migrate] target:` hostname must differ from the production hostname in step 5.
10. In a private browser window, open the preview URL and confirm it asks for a Vercel login. Confirm `https://chapter-book-beryl.vercel.app/p/ai-conference` and `https://scs-wisconsin-usa.org` still load without that login. Check those two addresses, not a raw `*.vercel.app` production deployment URL: Standard Protection can gate generated deployment URLs while the production domain stays public.

## Cloudflare (later)

Point **For Members** at the Vercel URL. Do not put Postgres on Cloudflare.

## Check

- `https://<vercel-host>/login` shows Sign in, not “New volunteer”
- Empty book: “Open the book” once
- Chapter → Operators after you are in
- `/site` still does not list CRM people
