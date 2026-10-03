# Content guard

These commands show whether a change leaves the chapter's current data, and the public pages, alone. They only read. They do not migrate, update, or delete.

`artifacts/content/` is git-ignored. Do not commit a snapshot, a screenshot, or a checksum. Do not paste row values, a connection string, or `VERCEL_AUTOMATION_BYPASS_SECRET` into a pull request or a doc.

## Migration check

`npm test` runs the guard over `migrations/` files numbered `0019` and up. Older files, and everything under `migrations/auth/`, are left alone.

```
node scripts/migration-guard.mjs
```

A forbidden statement prints `filename:line: form` and the command exits 1. The forms are `update`, `delete`, `truncate`, `drop`, `rename`, `alter column ... type`, `alter column ... set default`, and `on conflict do update`.

These are allowed:

- `create table`, `add column`, `create index`
- `on delete cascade`, `on delete set null`, `on delete restrict`, and `on delete no action`
- `on update ...` inside a foreign-key clause
- `drop index [if exists] X` when the same file creates index `X`
- `on conflict do nothing`
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

Each page waits for the network to go idle, then records the HTTP status, `document.body.innerText`, and the screenshot.

When `VERCEL_AUTOMATION_BYPASS_SECRET` is set, every request sends that value as `x-vercel-protection-bypass` and sends `x-vercel-set-bypass-cookie: true`. The value is not printed and is not written into the snapshot.

## Diff

```
npm run content:diff -- artifacts/content/before/snapshot.json artifacts/content/after/snapshot.json
```

When the two files match, the command prints `no differences` and exits 0. Otherwise it prints each differing page with the changed lines and exits 1.

A field that is not content, such as a timestamp, has to be named in `IGNORED_FIELDS` in `scripts/content-diff.mjs`. The list is empty today. A named field is printed as `ignored:` so the skip is visible.

## Checksum

`DATABASE_URL` must be set. The first statement is `set session characteristics as transaction read only`, so the script cannot write. The next statement sets the session time zone to UTC, which does not write; it keeps timestamp text stable. The file contains table names, column names, row counts, and md5 hashes. It does not contain row values, and the command does not print the connection string.

```
npm run content:checksum -- artifacts/content/before.json
npm run content:checksum -- --compare artifacts/content/before.json
```

`--compare` re-reads using the column list saved in the before-file. A column added after that file was written does not change the sum. Each table whose count or hash changed is printed, and the command exits 1. When nothing changed it prints `unchanged` and exits 0.

The tables are the ones created by migrations `0002` through `0018`. Better Auth's `user`, `session`, `account`, and `verification` tables are not included. A `bytea` column is hashed with `md5` rather than copied. A null is the two characters `\N`.

## What a pull request includes

Paste the snapshot diff (or `none`) and the checksum compare (or `unchanged`) into the pull request template.

Comparing production with a preview needs production access and the bypass secret. That run is for a reviewer. A check that does not have those credentials is two snapshots of the same local server: an empty diff shows the tool reports no difference when the pages did not change.
