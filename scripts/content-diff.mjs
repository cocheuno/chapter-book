#!/usr/bin/env node
/**
 * Compare two content snapshots. Exit 0 and print "no differences" when the
 * visible text, status, feed, and screenshot hashes match.
 *
 * Given a second round (before-2, after-2), a screenshot must differ in both
 * rounds to count; one that differs in only one round is printed as a note.
 *
 * Anything left out of that comparison is named in IGNORED_FIELDS. The list is
 * empty unless a value is not content (a timestamp, for example).
 */
import { readFileSync } from "node:fs";
import { isMainModule } from "./with-app-env.mjs";

/** @type {string[]} */
export const IGNORED_FIELDS = [];

/**
 * @param {string} before
 * @param {string} after
 * @returns {string[]}
 */
export function changedLines(before, after) {
  const a = String(before ?? "").split("\n");
  const b = String(after ?? "").split("\n");
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`- ${a[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  while (i < n) lines.push(`- ${a[i++]}`);
  while (j < m) lines.push(`+ ${b[j++]}`);
  return lines;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function stableJson(value) {
  return JSON.stringify(value, null, 2) ?? "null";
}

/**
 * @param {Record<string, unknown>} page
 * @returns {Record<string, unknown>}
 */
function pageView(page) {
  const view = { ...page };
  for (const field of IGNORED_FIELDS) delete view[field];
  return view;
}

/**
 * @param {Record<string, unknown>} doc
 * @returns {string}
 */
function feedText(doc) {
  if (typeof doc?.publicSiteRaw === "string") return doc.publicSiteRaw;
  if (doc && "publicSite" in doc) return stableJson(doc.publicSite);
  return "";
}

/**
 * @param {Record<string, unknown> | undefined} before
 * @param {Record<string, unknown> | undefined} after
 * @returns {string[]}
 */
function pageLines(before, after) {
  if (!before) return ["only in after"];
  if (!after) return ["only in before"];
  const left = pageView(before);
  const right = pageView(after);
  const lines = [];
  if (left.status !== right.status) lines.push(`status: ${left.status} -> ${right.status}`);
  if ((left.finalPath ?? "") !== (right.finalPath ?? "")) {
    lines.push(`ends at: ${left.finalPath || "(not recorded)"} -> ${right.finalPath || "(not recorded)"}`);
  }
  if (left.text !== right.text) lines.push(...changedLines(String(left.text ?? ""), String(right.text ?? "")));
  if (left.screenshotSha256 !== right.screenshotSha256) lines.push(SCREENSHOT_DIFFERS);
  return lines;
}

/**
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @returns {{ pages: Array<{ path: string, lines: string[] }>, ignored: string[] }}
 */
export function diffSnapshots(before, after) {
  /** @type {Array<{ path: string, lines: string[] }>} */
  const pages = [];
  const beforeFeed = feedText(before);
  const afterFeed = feedText(after);
  if (beforeFeed !== afterFeed) {
    pages.push({ path: "/api/public-site", lines: changedLines(beforeFeed, afterFeed) });
  }
  const beforePages = new Map(
    (Array.isArray(before?.pages) ? before.pages : []).map((page) => [page.path, page]),
  );
  const afterPages = new Map(
    (Array.isArray(after?.pages) ? after.pages : []).map((page) => [page.path, page]),
  );
  const paths = [...new Set([...beforePages.keys(), ...afterPages.keys()])].sort();
  for (const path of paths) {
    const lines = pageLines(beforePages.get(path), afterPages.get(path));
    if (lines.length) pages.push({ path, lines });
  }
  return { pages, ignored: [...IGNORED_FIELDS] };
}

export const SCREENSHOT_DIFFERS = "screenshot differs";

/**
 * Combine two rounds of snapshots. Font smoothing varies a little from one page
 * load to the next, so a screenshot that differs in only one round is rendering
 * noise: it becomes a note. A screenshot that differs in both rounds, and every
 * other difference from either round, is reported.
 * @param {{ pages: Array<{ path: string, lines: string[] }>, ignored: string[] }} first
 * @param {{ pages: Array<{ path: string, lines: string[] }>, ignored: string[] }} second
 * @returns {{ pages: Array<{ path: string, lines: string[] }>, ignored: string[], notes: string[] }}
 */
export function confirmScreenshots(first, second) {
  const shots = (report) =>
    new Set(report.pages.filter((page) => page.lines.includes(SCREENSHOT_DIFFERS)).map((page) => page.path));
  const firstShots = shots(first);
  const secondShots = shots(second);
  /** @type {Map<string, string[]>} */
  const byPath = new Map();
  for (const report of [first, second]) {
    for (const page of report.pages) {
      const lines = byPath.get(page.path) ?? [];
      for (const line of page.lines) {
        if (line !== SCREENSHOT_DIFFERS && !lines.includes(line)) lines.push(line);
      }
      byPath.set(page.path, lines);
    }
  }
  /** @type {string[]} */
  const notes = [];
  for (const path of [...new Set([...firstShots, ...secondShots])].sort()) {
    if (firstShots.has(path) && secondShots.has(path)) {
      byPath.get(path)?.push(SCREENSHOT_DIFFERS);
    } else {
      notes.push(`${path}: screenshot differed in one round only (rendering noise; ignored)`);
    }
  }
  const pages = [...byPath]
    .filter(([, lines]) => lines.length > 0)
    .map(([path, lines]) => ({ path, lines }));
  return { pages, ignored: [...new Set([...first.ignored, ...second.ignored])], notes };
}

/**
 * @param {{ pages: Array<{ path: string, lines: string[] }>, ignored: string[], notes?: string[] }} report
 * @returns {string}
 */
export function formatDiff(report) {
  const ignored = report.ignored.length ? `\nignored: ${report.ignored.join(", ")}` : "";
  const notes = (report.notes ?? []).map((note) => `\nnote: ${note}`).join("");
  if (report.pages.length === 0) return `no differences${ignored}${notes}`;
  const body = report.pages.map((page) => [page.path, ...page.lines].join("\n")).join("\n\n");
  return `${body}${ignored}${notes}`;
}

/**
 * @param {string} text
 * @returns {number}
 */
export function diffExitCode(text) {
  return text.startsWith("no differences") ? 0 : 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 && args.length !== 4) {
    console.error(
      "usage: node scripts/content-diff.mjs <before.json> <after.json> [<before-2.json> <after-2.json>]",
    );
    process.exit(2);
  }
  const [beforePath, afterPath, beforePath2, afterPath2] = args;
  const first = diffSnapshots(readJson(beforePath), readJson(afterPath));
  const report = beforePath2
    ? confirmScreenshots(first, diffSnapshots(readJson(beforePath2), readJson(afterPath2)))
    : first;
  const text = formatDiff(report);
  console.log(text);
  process.exit(diffExitCode(text));
}
