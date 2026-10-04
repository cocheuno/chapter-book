import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  disableBlockedReason,
  founderAllowed,
  hashInviteToken,
  isOperatorRole,
  normalizeOperatorEmail,
  roleChangeBlockedReason,
  signUpAllowed,
  type SignUpInvite,
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

describe("founderAllowed", () => {
  it("matches an address ignoring case and surrounding spaces", () => {
    assert.equal(
      founderAllowed("  Founder@Chapter.EXAMPLE ", {
        founderEmail: " founder@chapter.example ",
        databaseUrl: "configured",
      }),
      true,
    );
  });

  it("refuses a different address", () => {
    assert.equal(
      founderAllowed("other@chapter.example", {
        founderEmail: "founder@chapter.example",
        databaseUrl: "configured",
      }),
      false,
    );
  });

  it("refuses every address when the founder address is unset and a database URL is set", () => {
    assert.equal(founderAllowed("founder@chapter.example", { databaseUrl: "configured" }), false);
  });

  it("allows any address when the founder address and the database URL are unset", () => {
    assert.equal(founderAllowed("anyone@chapter.example", {}), true);
    assert.equal(
      founderAllowed("anyone@chapter.example", { founderEmail: undefined, databaseUrl: "" }),
      true,
    );
    assert.equal(founderAllowed("anyone@chapter.example", { databaseUrl: "   " }), true);
  });

  it("treats a blank founder address as unset", () => {
    assert.equal(founderAllowed("anyone@chapter.example", { founderEmail: "   " }), true);
    assert.equal(
      founderAllowed("anyone@chapter.example", { founderEmail: "   ", databaseUrl: "configured" }),
      false,
    );
  });
});

describe("signUpAllowed", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const openInvite: SignUpInvite = {
    email: "lead@chapter.example",
    expiresAt: future,
    acceptedAt: null,
  };

  it("allows the founder email when the book is empty", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: true,
        founderAllowed: true,
        email: "founder@chapter.example",
        invite: null,
      }),
      true,
    );
  });

  it("refuses another email when the book is empty", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: true,
        founderAllowed: false,
        email: "other@chapter.example",
        invite: null,
      }),
      false,
    );
  });

  it("refuses an empty book when founderAllowed is false and there is no invite", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: true,
        founderAllowed: false,
        email: "founder@chapter.example",
        invite: null,
      }),
      false,
    );
  });

  it("allows a matching unexpired invite", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: false,
        founderAllowed: false,
        email: "Lead@Chapter.example",
        invite: openInvite,
      }),
      true,
    );
  });

  it("refuses an invite for a different email", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: false,
        founderAllowed: false,
        email: "other@chapter.example",
        invite: openInvite,
      }),
      false,
    );
  });

  it("refuses an expired invite", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: false,
        founderAllowed: false,
        email: "lead@chapter.example",
        invite: { ...openInvite, expiresAt: past },
      }),
      false,
    );
  });

  it("refuses an accepted invite", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: false,
        founderAllowed: false,
        email: "lead@chapter.example",
        invite: { ...openInvite, acceptedAt: past },
      }),
      false,
    );
  });

  it("refuses sign-up when there is no invite", () => {
    assert.equal(
      signUpAllowed({
        bookEmpty: false,
        founderAllowed: true,
        email: "lead@chapter.example",
        invite: null,
      }),
      false,
    );
  });
});

describe("roles", () => {
  it("accepts the three chapter roles only", () => {
    assert.equal(isOperatorRole("admin"), true);
    assert.equal(isOperatorRole("donor"), false);
  });
});
