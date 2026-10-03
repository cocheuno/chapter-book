#!/usr/bin/env node
/**
 * Read-only checksum of the chapter tables created by migrations 0002–0018.
 *
 * DATABASE_URL on Vercel is Neon's pooled connection, and the pooler does not
 * keep session SET statements. Every read runs in one transaction: begin
 * transaction read only, set local time zone to UTC, the queries, then
 * rollback (also when a read fails). Output is table names, column names,
 * counts, and md5 hashes only.
 *
 * Usage:
 *   node scripts/content-checksum.mjs <out.json>
 *   node scripts/content-checksum.mjs --compare <before.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { isMainModule } from "./with-app-env.mjs";

/** Tables created by migrations 0002–0018. Better Auth tables are not included. */
export const CONTENT_TABLES = [
  "affiliations",
  "chapter_members",
  "chapters",
  "event_links",
  "event_sessions",
  "event_slots",
  "event_speakers",
  "events",
  "list_items",
  "mail_messages",
  "mail_templates",
  "mailing_skips",
  "mailings",
  "operator_invites",
  "organizations",
  "participations",
  "person_roles",
  "persons",
  "program_pieces",
  "schools",
  "site_images",
  "site_items",
  "site_settings",
  "tasks",
  "touches",
];

/** One transaction. The pooler keeps SET LOCAL for that transaction only. */
export const BEGIN_READ_ONLY_SQL = "begin transaction read only";
export const SET_LOCAL_UTC_SQL = "set local time zone 'UTC'";
export const ROLLBACK_SQL = "rollback";

export const COLUMNS_SQL =
  "select column_name, data_type from information_schema.columns " +
  "where table_schema = 'public' and table_name = $1 order by ordinal_position";

/**
 * @param {string} name
 * @returns {string}
 */
export function quoteIdent(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`content-checksum: unsafe identifier ${name}`);
  }
  return `"${name}"`;
}

/**
 * One column of a checksum line: bytea as md5, null as \N, everything else as text.
 * @param {{ name: string, bytea: boolean }} column
 * @returns {string}
 */
export function columnExpr(column) {
  const id = quoteIdent(column.name);
  if (column.bytea) return `case when ${id} is null then E'\\\\N' else md5(${id}) end`;
  return `case when ${id} is null then E'\\\\N' else ${id}::text end`;
}

/**
 * Count and one md5. Rows are ordered by the line text, not by a query result order.
 * The outer select returns only count and md5.
 * @param {string} table
 * @param {Array<{ name: string, bytea: boolean }>} columns
 * @returns {string}
 */
export function checksumSql(table, columns) {
  if (!columns.length) throw new Error(`content-checksum: ${table} has no columns`);
  const line = columns.map(columnExpr).join(" || E'\\t' || ");
  return (
    "select count(*)::bigint as count, " +
    "md5(coalesce(string_agg(line, E'\\n' order by line), '')) as md5 " +
    `from (select ${line} as line from ${quoteIdent(table)}) as rows`
  );
}

/**
 * @param {Array<{ column_name: string, data_type: string }>} rows
 * @param {string[] | null} onlyNames saved column list, or null for every column
 * @returns {{ columns: Array<{ name: string, bytea: boolean }>, missing: string | null }}
 */
export function columnsFromMeta(rows, onlyNames) {
  const meta = rows.map((row) => ({
    name: row.column_name,
    bytea: row.data_type === "bytea",
  }));
  if (!onlyNames) return { columns: meta, missing: null };
  const byName = new Map(meta.map((column) => [column.name, column]));
  /** @type {Array<{ name: string, bytea: boolean }>} */
  const columns = [];
  for (const name of onlyNames) {
    const column = byName.get(name);
    if (!column) return { columns: [], missing: name };
    columns.push(column);
  }
  return { columns, missing: null };
}

/**
 * @param {Record<string, { columns: string[], count: number, md5: string }>} tables
 */
export function checksumDocument(tables) {
  /** @type {Record<string, { columns: string[], count: number, md5: string }>} */
  const ordered = {};
  for (const name of Object.keys(tables).sort()) {
    const row = tables[name];
    ordered[name] = {
      columns: [...row.columns],
      count: row.count,
      md5: row.md5,
    };
  }
  return { tables: ordered };
}

/**
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 * @param {string[]} tables
 * @param {Record<string, string[]> | null} columnLists
 */
export async function checksumTables(query, tables, columnLists) {
  /** @type {Record<string, { columns: string[], count: number, md5: string }>} */
  const tablesOut = {};
  /** @type {Array<Record<string, unknown>>} */
  const changes = [];
  for (const name of tables) {
    const meta = await query(COLUMNS_SQL, [name]);
    const wanted = columnLists ? columnLists[name] : null;
    const { columns, missing } = columnsFromMeta(meta.rows, wanted);
    if (missing) {
      changes.push({ table: name, missingColumn: missing });
      continue;
    }
    if (!columns.length) {
      changes.push({ table: name, missing: "database" });
      continue;
    }
    const result = await query(checksumSql(name, columns));
    const row = result.rows[0];
    tablesOut[name] = {
      columns: columns.map((column) => column.name),
      count: Number(row.count),
      md5: String(row.md5),
    };
  }
  return { document: checksumDocument(tablesOut), changes };
}

