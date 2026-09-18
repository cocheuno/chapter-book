import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  disableBlockedReason,
  hashInviteToken,
  isOperatorRole,
  normalizeOperatorEmail,
  roleChangeBlockedReason,
} from "./operator-rules.ts";

describe("operator emails", () => {
  it("normalizes case and space", () => {
    assert.equal(normalizeOperatorEmail("  Lead@Chapter.EXAMPLE "), "lead@chapter.example");
  });
});

describe("invite token", () => {
  it("hashes stably and is not reversible as the raw token", () => {
    const a = hashInviteToken("secret-token");
    const b = hashInviteToken("secret-token");
    assert.equal(a, b);
    assert.notEqual(a, "secret-token");
    assert.equal(a.length, 64);
  });
});

describe("last admin", () => {
  it("blocks disabling the last admin", () => {
    assert.equal(
      disableBlockedReason({
        targetUserId: "1",
        actorUserId: "1",
        targetRole: "admin",
        enabledAdminCount: 1,
        alreadyDisabled: false,
      }),
      "The book needs at least one admin.",
    );
  });

  it("allows disabling an editor", () => {
    assert.equal(
      disableBlockedReason({
        targetUserId: "2",
        actorUserId: "1",
        targetRole: "editor",
        enabledAdminCount: 1,
        alreadyDisabled: false,
      }),
      null,
    );
  });

  it("blocks demoting the last admin", () => {
    assert.equal(
      roleChangeBlockedReason({ targetRole: "admin", nextRole: "viewer", enabledAdminCount: 1 }),
      "The book needs at least one admin.",
    );
  });
});

describe("roles", () => {
  it("accepts the three chapter roles only", () => {
    assert.equal(isOperatorRole("admin"), true);
    assert.equal(isOperatorRole("donor"), false);
  });
});
