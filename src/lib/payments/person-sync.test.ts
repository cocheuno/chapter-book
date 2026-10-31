import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHANGES_TASK_PREFIX,
  SYNC_FIELDS,
  canApplyRegistrationChanges,
  canDismissRegistrationChanges,
  changesTaskTitle,
  reviewForDesk,
  reviewLineText,
  pendingRoleKey,
  reviewLines,
  reviewRecord,
  reviewUpdates,
  syncPlan,
  withRoleReview,
} from "./person-sync.ts";

const empty = {};

describe("syncPlan", () => {
  it("lists the person columns a registration may fill", () => {
    assert.deepEqual(SYNC_FIELDS, [
      "religious_title",
      "academic_title",
      "city",
      "state",
      "phone",
      "dietary",
    ]);
    assert.equal(SYNC_FIELDS.includes("given_name" as never), false);
    assert.equal(SYNC_FIELDS.includes("family_name" as never), false);
    assert.equal(SYNC_FIELDS.includes("email" as never), false);
  });

  it("fills a blank stored field and leaves a typed blank alone", () => {
    const plan = syncPlan(empty, {
      city: "Madison",
      state: " ",
      phone: "555-0100",
    });
    assert.deepEqual(plan.fill, { city: "Madison", phone: "555-0100" });
    assert.deepEqual(plan.differ, []);
  });

  it("does nothing when the values match after trimming and case folding", () => {
    const plan = syncPlan(
      { city: " Milwaukee ", state: "wi", phone: "555-0100", dietary: "vegan; nut allergy; peanuts" },
      {
        city: "milwaukee",
        state: "WI",
        phone: " 555-0100 ",
        dietaryTags: ["nut_allergy", "vegan"],
        dietaryText: " peanuts ",
      },
    );
    assert.deepEqual(plan.fill, {});
    assert.deepEqual(plan.differ, []);
  });

  it("holds a conflict when both sides are filled and differ", () => {
    const plan = syncPlan(
      { city: "Milwaukee", state: "WI", phone: "555-0100", dietary: "Vegetarian" },
      { city: " Madison ", state: "WI", phone: "555-0199", dietaryText: "Vegan" },
    );
    assert.deepEqual(plan.fill, {});
    assert.deepEqual(plan.differ, [
      { field: "city", stored: "Milwaukee", typed: "Madison" },
      { field: "phone", stored: "555-0100", typed: "555-0199" },
      { field: "dietary", stored: "Vegetarian", typed: "Vegan" },
    ]);
  });

  it("routes a religious title and does not consider the academic column", () => {
    const filled = syncPlan({ academic_title: "Dr." }, { title: " Fr. " });
    assert.deepEqual(filled.fill, { religious_title: "Fr." });
    assert.deepEqual(filled.differ, []);
    assert.equal("academic_title" in filled.fill, false);

    const conflict = syncPlan({ religious_title: "Fr.", academic_title: "Dr." }, { title: "Rev." });
    assert.deepEqual(conflict.fill, {});
    assert.deepEqual(conflict.differ, [{ field: "religious_title", stored: "Fr.", typed: "Rev." }]);
  });

  it("routes an academic title and ignores Mr.", () => {
    const doctor = syncPlan({ religious_title: "Fr." }, { title: "dr." });
    assert.deepEqual(doctor.fill, { academic_title: "Dr." });
    assert.deepEqual(doctor.differ, []);

    const plain = syncPlan({ religious_title: "Fr.", academic_title: "Dr.", city: "Madison" }, { title: "Mr." });
    assert.deepEqual(plain.fill, {});
    assert.deepEqual(plain.differ, []);
  });

  it("stores dietary as tag labels plus the note", () => {
    const plan = syncPlan(
      { dietary: null },
      { dietaryTags: ["nut_allergy", "vegan"], dietaryText: " peanuts " },
    );
    assert.deepEqual(plan.fill, { dietary: "Vegan; Nut allergy; peanuts" });
    assert.deepEqual(plan.differ, []);
  });
});

