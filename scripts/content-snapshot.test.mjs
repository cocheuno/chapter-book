import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bypassHeaders,
  checkedBaseUrl,
  headersForSnapshotRequest,
  launchOptions,
  pagePathsFromFeed,
  pageUrl,
  redact,
  screenshotFile,
  speakerPaths,
} from "./content-snapshot.mjs";

test("bypass headers are sent only when the secret is set", () => {
  assert.deepEqual(bypassHeaders(undefined), {});
  assert.deepEqual(bypassHeaders(""), {});
  assert.deepEqual(bypassHeaders("example-bypass"), {
    "x-vercel-protection-bypass": "example-bypass",
    "x-vercel-set-bypass-cookie": "true",
  });
});

test("bypass headers go only to the snapshotted origin", () => {
  const base = "https://chapter-book-beryl.vercel.app";
  const own = { accept: "text/html", "user-agent": "snapshot" };
  const secret = "example-bypass";
  assert.deepEqual(headersForSnapshotRequest(`${base}/p/ai`, base, own, secret), {
    accept: "text/html",
    "user-agent": "snapshot",
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  });
  for (const url of [
    "https://fonts.googleapis.com/css2?family=Source+Sans+3",
    "https://fonts.gstatic.com/s/sourcesans3.woff2",
    "https://chapter-book-beryl.vercel.app.evil.example/p/ai",
  ]) {
    assert.equal(headersForSnapshotRequest(url, base, own, secret), null);
  }
  assert.equal(headersForSnapshotRequest(`${base}/site`, base, own, ""), null);
  assert.equal(headersForSnapshotRequest(`${base}/site`, base, own, undefined), null);
});

test("errors do not keep the bypass secret", () => {
  const secret = "example-bypass";
  assert.equal(
    redact(`request failed header ${secret}`, secret),
    "request failed header [redacted]",
  );
});

test("CHROMIUM_PATH is the browser executable when it is set", () => {
  assert.equal(launchOptions({}).executablePath, undefined);
  assert.equal(
    launchOptions({ CHROMIUM_PATH: "C:\\Chrome\\chrome.exe" }).executablePath,
    "C:\\Chrome\\chrome.exe",
  );
});

test("the base URL is http(s) without a password", () => {
  assert.equal(checkedBaseUrl("http://127.0.0.1:8080/"), "http://127.0.0.1:8080");
  assert.throws(() => checkedBaseUrl("file:///tmp/site"), /http or https/);
  assert.throws(() => checkedBaseUrl("http://user:secret@127.0.0.1"), /username or password/);
});

test("feed slugs become /p paths, and speaker links are taken from the rendered page", () => {
  assert.deepEqual(
    pagePathsFromFeed({
      items: [
        { slug: "gold-mass" },
        { slug: "gold-mass" },
        { slug: "" },
        { slug: "ai/nope" },
        { title: "no slug" },
      ],
    }),
    ["/p/gold-mass"],
  );
  const page = "/p/ai-conference";
  assert.deepEqual(
    speakerPaths(
      page,
      [
        "/p/ai-conference/speakers/jane",
        "https://preview.example/p/ai-conference/speakers/john",
        "/p/other/speakers/nope",
        "/p/ai-conference/speakers/",
        "/site",
      ],
      pageUrl("http://127.0.0.1:8080", page),
    ),
    ["/p/ai-conference/speakers/jane", "/p/ai-conference/speakers/john"],
  );
});

test("screenshot names stay next to the snapshot and keep the page path", () => {
  assert.equal(screenshotFile("/site"), "site.png");
  assert.equal(screenshotFile("/api/public-site"), "api_public-site.png");
  assert.equal(
    screenshotFile("/p/ai-conference/speakers/jane"),
    "p_ai-conference_speakers_jane.png",
  );
});
