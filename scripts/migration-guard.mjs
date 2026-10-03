#!/usr/bin/env node
/**
 * Fail new migrations that would change existing data (Rule 1).
 *
 * Only files in migrations/ numbered 0019 and up are checked. migrations/auth/
 * is not checked for forbidden statements. Tables created there, and in every
 * migration numbered below the file being checked, already exist: a later
 * create table if not exists does not make them new. Comments and '...'
 * string literals are blanked before matching, and line numbers stay on the
 * original text.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./with-app-env.mjs";

const FORBIDDEN_WORD = /\b(update|delete|truncate|drop|rename)\b/gi;
const ON_DELETE = /\bon\s+delete\s+(?:cascade|set\s+null|restrict|no\s+action)\b/gi;
const ON_UPDATE = /\bon\s+update\s+(?:cascade|set\s+null|set\s+default|restrict|no\s+action)\b/gi;
const CREATE_INDEX =
  /\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?("[^"]+"|[A-Za-z_][\w$]*)/gi;
const DROP_INDEX = /\bdrop\s+index\s+(?:if\s+exists\s+)?("[^"]+"|[A-Za-z_][\w$]*)/gi;
const ON_CONFLICT_UPDATE = /\bon\s+conflict\b[^;]*?\bdo\s+update\b/gi;
const ALTER_TYPE = /\balter\s+column\s+(?:"[^"]+"|[A-Za-z_][\w$]*)\s+(?:set\s+data\s+)?type\b/gi;
const CREATE_TABLE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:"public"|public)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)/gi;
const INSERT_INTO = /\binsert\s+into\s+(?:(?:"public"|public)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)/gi;
const COPY_FROM =
  /\bcopy\s+(?:(?:"public"|public)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)[^;]*?\bfrom\b/gi;
const MERGE_INTO = /\bmerge\s+into\s+(?:(?:"public"|public)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)/gi;
const ALTER_DEFAULT = /\balter\s+column\s+(?:"[^"]+"|[A-Za-z_][\w$]*)\s+set\s+default\b/gi;

const FIRST_GUARDED = 19;

/**
 * @param {string} name
 * @returns {number | null}
 */
