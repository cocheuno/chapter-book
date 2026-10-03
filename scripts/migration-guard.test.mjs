import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  findForbiddenSql,
  formatViolation,
  guardMigrationDir,
  isGuardedMigration,
  maskSql,
} from "./migration-guard.mjs";
import { projectRoot } from "./with-app-env.mjs";

/**
 * @param {string} dir
 * @param {string} name
 * @param {string} sql
 */
function writeSql(dir, name, sql) {
  writeFileSync(join(dir, name), sql);
}

test("only migrations numbered 0019 and up are checked", () => {
  assert.equal(isGuardedMigration("0018_event_speakers.sql"), false);
  assert.equal(isGuardedMigration("0019_notes.sql"), true);
  assert.equal(isGuardedMigration("0100_later.sql"), true);
  assert.equal(isGuardedMigration("0001_auth.sql"), false);
  assert.equal(isGuardedMigration("auth"), false);
});

test("comments and string literals are blanked without moving newlines", () => {
  const sql = "-- update site_items\nselect 'delete\nfrom persons';\n";
  const masked = maskSql(sql);
  assert.equal(masked.length, sql.length);
  assert.equal(masked.split("\n").length, sql.split("\n").length);
  assert.equal(/\bupdate\b/i.test(masked), false);
  assert.equal(/\bdelete\b/i.test(masked), false);
});

test("every forbidden form is reported from a fixture file", () => {
  const dir = mkdtempSync(join(tmpdir(), "migration-guard-bad-"));
  const cases = [
    ["0019_update.sql", "update site_items set title = 'x';\n", "update"],
    ["0020_delete.sql", "delete from persons;\n", "delete"],
    ["0021_truncate.sql", "truncate site_items;\n", "truncate"],
    ["0022_drop.sql", "drop table site_items;\n", "drop"],
    ["0023_rename.sql", "alter table site_items rename column title to name;\n", "rename"],
    [
      "0024_type.sql",
      "alter table site_items alter column title type text;\n",
      "alter column ... type",
    ],
    [
      "0025_default.sql",
      "alter table site_items alter column title set default 'x';\n",
      "alter column ... set default",
    ],
    [
      "0026_conflict.sql",
      "insert into site_items (id) values ('a') on conflict (id) do update set title = 'x';\n",
      "on conflict do update",
    ],
    [
      "0027_data_type.sql",
      "alter table site_items alter column title set data type text;\n",
      "alter column ... type",
    ],
  ];
  for (const [name, sql] of cases) writeSql(dir, name, sql);
  const found = guardMigrationDir(dir);
  for (const [name, , form] of cases) {
    const hit = found.find((row) => row.file === name && row.form === form);
    assert.ok(hit, `${name} should report ${form}`);
    assert.equal(hit.line, 1);
    assert.equal(formatViolation(hit), `${name}:1: ${form}`);
  }
  const conflict = found.filter((row) => row.file === "0026_conflict.sql");
  assert.deepEqual(
    conflict.map((row) => row.form),
    ["insert into", "on conflict do update"],
  );
  const dataType = found.filter((row) => row.file === "0027_data_type.sql");
  assert.deepEqual(
    dataType.map((row) => row.form),
    ["alter column ... type"],
  );
});

