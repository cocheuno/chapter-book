// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}

/**
 * The Neon endpoint id ("ep-…") named by a connection URL, a hostname, or a
 * bare id, with any "-pooler" suffix dropped. Null when it is not a Neon
 * endpoint. Vercel redacts the full database host in build logs, but not this.
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function neonEndpointId(value) {
  let host = (value ?? "").trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  const id = host.split(".")[0].replace(/-pooler$/, "");
  return /^ep-[a-z0-9-]+$/.test(id) ? id : null;
}

/**
 * True when two endpoint ids name the same Neon endpoint. A compute-specific
 * id ("ep-a-b-1234-xyz") extends its endpoint's id, so either may prefix the
 * other; a near miss counts as the same, which only ever skips a migration.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameNeonEndpoint(a, b) {
  return a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
}

/**
 * Why `scripts/migrate.mjs` must not open DATABASE_URL, or null when it may.
 *
 * A preview build migrates only when ALLOW_PREVIEW_MIGRATIONS is exactly "on"
 * AND its database is a Neon endpoint other than PRODUCTION_DB_ENDPOINT.
 * The flag alone is not enough: Vercel's Neon integration makes no preview
 * branch for a preview built from `main`, so that build holds production's
 * DATABASE_URL. On 2026-10-03 one such build ran the migrator against
 * production (docs/HOSTING.md, H1). Every doubt skips.
 * @param {{ vercelEnv?: string, allowPreviewMigrations?: string, databaseUrl?: string, productionEndpoint?: string }} input
 * @returns {string | null}
 */
export function migrateSkipReason(input) {
  if (!input.databaseUrl) {
    return "DATABASE_URL not set — skipping (the PGLite fallback migrates itself).";
  }
  if (input.vercelEnv !== "preview") return null;
  if (input.allowPreviewMigrations !== "on") {
    return "preview build: skipping migrations. ALLOW_PREVIEW_MIGRATIONS is not on (docs/HOSTING.md, H1 step 3).";
  }
  const production = neonEndpointId(input.productionEndpoint);
  if (production === null) {
    return "preview build: skipping migrations. PRODUCTION_DB_ENDPOINT is not a Neon endpoint id (ep-…), so this build cannot tell its database from production's (docs/HOSTING.md, H1 step 3).";
  }
  const target = neonEndpointId(input.databaseUrl);
  if (target === null) {
    return "preview build: skipping migrations. DATABASE_URL is not a Neon endpoint, so it cannot be checked against production's.";
  }
  if (sameNeonEndpoint(target, production)) {
    return `WARNING preview build: skipping migrations. This build's DATABASE_URL is production's (${production}); no Neon preview branch was made for it (a preview of main never gets one).`;
  }
  return null;
}

/**
 * Whether `scripts/migrate.mjs` may open DATABASE_URL.
 * @param {{ vercelEnv?: string, allowPreviewMigrations?: string, databaseUrl?: string, productionEndpoint?: string }} input
 * @returns {boolean}
 */
export function shouldMigrate(input) {
  return migrateSkipReason(input) === null;
}

/**
 * Build log line: the Neon endpoint id (or, off Neon, the hostname) and
 * VERCEL_ENV. Never the user, password, or query string.
 * @param {{ databaseUrl: string, vercelEnv?: string }} input
 * @returns {string}
 */
export function migrateTargetLine(input) {
  const target = neonEndpointId(input.databaseUrl) ?? new URL(input.databaseUrl).hostname;
  const env = input.vercelEnv ? input.vercelEnv : "unset";
  return `[migrate] target: ${target} · VERCEL_ENV=${env}`;
}
