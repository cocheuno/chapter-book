import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchPerson } from "./match.ts";

const people = [
  {
    id: "ada",
    display_name: "Ada Example",
    email: "ada@example.com",
    given_name: "Ada",
    family_name: "Example",
    other_emails: ["ada.work@example.com", "Ada.Lab@example.com"],
  },
];

describe("matchPerson other emails", () => {
  it("treats another email as the same person and shows that address", () => {
    const hit = matchPerson(people, "Someone Else", "Ada.Work@example.com");
    assert.equal(hit.hard?.reason, "email");
    assert.equal(hit.hard?.id, "ada");
    assert.equal(hit.hard?.email, "ada.work@example.com");
    assert.equal(hit.soft, null);
  });

  it("matches a mixed-case other email against the stored address", () => {
    const hit = matchPerson(people, "Pat Sample", "ada.lab@example.com");
    assert.equal(hit.hard?.id, "ada");
    assert.equal(hit.hard?.email, "Ada.Lab@example.com");
  });

  it("prefers the main email when that is the address typed", () => {
    const hit = matchPerson(people, "Ada Example", "ada@example.com");
    assert.equal(hit.hard?.email, "ada@example.com");
    assert.equal(hit.hard?.reason, "email");
  });

  it("still matches the name when no email is typed", () => {
    const hit = matchPerson(people, "Ada Example", "");
    assert.equal(hit.hard?.reason, "name");
    assert.equal(hit.hard?.email, "ada@example.com");
  });
});