test("allowed forms, comments, and strings are not reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "migration-guard-ok-"));
  const files = {
    "0019_create.sql": "create table if not exists scratch (id text);\n",
    "0020_add_column.sql": "alter table notes add column if not exists note text;\n",
    "0021_create_index.sql": "create index if not exists notes_idx on notes (id);\n",
    "0022_comments.sql":
      "-- update site_items set title = 'x'\n" +
      "/*\ndelete from persons;\ntruncate site_items;\ndrop table persons;\nrename column title to name;\n" +
      "alter column title type text;\nalter column title set data type text;\n" +
      "alter column title set default 'a';\n" +
      "insert into site_items (id) values ('a');\ncopy site_items (id) from stdin;\n" +
      "merge into site_items t using (select 'a' as id) s on t.id = s.id when not matched then insert (id) values (s.id);\n*/\n" +
      "select 'update delete truncate drop rename insert into copy merge' as note;\n",
    "0023_delete_cascade.sql":
      "alter table notes add column parent_id text references chapters (id) on delete cascade;\n",
    "0024_delete_set_null.sql":
      "alter table notes add column parent_id text references chapters (id) on delete set null;\n",
    "0025_delete_restrict.sql":
      "alter table notes add column parent_id text references chapters (id) on delete restrict;\n",
    "0026_delete_no_action.sql":
      "alter table notes add column parent_id text references chapters (id) on delete no action;\n",
    "0027_update_cascade.sql":
      "alter table notes add column parent_id text references chapters (id) on update cascade;\n",
    "0028_update_actions.sql":
      "create table t (\n" +
      "  parent_id text references chapters (id) on update set null,\n" +
      "  other_id text references chapters (id) on update restrict,\n" +
      "  third_id text references chapters (id) on update no action,\n" +
      "  fourth_id text references chapters (id) on update set default\n" +
      ");\n",
    "0029_drop_index.sql":
      "create index if not exists notes_idx on notes (id);\ndrop index if exists notes_idx;\n",
    "0030_drop_index_plain.sql":
      "create unique index Notes_Idx on notes (id);\ndrop index notes_idx;\n",
    "0031_conflict_nothing.sql":
      "create table if not exists notes (id text);\n" +
      "insert into notes (id) values ('a') on conflict (id) do nothing;\n",
    "0032_string_default.sql":
      "alter table notes add column if not exists note text default 'do not update';\n",
    "0033_quoted_index.sql":
      'create index "Notes_Idx" on notes (id);\ndrop index if exists "Notes_Idx";\n',
  };
  for (const [name, sql] of Object.entries(files)) writeSql(dir, name, sql);
  assert.deepEqual(guardMigrationDir(dir), []);
});

test("insert, copy, and merge are forbidden unless the same file creates the table", () => {
  const forbidden = [
    ["insert into site_items (id) values ('a');\n", ["insert into"]],
    ["copy site_items (id) from stdin;\n", ["copy ... from"]],
    ['copy "Site_Items" (id) from stdin;\n', ["copy ... from"]],
    [
      "merge into site_items t using (select 'a' as id) s on t.id = s.id when not matched then insert (id) values (s.id);\n",
      ["merge into"],
    ],
    [
      "merge into public.site_items t using (select 'a' as id) s on t.id = s.id when not matched then insert (id) values (s.id);\n",
      ["merge into"],
    ],
    ["-- create table notes (id text);\ninsert into notes (id) values ('a');\n", ["insert into"]],
  ];
  for (const [sql, forms] of forbidden) {
    assert.deepEqual(
      findForbiddenSql("0019_write.sql", sql).map((row) => row.form),
      forms,
    );
  }
  assert.equal(
    findForbiddenSql(
      "0019_write.sql",
      "-- create table notes (id text);\ninsert into notes (id) values ('a');\n",
    )[0].line,
    2,
  );

  const allowed = [
    "create table notes (id text);\ninsert into notes (id) values ('a');\n",
    "create table if not exists notes (id text);\ncopy notes (id) from stdin;\n",
    "create table \"Notes\" (id text);\ninsert into public.notes (id) values ('a');\n",
    'create table public.notes (id text);\ncopy "Notes" (id) from stdin;\n',
    'create table notes (id text);\nmerge into "public"."Notes" t using (select \'a\' as id) s on t.id = s.id when not matched then insert (id) values (s.id);\n',
    "copy site_items to stdout;\n",
  ];
  for (const sql of allowed) {
    assert.deepEqual(findForbiddenSql("0019_new.sql", sql), []);
  }

  const mixed =
    "create table notes (id text);\n" +
    "insert into notes (id) values ('a');\n" +
    "insert into site_items (id) values ('b');\n";
  assert.deepEqual(findForbiddenSql("0019_mix.sql", mixed), [
    { file: "0019_mix.sql", line: 3, form: "insert into" },
  ]);
});

