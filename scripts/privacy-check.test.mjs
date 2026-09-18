import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("privacy-check passes on this tree", () => {
  const r = spawnSync(process.execPath, [join(root, "scripts/privacy-check.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /no personal records or host secrets/);
});
