import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composePersonName } from "./names.ts";
import { composedHonorific } from "./lists.ts";
import { matchPartner, matchPerson } from "./match.ts";
import { nextOccasionLocal, schoolYearStartIso } from "./format.ts";

describe("names", () => {
  it("lets the religious title win over the academic title", () => {
    assert.equal(composedHonorific("Fr.", "Dr."), "Fr.");
    assert.equal(
      composePersonName({
        religiousTitle: "Fr.",
        academicTitle: "Dr.",
        givenName: "James",
        familyName: "O'Neill",
      }),
      "Fr. James O'Neill",
    );
  });
});

describe("duplicates", () => {
  it("treats email as the person key", () => {
    const people = [{ id: "1", display_name: "Ann Cole", email: "a.cole@stmarys.example" }];
    const hit = matchPerson(people, "Someone Else", "a.cole@stmarys.example");
    assert.equal(hit.hard?.reason, "email");
    assert.equal(hit.hard?.id, "1");
  });

  it("treats the same name without email as a duplicate", () => {
    const people = [{ id: "1", display_name: "Ann Cole", email: null, given_name: "Ann", family_name: "Cole" }];
    const hit = matchPerson(people, "Ann Cole", "");
    assert.equal(hit.hard?.reason, "name");
  });

  it("treats partner name+city as the unique key", () => {
    const orgs = [{ id: "1", name: "St. Mary’s Parish", city: "Albuquerque" }];
    assert.equal(matchPartner(orgs, "St. Mary's Parish", "Albuquerque").hard?.id, "1");
    assert.equal(matchPartner(orgs, "St. Mary's Parish", "Santa Fe").hard, null);
    assert.equal(matchPartner(orgs, "St. Mary's Parish", "Santa Fe").soft?.id, "1");
  });
});

describe("school year", () => {
  it("uses the most recent 1 August", () => {
    assert.equal(schoolYearStartIso(new Date(2026, 8, 2)), "2026-08-01");
    assert.equal(schoolYearStartIso(new Date(2026, 6, 31)), "2025-08-01");
    assert.equal(schoolYearStartIso(new Date(2026, 7, 1)), "2026-08-01");
  });
});

describe("next occasion", () => {
  it("stays on this year when the feast is still ahead", () => {
    assert.equal(nextOccasionLocal(11, 15, 17, 30, new Date(2026, 0, 10)), "2026-11-15T17:30");
  });

  it("rolls to next year after the feast", () => {
    assert.equal(nextOccasionLocal(11, 15, 17, 30, new Date(2026, 11, 1)), "2027-11-15T17:30");
  });
});