test("create table if not exists does not reopen a table from an earlier migration", () => {
  const sql =
    "create table if not exists site_items (id text); insert into site_items (id) values ('x');";
  assert.deepEqual(
    findForbiddenSql("0019_y.sql", sql, new Set(["site_items"])).map((row) => row.form),
    ["insert into"],
  );
  assert.deepEqual(
    findForbiddenSql(
      "0019_new.sql",
      "create table notes (id text); insert into notes (id) values ('a');",
      new Set(["site_items"]),
    ),
    [],
  );

  const dir = mkdtempSync(join(tmpdir(), "migration-guard-earlier-"));
  writeSql(dir, "0002_x.sql", "create table site_items (id text);\n");
  writeSql(dir, "0019_y.sql", `${sql}\n`);
  const found = guardMigrationDir(dir);
  assert.ok(found.some((row) => row.file === "0019_y.sql" && row.form === "insert into"));
  assert.equal(
    found.some((row) => row.file === "0002_x.sql"),
    false,
  );
});

test("a table created under migrations/auth already exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "migration-guard-auth-"));
  mkdirSync(join(dir, "auth"));
  writeSql(join(dir, "auth"), "0001_auth.sql", 'create table "User" (id text);\n');
  writeSql(
    dir,
    "0019_user.sql",
    "create table if not exists public.user (id text);\ninsert into \"User\" (id) values ('a');\n",
  );
  assert.deepEqual(guardMigrationDir(dir), [
    { file: "0019_user.sql", line: 2, form: "insert into" },
  ]);
});

test("alter column set data type is the type form", () => {
  assert.deepEqual(
    findForbiddenSql(
      "0019_type.sql",
      'alter table site_items alter column "Title" set data type text;\n',
    ),
    [{ file: "0019_type.sql", line: 1, form: "alter column ... type" }],
  );
});

test("drop index is forbidden when the same file does not create it", () => {
  const dir = mkdtempSync(join(tmpdir(), "migration-guard-drop-"));
  writeSql(dir, "0019_drop_index.sql", "drop index if exists notes_idx;\n");
  writeSql(
    dir,
    "0020_commented_create.sql",
    "-- create index fake_idx on notes (id);\ndrop index if exists fake_idx;\n",
  );
  const found = guardMigrationDir(dir);
  assert.equal(
    found.some((row) => row.file === "0019_drop_index.sql" && row.form === "drop"),
    true,
  );
  assert.equal(
    found.some(
      (row) => row.file === "0020_commented_create.sql" && row.line === 2 && row.form === "drop",
    ),
    true,
  );
});

test("on update outside a foreign-key clause is forbidden", () => {
  const found = findForbiddenSql("0019_on_update.sql", "on update cascade;\n");
  assert.deepEqual(
    found.map((row) => row.form),
    ["update"],
  );
});

test("on delete set default is not one of the allowed actions", () => {
  const found = findForbiddenSql(
    "0019_set_default.sql",
    "alter table notes add column parent_id text references chapters (id) on delete set default;\n",
  );
  assert.equal(
    found.some((row) => row.form === "delete"),
    true,
  );
});

test("a real update is reported on its own line when the file also has an allowed foreign key", () => {
  const sql =
    "create table t (\n" +
    "  parent_id text references chapters (id) on delete cascade\n" +
    ");\n" +
    "update site_items set title = 'x';\n";
  const found = findForbiddenSql("0019_mixed.sql", sql);
  assert.deepEqual(found, [{ file: "0019_mixed.sql", line: 4, form: "update" }]);
});

test("case does not hide a forbidden word, and updated_at is a different word", () => {
  assert.deepEqual(findForbiddenSql("0019_case.sql", "UPDATE site_items SET title = 'kept';\n"), [
    { file: "0019_case.sql", line: 1, form: "update" },
  ]);
  assert.deepEqual(
    findForbiddenSql(
      "0019_word.sql",
      "alter table t add column if not exists updated_at timestamptz;\n",
    ),
    [],
  );
});

test("older files and migrations/auth are not checked", () => {
  const dir = mkdtempSync(join(tmpdir(), "migration-guard-skip-"));
  writeSql(dir, "0018_old.sql", "update site_items set title = 'x';\n");
  mkdirSync(join(dir, "auth"));
  writeSql(join(dir, "auth"), "0019_auth.sql", "delete from persons;\n");
  writeSql(dir, "0019_ok.sql", "create table if not exists notes (id text);\n");
  assert.deepEqual(guardMigrationDir(dir), []);
});

test("the real migrations folder has no guarded violation", () => {
  const violations = guardMigrationDir(join(projectRoot(), "migrations"));
  assert.deepEqual(violations, []);
});
