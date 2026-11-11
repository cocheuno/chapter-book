import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvRow } from "./csv.ts";
import {
  attendeeEmailCsv,
  attendeeEmailFilename,
  attendeeEmailList,
  type AttendeeEmailRow,
  type Who,
} from "./attendee-emails.ts";

function row(over: Partial<AttendeeEmailRow> = {}): AttendeeEmailRow {
  return {
    personId: "p1",
    displayName: "Ann Lee",
    givenName: "Ann",
    familyName: "Lee",
    email: "ann.lee@example.com",
    guestStatus: "attending",
    checkedIn: false,
    unsubscribed: false,
    status: "active",
    forgotten: false,
    ...over,
  };
}

describe("attendeeEmailList", () => {
  it("keeps said-yes guests and leaves the other statuses out", () => {
    const list = attendeeEmailList(
      [
        row({ personId: "yes", guestStatus: "attending", email: "ann.lee@example.com" }),
        row({
          personId: "came",
          guestStatus: "attended",
          givenName: "Bea",
          email: "bea.lee@example.com",
        }),
        row({ personId: "wait", guestStatus: "invited", email: "wait@example.com" }),
        row({ personId: "none", guestStatus: "no_response", email: "none@example.com" }),
        row({ personId: "no", guestStatus: "declined", email: "no@example.com" }),
        row({ personId: "blank", guestStatus: null, email: "blank@example.com" }),
      ],
      "yes",
    );
    assert.deepEqual(
      list.contacts.map((contact) => contact.email),
      ["ann.lee@example.com", "bea.lee@example.com"],
    );
    assert.equal(list.included, 2);
    assert.equal(list.optedOut, 0);
    assert.deepEqual(list.missing, []);
  });

  it("keeps people who attended or checked in", () => {
    const list = attendeeEmailList(
      [
        row({ personId: "door", guestStatus: "invited", checkedIn: true, email: "door@example.com" }),
        row({ personId: "sat", guestStatus: "attended", email: "sat@example.com", familyName: "Oak" }),
        row({ personId: "yes", guestStatus: "attending", email: "yes@example.com" }),
        row({ personId: "no", guestStatus: "declined", checkedIn: false, email: "no@example.com" }),
      ],
      "came",
    );
    assert.deepEqual(
      list.contacts.map((contact) => contact.email).sort(),
      ["door@example.com", "sat@example.com"],
    );
  });

  it("keeps every status except declined", () => {
    const list = attendeeEmailList(
      [
        row({ personId: "wait", guestStatus: "invited", email: "wait@example.com", familyName: "Ash" }),
        row({ personId: "none", guestStatus: "no_response", email: "none@example.com", familyName: "Bay" }),
        row({ personId: "yes", guestStatus: "attending", email: "yes@example.com", familyName: "Coe" }),
        row({ personId: "empty", guestStatus: null, email: "empty@example.com", familyName: "Doe" }),
        row({ personId: "no", guestStatus: "declined", checkedIn: true, email: "no@example.com" }),
      ],
      "open",
    );
    assert.deepEqual(
      list.contacts.map((contact) => contact.email),
      ["wait@example.com", "none@example.com", "yes@example.com", "empty@example.com"],
    );
    assert.equal(list.optedOut, 0);
  });

  it("counts every leave-out and skips a blank address", () => {
    const reasons: Array<Partial<AttendeeEmailRow>> = [
      { personId: "gone", forgotten: true, email: "gone@example.com", displayName: "Gone" },
      { personId: "stop", unsubscribed: true, email: "stop@example.com", displayName: "Stop" },
      { personId: "quiet", status: "do_not_contact", email: "quiet@example.com", displayName: "Quiet" },
      { personId: "late", status: "deceased", email: "late@example.com", displayName: "Late" },
    ];
    for (const who of ["yes", "came", "open"] as const) {
      const guestStatus = who === "came" ? "attended" : "attending";
      const list = attendeeEmailList(
        [
          ...reasons.map((over) => row({ ...over, guestStatus })),
          row({
            personId: "no-mail",
            email: "  ",
            displayName: "No Mail",
            guestStatus,
          }),
          row({ personId: "keep", email: "keep@example.com", familyName: "Keep", guestStatus }),
        ],
        who,
      );
      assert.equal(list.optedOut, 4, who);
      assert.deepEqual(list.missing, [{ personId: "no-mail", displayName: "No Mail" }]);
      assert.deepEqual(list.contacts.map((contact) => contact.email), ["keep@example.com"]);
    }
  });

  it("does not count a person the filter already left out", () => {
    const list = attendeeEmailList(
      [row({ guestStatus: "declined", unsubscribed: true, forgotten: true, status: "deceased" })],
      "yes",
    );
    assert.equal(list.optedOut, 0);
    assert.equal(list.included, 0);
    assert.deepEqual(list.missing, []);
  });

  it("keeps the first address when the same email differs only by case and space", () => {
    const list = attendeeEmailList(
      [
        row({
          personId: "first",
          givenName: "Ann",
          familyName: "Lee",
          email: " Ann.Lee@Example.com ",
        }),
        row({
          personId: "second",
          givenName: "Other",
          familyName: "Person",
          email: "ann.lee@example.com",
        }),
      ],
      "yes",
    );
    assert.deepEqual(list.contacts, [{ first: "Ann", last: "Lee", email: "ann.lee@example.com" }]);
    assert.equal(list.bcc, "ann.lee@example.com");
    assert.equal(list.included, 1);
  });

  it("uses the display name when both name parts are blank", () => {
    const list = attendeeEmailList(
      [
        row({
          givenName: "  ",
          familyName: null,
          displayName: "Pat Example",
          email: "pat@example.com",
        }),
      ],
      "yes",
    );
    assert.deepEqual(list.contacts, [{ first: "Pat Example", last: "", email: "pat@example.com" }]);
  });

  it("sorts contacts by last name then first name, and missing names by display name", () => {
    const list = attendeeEmailList(
      [
        row({ personId: "b", givenName: "Bea", familyName: "Zee", email: "bea@example.com" }),
        row({ personId: "a", givenName: "Ann", familyName: "Zee", email: "ann@example.com" }),
        row({ personId: "c", givenName: "Cam", familyName: "Ash", email: "cam@example.com" }),
        row({ personId: "m2", email: "", displayName: "Noa" }),
        row({ personId: "m1", email: null, displayName: "Ada" }),
      ],
      "yes",
    );
    assert.deepEqual(
      list.contacts.map((contact) => `${contact.last}, ${contact.first}`),
      ["Ash, Cam", "Zee, Ann", "Zee, Bea"],
    );
    assert.equal(list.bcc, "cam@example.com; ann@example.com; bea@example.com");
    assert.deepEqual(list.missing, [
      { personId: "m1", displayName: "Ada" },
      { personId: "m2", displayName: "Noa" },
    ]);
  });
});

