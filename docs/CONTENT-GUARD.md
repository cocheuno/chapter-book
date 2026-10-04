# Content guard

These commands show whether a change leaves the chapter's current data, and the public pages, alone. They only read. They do not migrate, update, or delete.

`artifacts/content/` is git-ignored. Do not commit a snapshot, a screenshot, or a checksum. Do not paste row values, a connection string, or `VERCEL_AUTOMATION_BYPASS_SECRET` into a pull request or a doc.

## In GitHub

The usual way to check a pull request is the **Content guard** Action (`.github/workflows/content-guard.yml`). It compares production's public pages with the pull request's Vercel preview. The preview runs on its own copy of production data (H1 in `docs/HOSTING.md`).

1. Wait until the pull request's **Vercel** check is green. The Action needs a ready preview.
2. Open the repository's **Actions** tab and click **Content guard** in the left list.
3. Click **Run workflow**. Leave **Branch** on **main**, type the pull request number in **pr**, and click the green **Run workflow** button.
4. When the run turns green, open it and read the summary. `no differences` is the normal result. A run that finds differences fails, and its summary lists each page that changed.

The Action runs only from `main`, so the scripts that receive the bypass secret are the reviewed ones. It needs the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`, a copy of Vercel's Protection Bypass for Automation secret. Snapshots and screenshots are kept with the run for 7 days.

The commands below are the same tools, run by hand.

## Migration check

`npm test` runs the guard over `migrations/` files numbered `0019` and up. Older files, and everything under `migrations/auth/`, are left alone.

```
node scripts/migration-guard.mjs
```

A forbidden statement prints `filename:line: form` and the command exits 1. The forms are `update`, `delete`, `truncate`, `drop`, `rename`, `alter column ... type` (also `alter column ... set data type`), `alter column ... set default`, `on conflict do update`, `insert into`, `copy ... from`, and `merge into`.

These are allowed:

- `create table`, `add column`, `create index`
- `on delete cascade`, `on delete set null`, `on delete restrict`, and `on delete no action`
- `on update ...` inside a foreign-key clause
- `drop index [if exists] X` when the same file creates index `X`
- `on conflict do nothing`
- `insert into T`, `copy T ... from`, and `merge into T` when the same file creates table `T`, and no earlier migration created it (`create table` or `create table if not exists`). Earlier migrations are every file numbered below this one, plus every file in `migrations/auth/`. The name matches with or without double quotes and an optional `public.` prefix, ignoring case. `update` inside a merge is still the `update` form.
- the same words inside a `--` comment, a `/* */` comment, or a `'...'` string

## Snapshot

Public pages are rendered in a browser. Playwright launches it. Set `CHROMIUM_PATH` to a Chrome or Chromium executable when Playwright's browser is not already installed. This repository does not download a browser.

```
npm run content:snapshot -- http://127.0.0.1:8080 artifacts/content/before
```

The second argument is the output directory. When it is omitted, the directory is `artifacts/content`. The command writes `snapshot.json` there, and a full-page PNG next to it for each page.

Pages:

1. `/api/public-site` — the JSON body, saved as returned
2. `/site`
3. `/p/<slug>` for every slug in that feed
4. every link on those `/p/<slug>` pages whose path starts with `/p/<slug>/speakers/`

Each page waits for the network to go idle, then records the HTTP status, `document.body.innerText`, and the screenshot. A renamed page's old address replaces itself with the new one in the browser; the snapshot waits for that too and records where the page ended up (`finalPath`). The diff reports `ends at: … -> …` when that changes.

When `VERCEL_AUTOMATION_BYPASS_SECRET` is set, a request receives `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie: true` only when its origin is the site being snapshotted. Other origins, including `fonts.googleapis.com` and `fonts.gstatic.com`, are continued unchanged and never receive the secret. The value is not printed and is not written into the snapshot.

## Diff

```
npm run content:diff -- artifacts/content/before/snapshot.json artifacts/content/after/snapshot.json
```

When the two files match, the command prints `no differences` and exits 0. Otherwise it prints each differing page with the changed lines and exits 1.

A field that is not content, such as a timestamp, has to be named in `IGNORED_FIELDS` in `scripts/content-diff.mjs`. The list is empty today. A named field is printed as `ignored:` so the skip is visible.

## Checksum

`DATABASE_URL` must be set. On Vercel that URL is Neon's pooled connection, and the pooler does not keep session `SET` statements. Every read runs in one transaction: `begin transaction read only`, then `set local time zone 'UTC'`, then the queries, then `rollback`. `rollback` also runs when a read fails. The file contains table names, column names, row counts, and md5 hashes. It does not contain row values, and the command does not print the connection string.

```
npm run content:checksum -- artifacts/content/before.json
npm run content:checksum -- --compare artifacts/content/before.json
```

`--compare` re-reads using the column list saved in the before-file. A column added after that file was written does not change the sum. Each table whose count or hash changed is printed, and the command exits 1. When nothing changed it prints `unchanged` and exits 0.

The tables are the ones created by migrations `0002` through `0018` and still there (`0003` folded `schools` into `organizations` and dropped it). Better Auth's `user`, `session`, `account`, and `verification` tables are not included. A `bytea` column is hashed with `md5` rather than copied. A null is the two characters `\N`.

## What a pull request includes

Paste the snapshot diff (or `none`) and the checksum compare (or `unchanged`) into the pull request template. For a Grok Build pull request, the maintainer runs the Content guard Action and the production checksum, so the description says "Pending: Content guard Action run by the maintainer."

Comparing production with a preview needs production access and the bypass secret. That run is for a reviewer. A check that does not have those credentials is two snapshots of the same local server: an empty diff shows the tool reports no difference when the pages did not change.
