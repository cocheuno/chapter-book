import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAPTER_TIME_ZONE, isPastItem, orderEvents, todayIn, whenLabelFor, withWhenText } from "./dates.ts";

describe("todayIn", () => {
  it("stays on the Chicago date across midnight", () => {
    assert.equal(CHAPTER_TIME_ZONE, "America/Chicago");
    assert.equal(todayIn(CHAPTER_TIME_ZONE, new Date("2026-04-16T04:59:00Z")), "2026-04-15");
    assert.equal(todayIn(CHAPTER_TIME_ZONE, new Date("2026-04-16T05:00:00Z")), "2026-04-16");
    assert.equal(todayIn(CHAPTER_TIME_ZONE, new Date("2027-01-01T05:59:00Z")), "2026-12-31");
    assert.equal(todayIn(CHAPTER_TIME_ZONE, new Date("2027-01-01T06:00:00Z")), "2027-01-01");
  });
});

describe("isPastItem", () => {
  it("keeps an event that is still on today", () => {
    assert.equal(isPastItem({ kind: "event", starts_on: "2026-04-16" }, "2026-04-16"), false);
    assert.equal(
      isPastItem({ kind: "event", starts_on: "2026-04-14", ends_on: "2026-04-16" }, "2026-04-16"),
      false,
    );
    assert.equal(isPastItem({ kind: "event", starts_on: "2026-04-15" }, "2026-04-16"), true);
    assert.equal(
      isPastItem({ kind: "event", starts_on: "2026-04-14", ends_on: "2026-04-15" }, "2026-04-16"),
      true,
    );
  });

  it("leaves undated items and other kinds in place", () => {
    assert.equal(isPastItem({ kind: "event" }, "2026-04-16"), false);
    assert.equal(isPastItem({ kind: "announcement" }, "2026-04-16"), false);
    assert.equal(isPastItem({ kind: "announcement", ends_on: "2026-04-16" }, "2026-04-16"), false);
    assert.equal(isPastItem({ kind: "announcement", ends_on: "2026-04-15" }, "2026-04-16"), true);
    assert.equal(isPastItem({ kind: "announcement", starts_on: "2020-01-01" }, "2026-04-16"), false);
    assert.equal(isPastItem({ kind: "course", ends_on: "2026-04-15" }, "2026-04-16"), true);
    assert.equal(isPastItem({ kind: "article", starts_on: "2020-01-01", ends_on: "2020-01-02" }, "2026-04-16"), false);
  });
});

describe("orderEvents", () => {
  it("equals the input when no event has a start date", () => {
    const items = [
      { id: "a", kind: "announcement" },
      { id: "e1", kind: "event", starts_on: null },
      { id: "b", kind: "article" },
      { id: "e2", kind: "event" },
    ];
    assert.equal(orderEvents(items), items);
  });

  it("sorts dated events into the event slots and leaves everything else", () => {
    const items = [
      { id: "a", kind: "announcement" },
      { id: "e1", kind: "event", starts_on: null },
      { id: "b", kind: "article" },
      { id: "e2", kind: "event", starts_on: "2027-04-15" },
      { id: "e3", kind: "event", starts_on: "2026-11-21" },
      { id: "c", kind: "course" },
      { id: "e4", kind: "event", starts_on: "2026-11-21" },
    ];
    assert.deepEqual(
      orderEvents(items).map((item) => item.id),
      ["a", "e3", "b", "e4", "e2", "c", "e1"],
    );
    assert.equal(orderEvents(items)[0], items[0]);
    assert.equal(orderEvents(items)[2], items[2]);
    assert.equal(orderEvents(items)[5], items[5]);
  });
});

describe("whenLabelFor", () => {
  it("formats one day and a range", () => {
    assert.equal(whenLabelFor("2026-11-21"), "Saturday, November 21, 2026");
    assert.equal(whenLabelFor("2026-11-21", "2026-11-21"), "Saturday, November 21, 2026");
    assert.equal(whenLabelFor("2027-04-15", "2027-04-17"), "Thursday–Saturday, April 15–17, 2027");
    assert.equal(whenLabelFor("2027-04-30", "2027-05-02"), "Friday, April 30 – Sunday, May 2, 2027");
    assert.equal(whenLabelFor("2026-12-31", "2027-01-01"), "Thursday, December 31, 2026 – Friday, January 1, 2027");
    assert.equal(whenLabelFor(null, "2027-04-17"), null);
    assert.equal(whenLabelFor(undefined, undefined), null);
  });
});

describe("withWhenText", () => {
  it("fills a blank when line from the dates and leaves any other item", () => {
    assert.deepEqual(withWhenText({ when_label: null, starts_on: "2026-11-21", ends_on: null }), {
      when_label: "Saturday, November 21, 2026",
      starts_on: "2026-11-21",
      ends_on: null,
    });
    const labeled = { when_label: "April 16, 2027 · 9:00 a.m.", starts_on: "2027-04-16", ends_on: null };
    assert.equal(withWhenText(labeled), labeled);
    const undated = { when_label: null, starts_on: null, ends_on: null };
    assert.equal(withWhenText(undated), undated);
    const blank = { when_label: "", starts_on: null, ends_on: "2027-04-17" };
    assert.equal(withWhenText(blank), blank);
    assert.equal(blank.when_label, "");
  });
});
