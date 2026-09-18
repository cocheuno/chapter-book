#!/usr/bin/env node
/**
 * Product tests for the public tree. Template/builder tests that need
 * gitignored `.grok/` internals are not part of Chapter Book's suite.
 */
import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const SCRIPT_TESTS = [
  "scripts/browser-smoke-verdict.test.mjs",
  "scripts/privacy-check.test.mjs",
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name.endsWith(".test.ts")) acc.push(full);
  }
  return acc;
}

const files = [...SCRIPT_TESTS.map((f) => join(root, f)), ...walk(join(root, "src"))];
const r = spawnSync(process.execPath, ["--test", "--experimental-strip-types", ...files], {
  cwd: root,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
