import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVE_REGISTRATION_STATUSES,
  deskFilter,
  deskSearch,
  isActiveRegistration,
  mealCounts,
  partReleases,
  seatDrift,
  ticketPartsUnchanged,
  uniqueEmails,
} from "./registration-desk.ts";

const attendee = (over: Partial<{ givenName: string; familyName: string; review: boolean }> = {}) => ({
  givenName: "Ann",
  familyName: "Lee",
  review: false,
  ...over,
});

describe("isActiveRegistration", () => {
  it("accepts free, paid, and pending only", () => {
    assert.deepEqual(ACTIVE_REGISTRATION_STATUSES, ["free", "paid", "pending"]);
    assert.equal(isActiveRegistration("free"), true);
    assert.equal(isActiveRegistration("paid"), true);
    assert.equal(isActiveRegistration("pending"), true);
    assert.equal(isActiveRegistration("cancelled"), false);
    assert.equal(isActiveRegistration("expired"), false);
    assert.equal(isActiveRegistration("refunded"), false);
    assert.equal(isActiveRegistration("partly_refunded"), false);
  });
});

describe("deskFilter", () => {
  const reg = (over: Partial<{ status: string; needsReview: string | null; review: boolean }> = {}) => ({
    status: over.status ?? "free",
    needsReview: over.needsReview ?? null,
    attendees: [attendee({ review: over.review ?? false })],
  });

  it("keeps every registration for all", () => {
    assert.equal(deskFilter(reg({ status: "cancelled" }), "all"), true);
  });

  it("keeps active statuses and drops the rest", () => {
    assert.equal(deskFilter(reg({ status: "paid" }), "active"), true);
    assert.equal(deskFilter(reg({ status: "cancelled" }), "active"), false);
  });

  it("treats cancelled, expired, and refunded as cancelled", () => {
    assert.equal(deskFilter(reg({ status: "cancelled" }), "cancelled"), true);
    assert.equal(deskFilter(reg({ status: "expired" }), "cancelled"), true);
    assert.equal(deskFilter(reg({ status: "refunded" }), "cancelled"), true);
    assert.equal(deskFilter(reg({ status: "partly_refunded" }), "cancelled"), false);
    assert.equal(deskFilter(reg({ status: "free" }), "cancelled"), false);
  });

  it("needs a look when the registration or an attendee is flagged", () => {
    assert.equal(deskFilter(reg({ needsReview: "Name differs" }), "needs_look"), true);
    assert.equal(deskFilter(reg({ review: true }), "needs_look"), true);
    assert.equal(deskFilter(reg(), "needs_look"), false);
  });

  it("keeps a registration that still has a minor without consent", () => {
    const missing = {
      ...reg(),
      attendees: [{ review: false, isMinor: true, consentOnFile: false, cancelled: false }],
    };
    const filed = {
      ...reg(),
      attendees: [{ review: false, isMinor: true, consentOnFile: true, cancelled: false }],
    };
    const cancelledMinor = {
      ...reg(),
      attendees: [{ review: false, isMinor: true, consentOnFile: false, cancelled: true }],
    };
    assert.equal(deskFilter(missing, "consent_missing"), true);
    assert.equal(deskFilter(filed, "consent_missing"), false);
    assert.equal(deskFilter(cancelledMinor, "consent_missing"), false);
    assert.equal(deskFilter(reg(), "consent_missing"), false);
  });
});

describe("deskSearch", () => {
  const reg = {
    code: "R27-ABCD",
    purchaserName: "Pat Quinn",
    purchaserEmail: "pat@example.com",
    attendees: [attendee({ givenName: "Ann", familyName: "Lee" })],
  };

  it("matches everything when the text is blank", () => {
    assert.equal(deskSearch(reg, ""), true);
    assert.equal(deskSearch(reg, "   "), true);
  });

  it("matches code, purchaser, and attendee names without case", () => {
    assert.equal(deskSearch(reg, "abcd"), true);
    assert.equal(deskSearch(reg, "QUINN"), true);
    assert.equal(deskSearch(reg, "Pat@Example.com"), true);
    assert.equal(deskSearch(reg, "ann lee"), true);
    assert.equal(deskSearch(reg, "lee"), true);
    assert.equal(deskSearch(reg, "nobody"), false);
  });
});

describe("mealCounts", () => {
  it("trims dietary text, fills blanks, and sorts by title then count", () => {
    const rows = mealCounts([
      { partId: "lunch", partTitle: "Lunch", dietary: "  vegan " },
      { partId: "lunch", partTitle: "Lunch", dietary: "vegan" },
      { partId: "lunch", partTitle: "Lunch", dietary: " " },
      { partId: "lunch", partTitle: "Lunch", dietary: null },
      { partId: "dinner", partTitle: "Dinner", dietary: "Gluten free" },
    ]);
    assert.deepEqual(rows, [
      { partId: "dinner", partTitle: "Dinner", dietary: "Gluten free", count: 1 },
      { partId: "lunch", partTitle: "Lunch", dietary: "None given", count: 2 },
      { partId: "lunch", partTitle: "Lunch", dietary: "vegan", count: 2 },
    ]);
  });
});

describe("seatDrift", () => {
  it("lists only parts whose taken count differs, and treats a missing count as zero", () => {
    const drift = seatDrift(
      [
        { id: "hall", title: "Hall", taken: 2 },
        { id: "lunch", title: "Lunch", taken: 1 },
        { id: "dinner", title: "Dinner", taken: 0 },
      ],
      { hall: 2, dinner: 1 },
    );
    assert.deepEqual(drift, [
      { id: "lunch", title: "Lunch", taken: 1, counted: 0 },
      { id: "dinner", title: "Dinner", taken: 0, counted: 1 },
    ]);
  });
});

describe("uniqueEmails", () => {
  it("drops blanks, lowercases, and keeps the first of each address", () => {
    assert.deepEqual(
      uniqueEmails([" Ann@Example.com ", null, "", "   ", "ann@example.com", "Bo@Example.com"]),
      ["ann@example.com", "bo@example.com"],
    );
  });
});

describe("partReleases", () => {
  it("releases one seat when two tickets share a part", () => {
    assert.deepEqual(partReleases(["hall", "lunch", "hall", ""]), { hall: 1, lunch: 1 });
  });
});

describe("ticketPartsUnchanged", () => {
  it("ignores order and duplicates", () => {
    assert.equal(ticketPartsUnchanged(["b", "a"], ["a", "b", "a"]), true);
    assert.equal(ticketPartsUnchanged([], []), true);
    assert.equal(ticketPartsUnchanged(["a"], ["a", "b"]), false);
  });
});
