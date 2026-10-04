import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grokChromeEnabled } from "./grok-chrome.ts";

describe("grokChromeEnabled", () => {
  it("returns false for off", () => {
    assert.equal(grokChromeEnabled("off"), false);
  });

  it("returns false for off with surrounding spaces and different case", () => {
    assert.equal(grokChromeEnabled(" OFF "), false);
  });

  it("returns true when the value is unset", () => {
    assert.equal(grokChromeEnabled(undefined), true);
  });

  it("returns true for an empty value", () => {
    assert.equal(grokChromeEnabled(""), true);
  });

  it("returns true for on", () => {
    assert.equal(grokChromeEnabled("on"), true);
  });
});

describe("grok pwa middleware", () => {
  it("guards head injection with grokChromeEnabled", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../server/middleware/grok-pwa.ts"),
      "utf8",
    );
    assert.ok(source.includes("grokChromeEnabled(process.env.GROK_CHROME)"));
  });
});
