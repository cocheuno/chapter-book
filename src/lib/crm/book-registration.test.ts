import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookRegistrationAllowed } from "./book-registration.ts";

describe("bookRegistrationAllowed", () => {
  const cases: Array<[string, string | undefined, boolean]> = [
    ["unset", undefined, false],
    ["empty", "", false],
    ["blank", "  ", false],
    ["off", "off", false],
    ["yes", "yes", false],
    ["on", "on", true],
    ["ON with space", "ON ", true],
    ["On", "On", true],
  ];

  for (const [label, value, expected] of cases) {
    it(label, () => {
      assert.equal(bookRegistrationAllowed(value), expected);
    });
  }
});
