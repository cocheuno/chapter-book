import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grokChromeEnabled } from "./grok-chrome.ts";

const hosted = "https://example.com";

describe("grokChromeEnabled", () => {
  const cases: Array<
    [string, string | undefined, string | undefined, string | undefined, boolean]
  > = [
    ["blank url, no VERCEL_ENV, unset", undefined, "", undefined, true],
    ["blank url, no VERCEL_ENV, off", "off", "", undefined, false],
    ["blank url, VERCEL_ENV preview, unset", undefined, "", "preview", false],
    ["blank url, VERCEL_ENV production, yes", "yes", "", "production", false],
    ["blank url, VERCEL_ENV preview, on", "on", "", "preview", true],
    ["set url, unset", undefined, hosted, undefined, false],
    ["set url, off", "off", hosted, undefined, false],
    ["set url, on", "on", hosted, undefined, true],
    ["set url, ON with spaces", " ON ", hosted, undefined, true],
  ];

  for (const [label, value, url, vercelEnv, expected] of cases) {
    it(label, () => {
      assert.equal(grokChromeEnabled(value, url, vercelEnv), expected);
    });
  }
});

describe("grok pwa middleware", () => {
  it("gates manifest, install, and head injection on the hosted check", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../server/middleware/grok-pwa.ts"),
      "utf8",
    );
    assert.ok(
      source.includes(
        "grokChromeEnabled(process.env.GROK_CHROME, process.env.BETTER_AUTH_URL, process.env.VERCEL_ENV)",
      ),
    );
    assert.equal(source.split("if (!chromeOn) return next();").length - 1, 2);
  });
});
