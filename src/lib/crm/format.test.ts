import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAPTER_TIME_ZONE } from "./dates.ts";
import { DEFAULT_TZ, formatWhen, fromDatetimeLocal, toDatetimeLocal } from "./format.ts";

describe("chapter time zone", () => {
  it("uses the same default as the chapter", () => {
    assert.equal(DEFAULT_TZ, CHAPTER_TIME_ZONE);
    assert.equal(DEFAULT_TZ, "America/Chicago");
  });

  it("converts a Chicago local time to UTC and back", () => {
    const winter = fromDatetimeLocal("2026-11-10T18:00", "America/Chicago");
    const summer = fromDatetimeLocal("2026-07-10T18:00", "America/Chicago");
    assert.equal(new Date(winter).toISOString(), "2026-11-11T00:00:00.000Z");
    assert.equal(new Date(summer).toISOString(), "2026-07-10T23:00:00.000Z");
    assert.equal(toDatetimeLocal(winter, "America/Chicago"), "2026-11-10T18:00");
    assert.equal(toDatetimeLocal(summer, "America/Chicago"), "2026-07-10T18:00");
    assert.equal(formatWhen("2026-11-11T00:00:00.000Z", "time", "America/Chicago"), "6:00 PM");
  });
});
