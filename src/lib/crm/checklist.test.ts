import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GOLD_MASS_CHECKLIST, hatLabel } from "./constants.ts";
import { checklistDueOn, checklistPlan, missingChecklistItems } from "./checklist.ts";

const CONFERENCE_DATES: [string, string][] = [
  ["invite_bishop", "2026-10-18"],
  ["venue_contract", "2026-10-18"],
  ["celebrant", "2026-11-17"],
  ["payments", "2026-12-17"],
  ["speakers", "2026-12-17"],
  ["notify_schools", "2026-12-17"],
  ["reg_open", "2027-01-11"],
  ["hotel_block", "2027-01-16"],
  ["early_bird_ends", "2027-03-02"],
  ["bulletins", "2027-03-07"],
  ["rosters_due", "2027-03-19"],
  ["catering", "2027-04-06"],
  ["reg_close", "2027-04-09"],
  ["materials", "2027-04-13"],
  ["day_of", "2027-04-16"],
  ["thank_speakers", "2027-04-19"],
  ["reconcile", "2027-04-30"],
  ["minors_notes", "2027-05-16"],
];

const CONFERENCE_HATS = [
  "president",
  "events_lead",
  "president",
  "treasurer",
  "events_lead",
  "events_lead",
  "secretary",
  "events_lead",
  "secretary",
  "secretary",
  "events_lead",
  "events_lead",
  "treasurer",
  "secretary",
  "volunteer",
  "president",
  "treasurer",
  "secretary",
];

describe("checklistPlan", () => {
  it("dates a conference that starts on 2027-04-16", () => {
    const plan = checklistPlan("conference", "2027-04-16");
    assert.deepEqual(
      plan.map((item) => [item.key, item.dueOn]),
      CONFERENCE_DATES,
    );
    assert.deepEqual(
      plan.map((item) => item.hat),
      CONFERENCE_HATS,
    );
    assert.equal(new Set(plan.map((item) => item.key)).size, plan.length);
    assert.equal(plan.find((item) => item.key === "payments")?.hat, "treasurer");
    assert.equal(plan.find((item) => item.key === "reg_close")?.hat, "treasurer");
    assert.equal(plan.find((item) => item.key === "reconcile")?.hat, "treasurer");
  });
});

describe("checklistDueOn", () => {
  it("crosses months and years, including a leap day", () => {
    assert.equal(checklistDueOn("2027-01-10", -30), "2026-12-11");
    assert.equal(checklistDueOn("2027-02-27", 3), "2027-03-02");
    assert.equal(checklistDueOn("2028-02-27", 3), "2028-03-01");
  });
});

describe("missingChecklistItems", () => {
  it("keeps the old conference keys and lists the new ones in plan order", () => {
    const missing = missingChecklistItems("conference", "2027-04-16", [
      "venue",
      "theme",
      "speakers",
      "reg_open",
      "notify_schools",
      "materials",
      "day_of",
      "thank_speakers",
      "writeup",
      "close_event",
    ]);
    assert.deepEqual(
      missing.map((item) => item.key),
      [
        "invite_bishop",
        "venue_contract",
        "celebrant",
        "payments",
        "hotel_block",
        "early_bird_ends",
        "bulletins",
        "rosters_due",
        "catering",
        "reg_close",
        "reconcile",
        "minors_notes",
      ],
    );
  });

  it("returns nothing when a Gold Mass already has every item", () => {
    assert.deepEqual(
      missingChecklistItems(
        "gold_mass",
        "2027-04-16",
        GOLD_MASS_CHECKLIST.map((item) => item.key),
      ),
      [],
    );
  });
});

describe("hatLabel", () => {
  it("names the known hats and stays blank for null", () => {
    assert.equal(hatLabel("treasurer"), "Treasurer");
    assert.equal(hatLabel("events_lead"), "Events lead");
    assert.equal(hatLabel(null), "");
  });
});
