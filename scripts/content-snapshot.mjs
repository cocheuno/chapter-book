#!/usr/bin/env node
/**
 * Save the public pages of a Chapter Book server.
 *
 * Usage: node scripts/content-snapshot.mjs <base-url> [out-dir]
 * Default out-dir is artifacts/content (git-ignored). Writes snapshot.json
 * and a full-page PNG beside it. Bypass headers go only to the snapshotted
 * site. The secret is not printed or saved.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { isMainModule } from "./with-app-env.mjs";

const NAV_TIMEOUT_MS = 60_000;

/**
 * @param {string | undefined} secret
 * @returns {Record<string, string>}
 */
export function bypassHeaders(secret) {
  if (!secret) return {};
  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };
}

/**
 * Headers for one request, or null to leave the request unchanged.
 * The secret is added only when the request origin is the snapshotted origin.
 * fonts.googleapis.com, fonts.gstatic.com, and any other origin stay as they were.
 * @param {string} requestUrl
 * @param {string} base
 * @param {Record<string, string>} requestHeaders
 * @param {string | undefined} secret
 * @returns {Record<string, string> | null}
 */
export function headersForSnapshotRequest(requestUrl, base, requestHeaders, secret) {
  if (!secret) return null;
  let requestOrigin;
  let baseOrigin;
  try {
    requestOrigin = new URL(requestUrl).origin;
    baseOrigin = new URL(base).origin;
  } catch {
    return null;
  }
  if (requestOrigin !== baseOrigin) return null;
  return { ...requestHeaders, ...bypassHeaders(secret) };
}

/**
 * @param {string} text
 * @param {string | undefined} secret
 * @returns {string}
 */
export function redact(text, secret) {
  let out = String(text ?? "");
  if (secret) out = out.split(secret).join("[redacted]");
  return out.replace(/\b(?:postgres|postgresql):\/\/\S+/gi, "[redacted]");
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ headless: boolean, args: string[], executablePath?: string }}
 */
export function launchOptions(env) {
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
  if (env.CHROMIUM_PATH) options.executablePath = env.CHROMIUM_PATH;
  return options;
}

/**
 * @param {string} input
 * @returns {string}
 */
export function checkedBaseUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("content-snapshot: base URL must be http or https");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("content-snapshot: base URL must be http or https");
  }
  if (url.username || url.password) {
    throw new Error("content-snapshot: base URL must not include a username or password");
  }
  return input.replace(/\/$/, "");
}

/**
 * @param {string} pagePath
 * @returns {string}
 */
