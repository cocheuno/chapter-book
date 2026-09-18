#!/usr/bin/env node
/**
 * Fail if the public tree looks like it grew real people or host secrets.
 * See docs/PRIVACY.md. Does not read a .env file; it only looks at tracked
 * (or, without git, on-disk) source.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const SKIP_DIR = new Set([
  ".git",
  "node_modules",
  "dist",
  ".vercel",
  ".output",
  ".nitro",
  ".tanstack",
  "screenshots",
  "artifacts",
  ".grok",
]);

const SKIP_FILE = new Set(["package-lock.json"]);

const SECRET_FILES = [".env", ".env.local", "dump.sql", "nametags.csv"];

const PERSONAL_EMAIL =
  /[a-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|icloud|me|aol|proton|live)\.[a-z.]+/i;
const LIVE_URL =
  /\b(?:DATABASE_URL|BETTER_AUTH_SECRET)\s*=\s*["']?(?!$)(?!#)\S+/;
const CONN =
  /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s:]+:[^\s@]+@/i;
const KEYISH = /\b(?:sk-live-|sk-ant-|AKIA)[A-Za-z0-9/_+=-]+/;

function gitTracked() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
    return out.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name.startsWith(".env")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (!SKIP_FILE.has(name)) acc.push(relative(root, full).split(sep).join("/"));
  }
  return acc;
}

const tracked = gitTracked();
const files = tracked ?? walk(root);
const problems = [];

for (const name of SECRET_FILES) {
  if (tracked ? tracked.includes(name) : existsSync(join(root, name))) {
    problems.push(`${name}: must not be in the public tree`);
  }
}

for (const rel of files) {
  if (!/\.(ts|tsx|js|mjs|sql|md|json|css|html|example)$/i.test(rel)) continue;
  if (rel === "scripts/privacy-check.mjs" || rel.endsWith("privacy-check.test.mjs")) continue;
  let text;
  try {
    text = readFileSync(join(root, rel), "utf8");
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const n = i + 1;
    if (line.trimStart().startsWith("#") && !rel.endsWith(".md")) return;
    if (PERSONAL_EMAIL.test(line)) problems.push(`${rel}:${n}: personal email`);
    if (CONN.test(line)) problems.push(`${rel}:${n}: connection string`);
    if (KEYISH.test(line)) problems.push(`${rel}:${n}: looks like a live key`);
    if (LIVE_URL.test(line) && !line.includes("process.env") && !line.trimStart().startsWith("#")) {
      problems.push(`${rel}:${n}: assigned host secret`);
    }
  });
}

if (problems.length) {
  console.error("Privacy check failed (docs/PRIVACY.md):\n" + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}

console.log(`privacy-check: ${files.length} files, no personal records or host secrets`);
