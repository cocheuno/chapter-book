import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registrationInput } from "../crm/registration-input.ts";

function attendee(over: { givenName?: string } = {}) {
  return {
    givenName: "Ann",
    familyName: "Lee",
    under18: false,
    admissionId: "general",
    addOnIds: [] as string[],
    ...over,
  };
}

function input(attendees: ReturnType<typeof attendee>[]) {
  return {
    purchaser: { name: "Ann Lee", email: "ann@example.com" },
    attendees,
    acceptedAgreementIds: [] as string[],
    newsOptIn: false,
    slug: "gathering",
  };
}

describe("registrationInput size limits", () => {
  it("rejects an 11-person list and a 101-character given name", () => {
    const eleven = registrationInput.safeParse(input(Array.from({ length: 11 }, () => attendee())));
    assert.equal(eleven.success, false);
    if (!eleven.success) {
      assert.ok(eleven.error.issues.some((issue) => issue.path.length === 1 && issue.path[0] === "attendees"));
    }

    const longName = registrationInput.safeParse(input([attendee({ givenName: "a".repeat(101) })]));
    assert.equal(longName.success, false);
    if (!longName.success) {
      assert.ok(
        longName.error.issues.some(
          (issue) => issue.path[0] === "attendees" && issue.path[2] === "givenName",
        ),
      );
    }

    const accepted = registrationInput.safeParse(
      input(Array.from({ length: 10 }, () => attendee({ givenName: "a".repeat(100) }))),
    );
    assert.equal(accepted.success, true);
  });
});
