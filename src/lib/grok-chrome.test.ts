import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grokChromeEnabled } from "./grok-chrome.ts";

const hosted = "https://example.com";

describe("grokChromeEnabled", () => {
  const cases: Array<[string, string | undefined, string | undefined, boolean]> = [
    ["blank url, unset", undefined, undefined, true],
    ["blank url, off", "off", "", true],
    ["blank url, on", "on", "", true],
    ["blank url, ON ", "ON ", "  ", true],
    ["blank url, yes", "yes", undefined, true],
    ["set url, unset", undefined, hosted, false],
    ["set url, off", "off", hosted, false],
    ["set url, on", "on", hosted, true],
    ["set url, ON ", "ON ", hosted, true],
    ["set url, yes", "yes", hosted, false],
  ];

  for (const [label, value, url, expected] of cases) {
    it(label, () => {
      assert.equal(grokChromeEnabled(value, url), expected);
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
      source.includes("grokChromeEnabled(process.env.GROK_CHROME, process.env.BETTER_AUTH_URL)"),
    );
    assert.equal(source.split("if (!chromeOn) return next();").length - 1, 2);
  });
});