/**
 * @param {{ tables?: Record<string, { count: number, md5: string }> }} before
 * @param {{ tables?: Record<string, { count: number, md5: string }> }} after
 */
export function compareChecksums(before, after) {
  const names = [
    ...new Set([...Object.keys(before.tables ?? {}), ...Object.keys(after.tables ?? {})]),
  ].sort();
  /** @type {Array<Record<string, unknown>>} */
  const changes = [];
  for (const name of names) {
    const left = before.tables?.[name];
    const right = after.tables?.[name];
    if (!left) {
      changes.push({ table: name, missing: "before" });
      continue;
    }
    if (!right) {
      changes.push({ table: name, missing: "after" });
      continue;
    }
    if (left.count !== right.count || left.md5 !== right.md5) {
      changes.push({
        table: name,
        before: { count: left.count, md5: left.md5 },
        after: { count: right.count, md5: right.md5 },
      });
    }
  }
  return changes;
}

/**
 * @param {{ tables: Record<string, { count: number, md5: string }> }} before
 * @param {{ document: { tables: Record<string, { count: number, md5: string }> }, changes: Array<Record<string, unknown>> }} collected
 */
export function changesForCompare(before, collected) {
  /** @type {{ tables: Record<string, { count: number, md5: string }> }} */
  const comparable = { tables: {} };
  for (const name of Object.keys(collected.document.tables)) {
    if (before.tables[name]) comparable.tables[name] = before.tables[name];
  }
  return [...collected.changes, ...compareChecksums(comparable, collected.document)].sort((a, b) =>
    String(a.table).localeCompare(String(b.table)),
  );
}

/**
 * @param {Array<Record<string, unknown>>} changes
 * @returns {string}
 */
export function formatChecksumChanges(changes) {
  if (changes.length === 0) return "unchanged";
  return changes
    .map((change) => {
      if (change.missingColumn) return `${change.table}: missing column ${change.missingColumn}`;
      if (change.missing) return `${change.table}: missing from ${change.missing}`;
      const before = /** @type {{ count: number, md5: string }} */ (change.before);
      const after = /** @type {{ count: number, md5: string }} */ (change.after);
      const parts = [];
      if (before.count !== after.count) parts.push(`count ${before.count} -> ${after.count}`);
      if (before.md5 !== after.md5) parts.push(`md5 ${before.md5} -> ${after.md5}`);
      return `${change.table}: ${parts.join(", ")}`;
    })
    .join("\n");
}

/**
 * One read-only transaction around every read. Rollback runs after success
 * and after an error. A failed begin is not rolled back.
 * @param {{ query: Function, end?: Function }} client
 * @param {(query: Function) => Promise<unknown>} fn
 */
export async function runReadOnly(client, fn) {
  await client.query(BEGIN_READ_ONLY_SQL);
  try {
    await client.query(SET_LOCAL_UTC_SQL);
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    await client.query(ROLLBACK_SQL);
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
export function redactConnection(text) {
  return String(text ?? "").replace(/\b(?:postgres|postgresql):\/\/\S+/gi, "[redacted]");
}

function readChecksum(path) {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  if (!doc || typeof doc !== "object" || !doc.tables || typeof doc.tables !== "object") {
    throw new Error("content-checksum: file is not a checksum document");
  }
  return doc;
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 * @param {() => Promise<{ query: Function, end: Function }>} connect
 */
export async function main(argv, env, connect) {
  const compareAt = argv.indexOf("--compare");
  const comparePath = compareAt === -1 ? null : argv[compareAt + 1];
  const outPath = compareAt === -1 ? argv[0] : null;
  if (compareAt !== -1 && !comparePath) {
    throw new Error("usage: node scripts/content-checksum.mjs --compare <before.json>");
  }
  if (compareAt === -1 && !outPath) {
    throw new Error("usage: node scripts/content-checksum.mjs <out.json>");
  }
  if (!env.DATABASE_URL) throw new Error("content-checksum: DATABASE_URL is not set");
  const client = await connect();
  try {
    if (comparePath) {
      const before = readChecksum(comparePath);
      const names = Object.keys(before.tables).sort();
      /** @type {Record<string, string[]>} */
      const columnLists = {};
      for (const name of names) columnLists[name] = before.tables[name].columns;
      const collected = await runReadOnly(client, (query) =>
        checksumTables(query, names, columnLists),
      );
      const text = formatChecksumChanges(changesForCompare(before, collected));
      console.log(text);
      return text === "unchanged" ? 0 : 1;
    }
    const collected = await runReadOnly(client, (query) =>
      checksumTables(query, CONTENT_TABLES, null),
    );
    if (collected.changes.length) {
      console.error(formatChecksumChanges(collected.changes));
      return 1;
    }
    writeFileSync(outPath, `${JSON.stringify(collected.document, null, 2)}\n`);
    console.log(`[content-checksum] wrote ${outPath}`);
    return 0;
  } finally {
    await client.end?.();
  }
}

if (isMainModule(import.meta.url)) {
  const connect = async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return client;
  };
  try {
    const code = await main(process.argv.slice(2), process.env, connect);
    process.exit(code);
  } catch (err) {
    console.error(redactConnection(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
