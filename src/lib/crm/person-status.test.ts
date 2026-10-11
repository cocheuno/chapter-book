import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PERSON_STATUSES,
  audienceSkipReason,
  clergyReminderDue,
  deceasedMark,
  isContactable,
  isPersonStatus,
} from "./person-status.ts";

describe("audienceSkipReason", () => {
  it("skips a deceased person even when they have an email", () => {
    assert.equal(audienceSkipReason({ status: "deceased", email: "a@example.com" }), "deceased");
  });

  it("records do-not-contact and an unsubscribe as unsubscribed", () => {
    assert.equal(audienceSkipReason({ status: "do_not_contact", email: "a@example.com" }), "unsubscribed");
    assert.equal(
      audienceSkipReason({ status: "active", email: "a@example.com", email_unsubscribed: true }),
      "unsubscribed",
    );
  });

  it("records a missing email, and keeps active, inactive, and moved people who have one", () => {
    assert.equal(audienceSkipReason({ status: "active", email: "" }), "no_email");
    assert.equal(audienceSkipReason({ status: "active", email: null }), "no_email");
    assert.equal(audienceSkipReason({ status: "active", email: "a@example.com" }), null);
    assert.equal(audienceSkipReason({ status: "inactive", email: "a@example.com" }), null);
    assert.equal(audienceSkipReason({ status: "moved", email: "a@example.com" }), null);
  });
});

describe("isContactable", () => {
  it("mirrors audienceSkipReason", () => {
    const people = [
      { status: "deceased", email: "a@example.com" },
      { status: "do_not_contact", email: "a@example.com" },
      { status: "active", email: "a@example.com", email_unsubscribed: true },
      { status: "active", email: "" },
      { status: "active", email: "a@example.com" },
      { status: "inactive", email: "a@example.com" },
      { status: "moved", email: "a@example.com" },
    ];
    for (const person of people) {
      assert.equal(isContactable(person), audienceSkipReason(person) === null);
    }
  });
});

describe("deceasedMark", () => {
  it("adds a dagger only for deceased", () => {
    assert.equal(deceasedMark("deceased"), " †");
    for (const status of ["active", "inactive", "moved", "do_not_contact", "", null]) {
      assert.equal(deceasedMark(status), "");
    }
  });
});

describe("clergyReminderDue", () => {
  it("is true for every day in June and false on the days beside it", () => {
    assert.equal(clergyReminderDue("2027-06-01"), true);
    assert.equal(clergyReminderDue("2027-06-30"), true);
    assert.equal(clergyReminderDue("2027-05-31"), false);
    assert.equal(clergyReminderDue("2027-07-01"), false);
  });
});

describe("isPersonStatus", () => {
  it("accepts the five keys and rejects dead", () => {
    assert.equal(isPersonStatus("dead"), false);
    for (const status of PERSON_STATUSES) {
      assert.equal(isPersonStatus(status.key), true);
    }
  });
});
