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
- They are set for Production, Preview, and Development. Since step 1, each new preview deployment gets its own branch's values, injected at deploy time, in place of production's.
- Their settings are in Vercel → **Storage** → `chapter-book-db`.

**Never reset the database password in the Neon Console.** Vercel's copy would not update, and the live site would lose its database until the integration is reconnected. If a reset is ever needed, do it through the integration (Vercel → Storage), or ask Vercel support.

**Where this stands (2026-10-03):** steps 1, 2, and the branch clean-up in step 6 are done. Steps 3–5 are not.

- Preview builds skip migrations (`scripts/migrate.mjs`) until step 3.
- A preview deployment built since step 1 reads and writes its own Neon branch, a copy of production. The copy holds real records, which is why step 4 matters.
- A preview built **before** 2026-10-03 still reads and writes the **production** database. Do not edit content on one; redeploy it first.

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
   - The branch has its own compute, so its host (`ep-…-pooler…neon.tech`) differs from production's. Step 3 relies on this.
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
   - The manual Neon branch named `preview`, made on 2026-10-02, was deleted on 2026-10-03. Neon now has `main` (production) and the `preview/…` branches Vercel makes.
   - Branches the integration creates are deleted when their Vercel deployments expire (6 months by default). Delete old ones in Neon to save space.

## Cloudflare (later)

Point **For Members** at the Vercel URL. Do not put Postgres on Cloudflare.

## Check

- `https://<vercel-host>/login` shows Sign in, not “New volunteer”
- Empty book: “Open the book” once
- Chapter → Operators after you are in
- `/site` still does not list CRM people
