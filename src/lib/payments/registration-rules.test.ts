import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agreementsAccepted,
  matchAttendee,
  planRegistration,
  registrationCode,
  reviewChanges,
  turnstileMode,
  type CatalogTicket,
  type RegistrationCatalog,
} from "./registration-rules.ts";

const now = new Date("2027-06-01T15:00:00.000Z");

function ticket(over: Partial<CatalogTicket> & Pick<CatalogTicket, "id">): CatalogTicket {
  return {
    kind: "admission",
    name: over.id,
    price_cents: 0,
    for_minors: false,
    needs_code: false,
    active: true,
    sales_start: null,
    sales_end: null,
    partIds: [],
    ...over,
  };
}

function person(over: Partial<{ givenName: string; familyName: string; admissionId: string; addOnIds: string[]; under18: boolean }> = {}) {
  return {
    givenName: "Ann",
    familyName: "Lee",
    under18: false,
    admissionId: "general",
    addOnIds: [] as string[],
    ...over,
  };
}

describe("planRegistration", () => {
  it("accepts one free admission and counts each part once", () => {
    const catalog: RegistrationCatalog = {
      tickets: [
        ticket({ id: "general", name: "General", partIds: ["friday", "saturday"] }),
        ticket({ id: "lunch", kind: "add_on", name: "Lunch", partIds: ["friday"] }),
      ],
      parts: [
        { id: "friday", title: "Friday", capacity: 10, held: 0, taken: 0 },
        { id: "saturday", title: "Saturday", capacity: null, held: 0, taken: 0 },
      ],
    };
    const plan = planRegistration(
      { attendees: [person({ addOnIds: ["lunch"] })] },
      catalog,
      now,
    );
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.totalCents, 0);
    assert.deepEqual(plan.partNeeds, { friday: 1, saturday: 1 });
    assert.deepEqual(
      plan.lines.map((line) => line.ticketId),
      ["general", "lunch"],
    );
  });

  it("counts a part once for each attendee", () => {
    const catalog: RegistrationCatalog = {
      tickets: [ticket({ id: "general", partIds: ["friday"] })],
      parts: [{ id: "friday", title: "Friday", capacity: 10, held: 0, taken: 0 }],
    };
    const plan = planRegistration(
      { attendees: [person(), person({ givenName: "Ben" })] },
      catalog,
      now,
    );
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.partNeeds.friday, 2);
  });

  it("refuses a paid ticket", () => {
    const plan = planRegistration(
      { attendees: [person()] },
      {
        tickets: [ticket({ id: "general", price_cents: 2500 })],
        parts: [],
      },
      now,
    );
    assert.deepEqual(plan, {
      ok: false,
      error: "Online payment opens soon. Choose a free ticket for now.",
    });
  });

  it("refuses a student under 18", () => {
    const plan = planRegistration(
      { attendees: [person({ under18: true })] },
      { tickets: [ticket({ id: "general" })], parts: [] },
      now,
    );
    assert.deepEqual(plan, { ok: false, error: "Registration for students under 18 opens soon." });
  });

  it("refuses more than 10 people", () => {
    const plan = planRegistration(
      { attendees: Array.from({ length: 11 }, () => person()) },
      { tickets: [ticket({ id: "general" })], parts: [] },
      now,
    );
    assert.deepEqual(plan, { ok: false, error: "Add between 1 and 10 people." });
  });

  it("refuses a ticket that needs a code", () => {
    const plan = planRegistration(
      { attendees: [person()] },
      { tickets: [ticket({ id: "general", needs_code: true })], parts: [] },
      now,
    );
    assert.deepEqual(plan, { ok: false, error: "That ticket is not available." });
  });

  it("refuses a repeated add-on", () => {
    const plan = planRegistration(
      { attendees: [person({ addOnIds: ["lunch", "lunch"] })] },
      {
        tickets: [ticket({ id: "general" }), ticket({ id: "lunch", kind: "add_on" })],
        parts: [],
      },
      now,
    );
    assert.deepEqual(plan, { ok: false, error: "That ticket is not available." });
  });

  it("refuses a part that is already full", () => {
    const plan = planRegistration(
      { attendees: [person()] },
      {
        tickets: [ticket({ id: "general", partIds: ["friday"] })],
        parts: [{ id: "friday", title: "Friday", capacity: 1, held: 0, taken: 1 }],
      },
      now,
    );
    assert.deepEqual(plan, { ok: false, error: "Friday is full." });
  });
});

describe("registrationCode", () => {
  it("builds Ryy-XXXX from the Crockford alphabet", () => {
    assert.equal(registrationCode(2027, new Uint8Array([0, 31, 10, 255])), "R27-0ZAZ");
  });
});

describe("matchAttendee", () => {
  const typed = { email: "ann@example.com", givenName: "Ann", familyName: "Lee" };

  it("links an email match", () => {
    assert.deepEqual(matchAttendee(typed, { id: "p1" }, [{ id: "p2", email: null }]), {
      action: "link",
      personId: "p1",
      reason: "email",
    });
  });

  it("creates and notes a same-name person when email does not match", () => {
    assert.deepEqual(matchAttendee({ ...typed, email: null }, null, [{ id: "p2", email: "other@example.com" }]), {
      action: "create",
      possibleDuplicateOf: "p2",
    });
  });

  it("creates with no duplicate when nothing matches", () => {
    assert.deepEqual(matchAttendee({ ...typed, email: null }, null, []), {
      action: "create",
      possibleDuplicateOf: null,
    });
  });
});

describe("reviewChanges", () => {
  const person = { given_name: "Ann", family_name: "Lee", dietary: "none" };

  it("is null when nothing differs", () => {
    assert.equal(
      reviewChanges(person, { givenName: "ann", familyName: "LEE", dietary: "None" }),
      null,
    );
  });

  it("reports a changed dietary need", () => {
    assert.deepEqual(reviewChanges(person, { givenName: "Ann", familyName: "Lee", dietary: "gluten" }), {
      dietary: { book: "none", typed: "gluten" },
    });
  });

  it("ignores a blank typed field", () => {
    assert.equal(reviewChanges(person, { givenName: "Ann", familyName: "Lee", dietary: "  " }), null);
  });
});

describe("turnstileMode", () => {
  it("skips, verifies, or reports a half configuration", () => {
    assert.equal(turnstileMode({}), "skip");
    assert.equal(turnstileMode({ siteKey: " ", secretKey: "" }), "skip");
    assert.equal(turnstileMode({ siteKey: "site", secretKey: "secret" }), "verify");
    assert.equal(turnstileMode({ siteKey: "site" }), "misconfigured");
    assert.equal(turnstileMode({ secretKey: "secret" }), "misconfigured");
  });
});

describe("agreementsAccepted", () => {
  it("is true only when every latest id was accepted", () => {
    assert.equal(agreementsAccepted(["a", "b"], ["b", "a", "c"]), true);
    assert.equal(agreementsAccepted(["a", "b"], ["a"]), false);
    assert.equal(agreementsAccepted([], ["a"]), true);
  });
});