export function migrationNumber(name) {
  const match = /^(\d+)_.*\.sql$/i.exec(name);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isGuardedMigration(name) {
  const number = migrationNumber(name);
  return number !== null && number >= FIRST_GUARDED;
}

/**
 * Blank `--` comments, block comments, and `'...'` literals. Newlines stay,
 * so a later index is still the original line.
 * @param {string} sql
 * @returns {string}
 */
export function maskSql(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      out += "  ";
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        out += sql[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < sql.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (sql[i] === "'") {
      out += " ";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += "  ";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          out += " ";
          i += 1;
          break;
        }
        out += sql[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function indexKey(raw) {
  if (raw.startsWith('"') && raw.endsWith('"')) return `quoted:${raw.slice(1, -1)}`;
  return `plain:${raw.toLowerCase()}`;
}

/**
 * Table names match ignoring case and double quotes. The public. prefix is
 * stripped by the statement patterns before this runs.
 * @param {string} raw
 * @returns {string}
 */
function tableKey(raw) {
  const name = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  return name.toLowerCase();
}

/**
 * @param {string} masked
 * @returns {Set<string>}
 */
function createdTableKeys(masked) {
  const created = new Set();
  for (const match of masked.matchAll(CREATE_TABLE)) created.add(tableKey(match[1]));
  return created;
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
export function lineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {boolean}
 */
function onUpdateInForeignKey(text, index) {
  const semicolon = text.lastIndexOf(";", index - 1);
  const start = semicolon === -1 ? 0 : semicolon + 1;
  const before = text.slice(start, index);
  return /\breferences\b/i.test(before) || /\bforeign\s+key\b/i.test(before);
}

/**
 * @param {string} masked
 * @returns {Array<[number, number]>}
 */
function allowedSpans(masked) {
  /** @type {Array<[number, number]>} */
  const spans = [];
  for (const match of masked.matchAll(ON_DELETE)) {
    spans.push([match.index, match.index + match[0].length]);
  }
  for (const match of masked.matchAll(ON_UPDATE)) {
    if (onUpdateInForeignKey(masked, match.index)) {
      spans.push([match.index, match.index + match[0].length]);
    }
  }
  const created = new Set();
  for (const match of masked.matchAll(CREATE_INDEX)) created.add(indexKey(match[1]));
  for (const match of masked.matchAll(DROP_INDEX)) {
    if (created.has(indexKey(match[1]))) {
      spans.push([match.index, match.index + match[0].length]);
    }
  }
  return spans;
}

/**
 * @param {Array<[number, number]>} spans
 * @param {number} index
 * @returns {boolean}
 */
function covered(spans, index) {
  return spans.some(([start, end]) => index >= start && index < end);
}

/**
 * @param {string} file
 * @param {string} sql
 * @param {Iterable<string>} [earlierTables] Table names already created. Omitted means none.
 * @returns {Array<{ file: string, line: number, form: string }>}
 */
export function findForbiddenSql(file, sql, earlierTables) {
  const masked = maskSql(sql);
  const earlier = new Set();
  if (earlierTables) {
    for (const name of earlierTables) earlier.add(tableKey(name));
  }
  const spans = allowedSpans(masked);
  /** @type {Array<{ file: string, line: number, form: string, index: number }>} */
  const found = [];

  for (const match of masked.matchAll(ON_CONFLICT_UPDATE)) {
    const at = match.index + match[0].length - "update".length;
    spans.push([match.index, match.index + match[0].length]);
    found.push({
      file,
      line: lineNumber(sql, at),
      form: "on conflict do update",
      index: at,
    });
  }
  for (const match of masked.matchAll(ALTER_TYPE)) {
    found.push({
      file,
      line: lineNumber(sql, match.index),
      form: "alter column ... type",
      index: match.index,
    });
  }
  for (const match of masked.matchAll(ALTER_DEFAULT)) {
    found.push({
      file,
      line: lineNumber(sql, match.index),
      form: "alter column ... set default",
      index: match.index,
    });
  }
  const created = new Set();
  for (const name of createdTableKeys(masked)) {
    if (!earlier.has(name)) created.add(name);
  }
  const writes = [
    [INSERT_INTO, "insert into"],
    [COPY_FROM, "copy ... from"],
    [MERGE_INTO, "merge into"],
  ];
  for (const [pattern, form] of writes) {
    for (const match of masked.matchAll(pattern)) {
      if (created.has(tableKey(match[1]))) continue;
      found.push({
        file,
        line: lineNumber(sql, match.index),
        form,
        index: match.index,
      });
    }
  }
  for (const match of masked.matchAll(FORBIDDEN_WORD)) {
    if (covered(spans, match.index)) continue;
    found.push({
      file,
      line: lineNumber(sql, match.index),
      form: match[1].toLowerCase(),
      index: match.index,
    });
  }

  found.sort((a, b) => a.line - b.line || a.index - b.index || a.form.localeCompare(b.form));
  return found.map(({ file: name, line, form }) => ({ file: name, line, form }));
}

/**
 * @param {{ file: string, line: number, form: string }} violation
 * @returns {string}
 */
export function formatViolation(violation) {
  return `${violation.file}:${violation.line}: ${violation.form}`;
}

/**
 * Tables created in one SQL file, after comments and string literals are blanked.
 * @param {string} sql
 * @returns {Set<string>}
 */
function tablesCreatedBy(sql) {
  return createdTableKeys(maskSql(sql));
}

/**
 * Top-level files numbered 0019 and up are checked. Every numbered file below
 * the one being checked, and every file in auth/, supplies tables that already
 * exist. A create table in the checked file is new only when that name is absent.
 * @param {string} dir
 * @returns {Array<{ file: string, line: number, form: string }>}
 */
export function guardMigrationDir(dir) {
  const top = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && migrationNumber(entry.name) !== null)
    .map((entry) => entry.name)
    .sort((a, b) => migrationNumber(a) - migrationNumber(b) || a.localeCompare(b));
  /** @type {Map<string, Set<string>>} */
  const createdByFile = new Map();
  for (const name of top) {
    createdByFile.set(name, tablesCreatedBy(readFileSync(join(dir, name), "utf8")));
  }

  const authTables = new Set();
  const authDir = join(dir, "auth");
  if (existsSync(authDir)) {
    for (const entry of readdirSync(authDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      for (const table of tablesCreatedBy(readFileSync(join(authDir, entry.name), "utf8"))) {
        authTables.add(table);
      }
    }
  }

  /** @type {Array<{ file: string, line: number, form: string }>} */
  const violations = [];
  for (const name of top) {
    if (!isGuardedMigration(name)) continue;
    const number = migrationNumber(name);
    const earlier = new Set(authTables);
    for (const other of top) {
      if (migrationNumber(other) >= number) continue;
      for (const table of createdByFile.get(other)) earlier.add(table);
    }
    violations.push(...findForbiddenSql(name, readFileSync(join(dir, name), "utf8"), earlier));
  }
  return violations;
}

function repoMigrationsDir() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

if (isMainModule(import.meta.url)) {
  const violations = guardMigrationDir(repoMigrationsDir());
  if (violations.length) {
    for (const violation of violations) console.error(formatViolation(violation));
    process.exit(1);
  }
  console.log("migration-guard: no forbidden statements in migrations numbered 0019 and up");
}
