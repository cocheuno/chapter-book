import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  isMigrationFile,
  migrateTargetLine,
  migrationName,
  pendingMigrations,
  shouldMigrate,
} from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

const AUTH_MIGRATION = "0001_auth.sql";

/**
 * The auth-on copy of the Better Auth schema and its source, or null when the
 * app has not turned sign-in on (the shipped state).
 */
function authSchemaCopy(root) {
  const copy = join(root, "migrations", AUTH_MIGRATION);
  const source = join(root, "migrations/auth", AUTH_MIGRATION);
  if (!existsSync(copy) || !existsSync(source)) return null;
  return { copy: readFileSync(copy, "utf8"), source: readFileSync(source, "utf8") };
}

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/auth/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied from another directory does not re-apply", () => {
  // The auth-on path copies migrations/auth/0001_auth.sql into the globbed
  // directory; a database that already has it must not run it twice.
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped (readdir also yields the auth/ directory)", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("a top-level readdir does not descend into migrations/auth", () => {
  // The chapter migrations live in migrations/*.sql. The auth source stays in
  // migrations/auth/ and is not a second pending file.
  const migrationsDir = join(projectRoot(), "migrations");
  const pending = pendingMigrations(readdirSync(migrationsDir), []);
  assert.ok(pending.some((row) => row.name === "0002_chapter_book.sql"));
  assert.equal(
    pending.some((row) => row.path.includes("auth/") || row.path.includes("auth\\")),
    false,
  );
  assert.ok(readdirSync(join(migrationsDir, "auth")).includes("0001_auth.sql"));
});

const sampleUrl = "postgres://db.example/book";

test("shouldMigrate allows production", () => {
  assert.equal(
    shouldMigrate({ vercelEnv: "production", allowPreviewMigrations: undefined, databaseUrl: sampleUrl }),
    true,
  );
});

test("shouldMigrate skips a preview without the flag", () => {
  assert.equal(
    shouldMigrate({ vercelEnv: "preview", allowPreviewMigrations: undefined, databaseUrl: sampleUrl }),
    false,
  );
});

test("shouldMigrate allows a preview when the flag is on", () => {
  assert.equal(
    shouldMigrate({ vercelEnv: "preview", allowPreviewMigrations: "on", databaseUrl: sampleUrl }),
    true,
  );
});

test("shouldMigrate allows an unset environment", () => {
  assert.equal(
    shouldMigrate({ vercelEnv: undefined, allowPreviewMigrations: undefined, databaseUrl: sampleUrl }),
    true,
  );
});

test("shouldMigrate skips an empty database URL", () => {
  assert.equal(
    shouldMigrate({ vercelEnv: "production", allowPreviewMigrations: "on", databaseUrl: "" }),
    false,
  );
});

test("the migrate target line has the hostname only", () => {
  const password = "not-the-real-password";
  const databaseUrl = new URL("postgres://ep-example.neon.tech/neondb");
  databaseUrl.username = "appuser";
  databaseUrl.password = password;
  databaseUrl.searchParams.set("sslmode", "require");
  const line = migrateTargetLine({ databaseUrl: databaseUrl.href, vercelEnv: "production" });
  assert.equal(line.includes("@"), false);
  assert.equal(line.includes(password), false);
  assert.equal(line, "[migrate] target: ep-example.neon.tech · VERCEL_ENV=production");
  const unset = migrateTargetLine({ databaseUrl: databaseUrl.href, vercelEnv: undefined });
  assert.equal(unset.includes("@"), false);
  assert.equal(unset.includes(password), false);
  assert.equal(unset, "[migrate] target: ep-example.neon.tech · VERCEL_ENV=unset");
});

test("this workspace's auth schema copy is byte-identical to its source", () => {
  // An edited copy diverges silently: basename keying skips it on a database
  // that already ran the original, and applies it on a fresh PGLite preview.
  const pair = authSchemaCopy(projectRoot());
  if (pair === null) return; // sign-in off — nothing has been copied up
  assert.equal(
    pair.copy,
    pair.source,
    "migrations/0001_auth.sql has been edited — it must stay a verbatim copy of migrations/auth/0001_auth.sql",
  );
});

test("the copy check reads both files and catches an edit", () => {
  const root = mkdtempSync(join(tmpdir(), "auth-schema-"));
  mkdirSync(join(root, "migrations/auth"), { recursive: true });
  writeFileSync(join(root, "migrations/auth", AUTH_MIGRATION), "create table t ();\n");
  assert.equal(authSchemaCopy(root), null);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t ();\n");
  const same = authSchemaCopy(root);
  assert.equal(same.copy, same.source);

  writeFileSync(join(root, "migrations", AUTH_MIGRATION), "create table t (x int);\n");
  const drifted = authSchemaCopy(root);
  assert.notEqual(drifted.copy, drifted.source);
});
