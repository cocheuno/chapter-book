import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IGNORED_FIELDS,
  changedLines,
  diffExitCode,
  diffSnapshots,
  formatDiff,
} from "./content-diff.mjs";

const page = (text, status = 200, hash = "abc") => ({
  path: "/site",
  status,
  text,
  screenshot: "site.png",
  screenshotSha256: hash,
});

test("ignored fields are listed by name and start empty", () => {
  assert.deepEqual(IGNORED_FIELDS, []);
});

test("matching snapshots print no differences and exit 0", () => {
  const doc = {
    publicSiteRaw: '{"items":[]}\n',
    pages: [page("Gold Mass\nMadison")],
  };
  const text = formatDiff(diffSnapshots(doc, structuredClone(doc)));
  assert.equal(text, "no differences");
  assert.equal(diffExitCode(text), 0);
});

test("a changed line is printed for that page and exits 1", () => {
  const before = { publicSiteRaw: "{}", pages: [page("Gold Mass\nMadison")] };
  const after = { publicSiteRaw: "{}", pages: [page("Gold Mass\nMilwaukee")] };
  const text = formatDiff(diffSnapshots(before, after));
  assert.match(text, /^\/site\n- Madison\n\+ Milwaukee$/);
  assert.equal(diffExitCode(text), 1);
});

test("status, screenshot, feed, and a page that exists on only one side are reported", () => {
  const before = {
    publicSiteRaw: '{"title":"A"}\n',
    pages: [page("Same", 200, "one"), { path: "/p/old", status: 200, text: "old", screenshotSha256: "a" }],
  };
  const after = {
    publicSiteRaw: '{"title":"B"}\n',
    pages: [page("Same", 404, "two"), { path: "/p/new", status: 200, text: "new", screenshotSha256: "b" }],
  };
  const report = diffSnapshots(before, after);
  const byPath = Object.fromEntries(report.pages.map((entry) => [entry.path, entry.lines]));
  assert.deepEqual(byPath["/api/public-site"], changedLines('{"title":"A"}\n', '{"title":"B"}\n'));
  assert.ok(byPath["/site"].includes("status: 200 -> 404"));
  assert.ok(byPath["/site"].includes("screenshot differs"));
  assert.deepEqual(byPath["/p/old"], ["only in before"]);
  assert.deepEqual(byPath["/p/new"], ["only in after"]);
});

test("a page that ends somewhere else is reported; snapshots without final paths still match", () => {
  const before = { publicSiteRaw: "{}", pages: [{ ...page("Same"), path: "/p/old", finalPath: "/p/new" }] };
  const after = { publicSiteRaw: "{}", pages: [{ ...page("Same"), path: "/p/old", finalPath: "/p/old" }] };
  const text = formatDiff(diffSnapshots(before, after));
  assert.match(text, /ends at: \/p\/new -> \/p\/old/);
  assert.equal(diffExitCode(text), 1);

  const older = { publicSiteRaw: "{}", pages: [page("Same")] };
  assert.equal(formatDiff(diffSnapshots(older, structuredClone(older))), "no differences");
});
