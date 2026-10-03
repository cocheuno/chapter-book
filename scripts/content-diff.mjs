#!/usr/bin/env node
/**
 * Compare two content snapshots. Exit 0 and print "no differences" when the
 * visible text, status, feed, and screenshot hashes match.
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
  if (left.text !== right.text) lines.push(...changedLines(String(left.text ?? ""), String(right.text ?? "")));
  if (left.screenshotSha256 !== right.screenshotSha256) lines.push("screenshot differs");
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

/**
 * @param {{ pages: Array<{ path: string, lines: string[] }>, ignored: string[] }} report
 * @returns {string}
 */
export function formatDiff(report) {
  const ignored = report.ignored.length ? `\nignored: ${report.ignored.join(", ")}` : "";
  if (report.pages.length === 0) return `no differences${ignored}`;
  const body = report.pages.map((page) => [page.path, ...page.lines].join("\n")).join("\n\n");
  return `${body}${ignored}`;
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
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    console.error("usage: node scripts/content-diff.mjs <before.json> <after.json>");
    process.exit(2);
  }
  const text = formatDiff(diffSnapshots(readJson(beforePath), readJson(afterPath)));
  console.log(text);
  process.exit(diffExitCode(text));
}