export function screenshotFile(pagePath) {
  const stem = pagePath.replace(/^\/+/, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "root";
  return `${stem}.png`;
}

/**
 * @param {unknown} data
 * @returns {string[]}
 */
export function pagePathsFromFeed(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const paths = new Set();
  for (const item of items) {
    const slug = typeof item?.slug === "string" ? item.slug.trim() : "";
    if (!slug || slug.includes("/") || slug.includes("\\")) continue;
    paths.add(`/p/${slug}`);
  }
  return [...paths].sort();
}

/**
 * @param {string} href
 * @param {string} pageUrl
 * @returns {string}
 */
function pathnameOf(href, pageUrl) {
  if (!href || /^(?:#|mailto:|javascript:)/i.test(href)) return "";
  try {
    return new URL(href, pageUrl).pathname.replace(/\/$/, "") || "/";
  } catch {
    return "";
  }
}

/**
 * Speaker links rendered on /p/<slug>. The feed does not list them.
 * @param {string} pagePath
 * @param {string[]} hrefs
 * @param {string} [pageUrl]
 * @returns {string[]}
 */
export function speakerPaths(pagePath, hrefs, pageUrl = "http://snapshot.local") {
  const prefix = `${pagePath}/speakers/`;
  const found = new Set();
  for (const href of hrefs) {
    const path = pathnameOf(href, pageUrl);
    if (!path.startsWith(prefix)) continue;
    if (!path.slice(prefix.length)) continue;
    found.add(path);
  }
  return [...found].sort();
}

/**
 * @param {string} base
 * @param {string} pagePath
 * @returns {string}
 */
export function pageUrl(base, pagePath) {
  return `${base.replace(/\/$/, "")}${pagePath}`;
}

/**
 * @param {{ publicSiteRaw: string, pages: Array<Record<string, unknown>> }} input
 */
export function snapshotDocument(input) {
  let publicSite = null;
  try {
    publicSite = JSON.parse(input.publicSiteRaw);
  } catch {
    publicSite = null;
  }
  const pages = [...input.pages].sort((a, b) => String(a.path).localeCompare(String(b.path)));
  return { publicSiteRaw: input.publicSiteRaw, publicSite, pages };
}

/**
 * @param {import("playwright").Page} page
 * @param {string} url
 */
async function capturePage(page, url) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
  const status = response?.status() ?? 0;
  const raw = response ? await response.text() : "";
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  const text = await page.locator("body").innerText();
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") || ""));
  const image = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  return { status, raw, text, hrefs, image, finalUrl: page.url() };
}

/**
 * @param {import("playwright").Browser} browser
 * @param {string} base
 * @param {string} outDir
 * @param {NodeJS.ProcessEnv} env
 */
export async function writeSnapshot(browser, base, outDir, env) {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const headers = headersForSnapshotRequest(request.url(), base, request.headers(), secret);
    if (!headers) {
      await route.continue();
      return;
    }
    await route.continue({ headers });
  });
  const page = await context.newPage();
  mkdirSync(outDir, { recursive: true });
  /** @type {Array<Record<string, unknown>>} */
  const pages = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {string} pagePath
   * @param {boolean} keepRaw
   */
  async function save(pagePath, keepRaw) {
    if (seen.has(pagePath)) return null;
    seen.add(pagePath);
    const captured = await capturePage(page, pageUrl(base, pagePath));
    const file = screenshotFile(pagePath);
    writeFileSync(join(outDir, file), captured.image);
    pages.push({
      path: pagePath,
      status: captured.status,
      text: captured.text,
      screenshot: file,
      screenshotSha256: createHash("sha256").update(captured.image).digest("hex"),
    });
    console.log(`[content-snapshot] ${pagePath} ${captured.status}`);
    return keepRaw ? captured : { ...captured, raw: "" };
  }

  const api = await save("/api/public-site", true);
  const publicSiteRaw = api?.raw ?? "";
  let feed = null;
  try {
    feed = JSON.parse(publicSiteRaw);
  } catch {
    feed = null;
  }
  await save("/site", false);
  /** @type {Set<string>} */
  const speakers = new Set();
  for (const pagePath of pagePathsFromFeed(feed)) {
    const captured = await save(pagePath, false);
    if (!captured) continue;
    for (const speaker of speakerPaths(pagePath, captured.hrefs, captured.finalUrl)) {
      speakers.add(speaker);
    }
  }
  for (const speaker of [...speakers].sort()) await save(speaker, false);
  await context.close();

  const document = snapshotDocument({ publicSiteRaw, pages });
  writeFileSync(join(outDir, "snapshot.json"), `${JSON.stringify(document, null, 2)}\n`);
  return { document, feedOk: feed !== null };
}

if (isMainModule(import.meta.url)) {
  const [baseArg, outArg] = process.argv.slice(2);
  if (!baseArg) {
    console.error(
      "usage: node scripts/content-snapshot.mjs <base-url> [out-dir]\n" +
        "default out-dir: artifacts/content",
    );
    process.exit(2);
  }
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  let base;
  try {
    base = checkedBaseUrl(baseArg);
  } catch (err) {
    console.error(redact(err instanceof Error ? err.message : String(err), secret));
    process.exit(2);
  }
  const outDir = outArg || "artifacts/content";
  let browser;
  try {
    browser = await chromium.launch(launchOptions(process.env));
    const { feedOk } = await writeSnapshot(browser, base, outDir, process.env);
    console.log(`[content-snapshot] wrote ${join(outDir, "snapshot.json")}`);
    if (!feedOk) {
      console.error("content-snapshot: /api/public-site did not return JSON");
      process.exit(1);
    }
  } catch (err) {
    console.error(redact(err instanceof Error ? err.stack || err.message : String(err), secret));
    process.exit(1);
  } finally {
    await browser?.close();
  }
}
