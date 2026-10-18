import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUARDIAN_NAME_MAX,
  MEDICAL_NOTES_MAX,
  consentDetailsPurgeOpen,
  eventLastDay,
  guardianConsentErrors,
  paperConsentErrors,
  studentPublicName,
  type GuardianConsentInput,
} from "./consent-rules.ts";

function form(over: Partial<GuardianConsentInput> = {}): GuardianConsentInput {
  return {
    guardianName: "Ada Example",
    guardianPhone: "555-0100",
    guardianEmail: "ada@example.com",
    relationship: "parent",
    emergencyName: "Bea Example",
    emergencyPhone: "555-0101",
    medicalNotes: "",
    photoRelease: false,
    agreed: true,
    signature: "Ada Example",
    ...over,
  };
}

describe("guardianConsentErrors", () => {
  it("accepts a complete form, including no photo release", () => {
    assert.deepEqual(guardianConsentErrors(form({ photoRelease: false })), []);
    assert.deepEqual(guardianConsentErrors(form({ signature: "  ada example  " })), []);
  });

  it("requires the guardian, the emergency contact, the agreement, and a matching signature", () => {
    const errors = guardianConsentErrors(
      form({
        guardianName: " ",
        guardianPhone: "",
        guardianEmail: " ",
        relationship: "",
        emergencyName: "",
        emergencyPhone: "",
        agreed: false,
        signature: "",
      }),
    );
    assert.deepEqual(errors, [
      "Enter the guardian's name.",
      "Enter the guardian's phone.",
      "Enter the guardian's email.",
      "Enter the guardian's relationship to the student.",
      "Enter an emergency contact name.",
      "Enter an emergency contact phone.",
      "Tick the box to agree.",
      "Type the guardian's full name to sign.",
    ]);
  });

  it("rejects a signature that does not match the guardian name", () => {
    assert.deepEqual(guardianConsentErrors(form({ signature: "Ann Example" })), [
      "Type the guardian's full name to sign.",
    ]);
  });

  it("rejects an email that is not an address, and fields over their caps", () => {
    assert.deepEqual(guardianConsentErrors(form({ guardianEmail: "not-an-email" })), [
      "Enter a valid guardian email.",
    ]);
    const long = guardianConsentErrors(
      form({
        guardianName: "A".repeat(GUARDIAN_NAME_MAX + 1),
        signature: "A".repeat(GUARDIAN_NAME_MAX + 1),
        medicalNotes: "m".repeat(MEDICAL_NOTES_MAX + 1),
      }),
    );
    assert.equal(long.some((message) => message.includes("Guardian name")), true);
    assert.equal(long.some((message) => message.includes("Medical notes")), true);
    assert.equal(long.some((message) => message.includes("Signature")), true);
  });
});

describe("paperConsentErrors", () => {
  it("requires a name and a phone", () => {
    assert.deepEqual(paperConsentErrors({ guardianName: "Ada Example", guardianPhone: "555-0100" }), []);
    assert.deepEqual(paperConsentErrors({ guardianName: " ", guardianPhone: "" }), [
      "Enter the guardian's name.",
      "Enter the guardian's phone.",
    ]);
  });
});

describe("studentPublicName", () => {
  it("shows the first name and last initial", () => {
    assert.equal(studentPublicName("Ann", "Lee"), "Ann L.");
    assert.equal(studentPublicName(" Ann ", "lee"), "Ann L.");
    assert.equal(studentPublicName("Ann", " "), "Ann");
  });
});

describe("event last day and purge", () => {
  it("uses the end, otherwise the start, in the event time zone", () => {
    const start = "2027-04-17T03:30:00.000Z";
    assert.equal(eventLastDay(start, null, "America/Chicago"), "2027-04-16");
    assert.equal(eventLastDay(start, "2027-04-18T18:00:00.000Z", "America/Chicago"), "2027-04-18");
    assert.equal(eventLastDay(null, null, "America/Chicago"), null);
    assert.equal(eventLastDay(start, null, "Not/AZone"), null);
  });

  it("opens 30 days after the last day", () => {
    assert.equal(consentDetailsPurgeOpen("2027-04-16", "2027-05-15"), false);
    assert.equal(consentDetailsPurgeOpen("2027-04-16", "2027-05-16"), true);
    assert.equal(consentDetailsPurgeOpen("2027-01-31", "2027-03-02"), true);
    assert.equal(consentDetailsPurgeOpen("2027-01-31", "2027-03-01"), false);
    assert.equal(consentDetailsPurgeOpen(null, "2027-05-16"), false);
  });
});
