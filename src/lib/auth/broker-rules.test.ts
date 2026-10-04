import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brokerSignInEnabled } from "./broker-rules.ts";

describe("brokerSignInEnabled", () => {
  it("returns false when auth is not configured, whatever the other values are", () => {
    assert.equal(
      brokerSignInEnabled({
        authConfigured: false,
        betterAuthUrl: "https://chapter.example",
        flag: "on",
      }),
      false,
    );
    assert.equal(brokerSignInEnabled({ authConfigured: false }), false);
    assert.equal(
      brokerSignInEnabled({ authConfigured: false, betterAuthUrl: "  ", flag: "true" }),
      false,
    );
  });

  it("returns true when auth is configured and the public origin is unset", () => {
    assert.equal(brokerSignInEnabled({ authConfigured: true }), true);
  });

  it("returns true when auth is configured and the public origin is blank", () => {
    assert.equal(brokerSignInEnabled({ authConfigured: true, betterAuthUrl: "  " }), true);
  });

  it("returns false when a public origin is set and the flag is unset", () => {
    assert.equal(
      brokerSignInEnabled({ authConfigured: true, betterAuthUrl: "https://chapter.example" }),
      false,
    );
  });

  it("returns true when a public origin is set and the flag is on", () => {
    assert.equal(
      brokerSignInEnabled({
        authConfigured: true,
        betterAuthUrl: "https://chapter.example",
        flag: " ON ",
      }),
      true,
    );
  });

  it("returns false when a public origin is set and the flag is not on", () => {
    assert.equal(
      brokerSignInEnabled({
        authConfigured: true,
        betterAuthUrl: "https://chapter.example",
        flag: "true",
      }),
      false,
    );
  });
});