describe("attendeeEmailCsv", () => {
  it("starts with the Outlook header and quotes each cell", () => {
    const csv = attendeeEmailCsv([{ first: "Ann", last: "Lee", email: "ann.lee@example.com" }]);
    assert.equal(
      csv,
      [
        csvRow(["First Name", "Last Name", "E-mail Address"]),
        csvRow(["Ann", "Lee", "ann.lee@example.com"]),
      ].join("\r\n"),
    );
    assert.equal(csv.split("\r\n")[0], '"First Name","Last Name","E-mail Address"');
  });

  it("guards a formula-looking name", () => {
    const csv = attendeeEmailCsv([{ first: "=Ann", last: "@Lee", email: "ann@example.com" }]);
    assert.equal(csv.includes("\"'=Ann\""), true);
    assert.equal(csv.includes("\"'@Lee\""), true);
    assert.equal(csv.startsWith('"First Name","Last Name","E-mail Address"\r\n'), true);
  });
});

describe("attendeeEmailFilename", () => {
  it("builds a lowercase hyphenated name for each who", () => {
    const names: Record<Who, string> = {
      yes: attendeeEmailFilename("Gold Mass 2026", "yes"),
      came: attendeeEmailFilename("  Hello, World! ", "came"),
      open: attendeeEmailFilename("a".repeat(60), "open"),
    };
    assert.equal(names.yes, "attendee-emails-gold-mass-2026-yes.csv");
    assert.equal(names.came, "attendee-emails-hello-world-came.csv");
    assert.equal(names.open, `attendee-emails-${"a".repeat(40)}-open.csv`);
    assert.equal(attendeeEmailFilename("---", "yes"), "attendee-emails--yes.csv");
  });
});
