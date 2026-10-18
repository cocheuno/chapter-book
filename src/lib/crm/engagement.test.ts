import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attendanceLine, countsAsAttended, houseAttendanceLine } from "./engagement.ts";

describe("countsAsAttended", () => {
  it("is true for an attended status or a check-in time", () => {
    assert.equal(countsAsAttended("attended", null), true);
    assert.equal(countsAsAttended("attended", "2026-04-16T18:00:00.000Z"), true);
    assert.equal(countsAsAttended("attending", "2026-04-16T18:00:00.000Z"), true);
    assert.equal(countsAsAttended(null, new Date("2026-04-16T18:00:00.000Z")), true);
    assert.equal(countsAsAttended("invited", null), false);
    assert.equal(countsAsAttended("declined", ""), false);
    assert.equal(countsAsAttended(null, "  "), false);
    assert.equal(countsAsAttended(null, null), false);
  });
});

describe("attendance lines", () => {
  it("names the count, and the last date only when there is one", () => {
    assert.equal(attendanceLine(0, null), "Events attended: 0");
    assert.equal(attendanceLine(0, "2026-04-16"), "Events attended: 0");
    assert.equal(attendanceLine(2, "2026-04-16"), "Events attended: 2 · last: 2026-04-16");
    assert.equal(attendanceLine(2, null), "Events attended: 2");
    assert.equal(houseAttendanceLine(0), "People who came through this house: 0");
    assert.equal(houseAttendanceLine(3), "People who came through this house: 3");
  });
});
