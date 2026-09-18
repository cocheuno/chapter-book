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

Set on **Production** (and Preview only if you want a separate Neon branch):

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

Empty Neon is fine. `npm run build` on Vercel runs `scripts/migrate.mjs` and applies `migrations/`.

## Vercel

1. Import https://github.com/cocheuno/chapter-book
2. Framework: leave as the repo `vercel.json` (`npm run build`)
3. Add the env vars above
4. Deploy
5. After the first URL exists, set `BETTER_AUTH_URL` to that origin and redeploy if you did not know it yet

The first person to sign in on the **empty** hosted book is founder **admin**. After that, only invites work. Use a real operator email there — it lives in Neon, not in git.

## Cloudflare (later)

Point **For Members** at the Vercel URL. Do not put Postgres on Cloudflare.

## Check

- `https://<vercel-host>/login` shows Sign in, not “New volunteer”
- Empty book: “Open the book” once
- Chapter → Operators after you are in
- `/site` still does not list CRM people
