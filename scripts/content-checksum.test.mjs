import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  COLUMNS_SQL,
  CONTENT_TABLES,
  READ_ONLY_SESSION_SQL,
  UTC_SESSION_SQL,
  changesForCompare,
  checksumSql,
  checksumTables,
  columnExpr,
  columnsFromMeta,
  compareChecksums,
  formatChecksumChanges,
  main,
  quoteIdent,
  runReadOnly,
} from "./content-checksum.mjs";
import { projectRoot } from "./with-app-env.mjs";

test("content tables are the tables created by migrations 0002-0018", () => {
  const dir = join(projectRoot(), "migrations");
  const found = new Set();
  for (const name of readdirSync(dir)) {
    const number = /^(\d+)_/.exec(name);
    if (!number) continue;
    const n = Number(number[1]);
    if (n < 2 || n > 18) continue;
    const sql = readFileSync(join(dir, name), "utf8");
    for (const match of sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+([a-z_]+)/gi)) {
      found.add(match[1].toLowerCase());
    }
  }
  assert.deepEqual([...found].sort(), CONTENT_TABLES);
  for (const auth of ["user", "session", "account", "verification"]) {
    assert.equal(CONTENT_TABLES.includes(auth), false);
  }
});

test("identifiers are quoted and unsafe names are refused", () => {
  assert.equal(quoteIdent("site_items"), '"site_items"');
  assert.throws(() => quoteIdent('id"; drop table persons'), /unsafe identifier/);
});

test("the checksum statement returns only a count and an md5", () => {
  const sql = checksumSql("site_images", [
    { name: "id", bytea: false },
    { name: "bytes", bytea: true },
  ]);
  assert.match(sql, /^select count\(\*\)::bigint as count, md5\(coalesce\(string_agg/);
  assert.match(sql, /md5\("bytes"\)/);
  assert.match(sql, /"id"::text/);
  assert.equal(sql.includes("select *"), false);
  assert.equal(columnExpr({ name: "bytes", bytea: true }).includes("E'\\\\N'"), true);
});

test("compare uses the saved column list and reports count or hash changes", async () => {
  /** @type {string[]} */
  const hashed = [];
  const query = async (sql, params) => {
    if (sql === COLUMNS_SQL) {
      assert.deepEqual(params, ["events"]);
      return {
        rows: [
          { column_name: "id", data_type: "text" },
          { column_name: "extra", data_type: "text" },
        ],
      };
    }
    hashed.push(sql);
    return { rows: [{ count: 1, md5: "same" }] };
  };
  const before = { tables: { events: { columns: ["id"], count: 1, md5: "same" } } };
  const collected = await checksumTables(query, ["events"], { events: ["id"] });
  assert.equal(hashed.length, 1);
  assert.equal(hashed[0].includes('"extra"'), false);
  assert.equal(hashed[0].includes('"id"'), true);
  assert.deepEqual(changesForCompare(before, collected), []);
  assert.deepEqual(Object.keys(collected.document.tables.events).sort(), ["columns", "count", "md5"]);

  const changed = compareChecksums(before, {
    tables: { events: { count: 2, md5: "other" } },
  });
  assert.equal(
    formatChecksumChanges(changed),
    "events: count 1 -> 2, md5 same -> other",
  );
  assert.equal(formatChecksumChanges([]), "unchanged");
});

test("a column saved in the before-file and missing now is named", () => {
  const { missing } = columnsFromMeta([{ column_name: "id", data_type: "text" }], ["id", "gone"]);
  assert.equal(missing, "gone");
  assert.equal(
    formatChecksumChanges([{ table: "events", missingColumn: "gone" }]),
    "events: missing column gone",
  );
});

test("the session is set read-only before any read, and a missing URL does not connect", async () => {
  const calls = [];
  await runReadOnly(
    {
      async query(sql) {
        calls.push(sql);
        return { rows: [] };
      },
    },
    async () => "done",
  );
  assert.deepEqual(calls, [READ_ONLY_SESSION_SQL, UTC_SESSION_SQL]);
  let connected = false;
  await assert.rejects(
    () =>
      main(["out.json"], {}, async () => {
        connected = true;
        throw new Error("connected");
      }),
    /DATABASE_URL is not set/,
  );
  assert.equal(connected, false);
});

test("row text sorts, nulls and bytea hash, and a read-only session refuses a write", async () => {
  const db = new PGlite();
  await db.waitReady;
  await db.exec("create table sample (id text, note text, bytes bytea)");
  const columns = [
    { name: "id", bytea: false },
    { name: "note", bytea: false },
    { name: "bytes", bytea: true },
  ];
  await db.exec("insert into sample (id, note, bytes) values ('b', 'hello', decode('00ff', 'hex'))");
  await db.exec("insert into sample (id, note, bytes) values ('a', null, null)");
  const byteHash = createHash("md5").update(Buffer.from([0x00, 0xff])).digest("hex");
  const expected = [`a\t\\N\t\\N`, `b\thello\t${byteHash}`];
  const lines = await db.query(
    `select ${columns.map(columnExpr).join(" || E'\\t' || ")} as line from sample`,
  );
  assert.deepEqual(
    lines.rows.map((row) => row.line).sort(),
    expected,
  );
  const hashed = await db.query(checksumSql("sample", columns));
  assert.equal(Number(hashed.rows[0].count), 2);
  assert.equal(hashed.rows[0].md5, createHash("md5").update(expected.join("\n")).digest("hex"));

  await db.exec("create table empty_sample (id text)");
  const empty = await db.query(checksumSql("empty_sample", [{ name: "id", bytea: false }]));
  assert.equal(Number(empty.rows[0].count), 0);
  assert.equal(empty.rows[0].md5, createHash("md5").update("").digest("hex"));

  await db.exec(READ_ONLY_SESSION_SQL);
  await assert.rejects(() => db.exec("insert into sample (id) values ('z')"));
});
