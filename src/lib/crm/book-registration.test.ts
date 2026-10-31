import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookRegistrationAllowed, registrationOpen } from "./book-registration.ts";

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

describe("registrationOpen", () => {
  it("needs the host flag, a working spam check, and the event switch", () => {
    assert.equal(registrationOpen({ flag: "on", spamMode: "verify", eventSwitch: true }), true);
    assert.equal(registrationOpen({ flag: "on", spamMode: "skip", eventSwitch: true }), true);
    assert.equal(registrationOpen({ flag: "ON", spamMode: "skip", eventSwitch: true }), true);
    assert.equal(registrationOpen({ flag: "on", spamMode: "misconfigured", eventSwitch: true }), false);
    assert.equal(registrationOpen({ flag: "off", spamMode: "verify", eventSwitch: true }), false);
    assert.equal(registrationOpen({ flag: undefined, spamMode: "verify", eventSwitch: true }), false);
    assert.equal(registrationOpen({ flag: "on", spamMode: "verify", eventSwitch: false }), false);
  });
});