describe("reviewRecord", () => {
  it("keeps name differences and sync conflicts, and does not review a dietary fill", () => {
    const merged = reviewRecord(
      {
        given_name: { book: "Ann", typed: "Anne" },
        dietary: { book: null, typed: "peanuts" },
      },
      [{ field: "city", stored: "Milwaukee", typed: "Madison" }],
    );
    assert.deepEqual(merged, {
      given_name: { book: "Ann", typed: "Anne" },
      city: { book: "Milwaukee", typed: "Madison" },
    });
  });

  it("uses the sync dietary string when the note and the book disagree", () => {
    const merged = reviewRecord(
      { dietary: { book: "Vegan", typed: "peanuts" } },
      [{ field: "dietary", stored: "Vegan", typed: "Vegan; peanuts" }],
    );
    assert.deepEqual(merged, { dietary: { book: "Vegan", typed: "Vegan; peanuts" } });
  });
});

describe("review lines", () => {
  const review = {
    given_name: { book: "Ann", typed: "Anne" },
    city: { stored: "Milwaukee", typed: "Madison" },
    phone: { book: null, typed: "555-0100" },
    notes: { book: "secret", typed: "nope" },
  };

  it("turns review_changes into display lines", () => {
    const lines = reviewLines(JSON.stringify(review));
    assert.deepEqual(
      lines.map((line) => reviewLineText(line)),
      ["Given name: Ann → Anne", "City: Milwaukee → Madison", "Phone:  → 555-0100"],
    );
    assert.deepEqual(reviewUpdates(review).map((row) => row.field), ["given_name", "city", "phone"]);
  });

  it("names the open task the desk closes", () => {
    assert.equal(changesTaskTitle("Ann Lee"), `${CHANGES_TASK_PREFIX}Ann Lee`);
  });

  it("holds a ticket role for an editor and shows the label", () => {
    const review = withRoleReview(null, "student");
    assert.deepEqual(review, { role: { book: null, typed: "student" } });
    assert.equal(reviewLineText(reviewLines(review)[0]!), "Role: (none) → Student");
    assert.equal(pendingRoleKey(review), "student");
    assert.deepEqual(reviewUpdates(review), []);
    const kept = { given_name: { book: "Ann", typed: "Anne" } };
    assert.equal(withRoleReview(kept, " "), kept);
    assert.deepEqual(withRoleReview(kept, "friend"), {
      given_name: { book: "Ann", typed: "Anne" },
      role: { book: null, typed: "friend" },
    });
  });
});

describe("who may apply or dismiss", () => {
  it("a viewer cannot apply or dismiss", () => {
    assert.equal(canApplyRegistrationChanges("viewer"), false);
    assert.equal(canDismissRegistrationChanges("viewer"), false);
    assert.equal(canApplyRegistrationChanges("guest"), false);
    assert.equal(canDismissRegistrationChanges(""), false);
    const desk = reviewForDesk("viewer", {
      city: { stored: "Milwaukee", typed: "Madison" },
      phone: { book: "555-0100", typed: "555-0199" },
    });
    assert.equal(desk.waiting, true);
    assert.deepEqual(desk.lines, []);
    const payload = JSON.stringify(desk);
    assert.equal(payload.includes("Madison"), false);
    assert.equal(payload.includes("555-0199"), false);
    assert.equal(payload.includes("Milwaukee"), false);
  });

  it("an editor or admin receives the lines", () => {
    assert.equal(canApplyRegistrationChanges("editor"), true);
    assert.equal(canDismissRegistrationChanges("admin"), true);
    const desk = reviewForDesk("editor", { state: { book: "WI", typed: "MN" } });
    assert.equal(desk.waiting, false);
    assert.deepEqual(desk.lines.map((line) => reviewLineText(line)), ["State: WI → MN"]);
  });
});
