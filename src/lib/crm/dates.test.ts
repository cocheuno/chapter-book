import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPastItem, orderEvents, todayIn, whenLabelFor, withWhenText } from "./dates.ts";

describe("todayIn", () => {
  it("crosses Chicago midnight in standard time and daylight time", () => {
    assert.equal(todayIn("America/Chicago", new Date("2026-11-22T05:30:00Z")), "2026-11-21");
    assert.equal(todayIn("America/Chicago", new Date("2026-11-22T06:30:00Z")), "2026-11-22");
    assert.equal(todayIn("America/Chicago", new Date("2027-04-17T04:30:00Z")), "2027-04-16");
    assert.equal(todayIn("America/Chicago", new Date("2027-04-17T05:30:00Z")), "2027-04-17");
  });
});

describe("isPastItem", () => {
  const today = "2026-11-21";

  it("keeps an event that is still on today", () => {
    assert.equal(isPastItem({ kind: "event", starts_on: "2026-11-21" }, today), false);
    assert.equal(isPastItem({ kind: "event", starts_on: "2026-11-20" }, today), true);
    assert.equal(isPastItem({ kind: "event", starts_on: "2026-11-20", ends_on: "2026-11-21" }, today), false);
    assert.equal(isPastItem({ kind: "event" }, today), false);
  });

  it("uses Show until for announcements and courses, and ignores other kinds", () => {
    assert.equal(isPastItem({ kind: "announcement", starts_on: "2026-11-01" }, today), false);
    assert.equal(isPastItem({ kind: "announcement", ends_on: "2026-11-20" }, today), true);
    assert.equal(isPastItem({ kind: "course", ends_on: "2026-11-21" }, today), false);
    assert.equal(isPastItem({ kind: "article", ends_on: "2026-11-01" }, today), false);
  });
});

describe("orderEvents", () => {
  it("puts dated events into the event slots and leaves the rest", () => {
    const items = [
      { id: "B", kind: "event" },
      { id: "X", kind: "article" },
      { id: "A", kind: "event", starts_on: "2027-04-16" },
      { id: "C", kind: "event", starts_on: "2026-11-10" },
    ];
    assert.deepEqual(
      orderEvents(items).map((item) => item.id),
      ["C", "X", "A", "B"],
    );
  });

  it("returns a list with no dated events in the same order", () => {
    const items = [
      { id: "B", kind: "event" },
      { id: "X", kind: "article" },
      { id: "A", kind: "event", starts_on: null },
    ];
    assert.equal(orderEvents(items), items);
  });

  it("keeps equal dates in their original order", () => {
    const items = [
      { id: "A", kind: "event", starts_on: "2026-11-21" },
      { id: "X", kind: "article" },
      { id: "B", kind: "event", starts_on: "2026-11-21" },
    ];
    assert.deepEqual(
      orderEvents(items).map((item) => item.id),
      ["A", "X", "B"],
    );
  });
});

describe("whenLabelFor", () => {
  it("formats one day and a range", () => {
    assert.equal(whenLabelFor("2026-11-21"), "Saturday, November 21, 2026");
    assert.equal(whenLabelFor("2026-11-21", "2026-11-21"), "Saturday, November 21, 2026");
    assert.equal(whenLabelFor("2027-04-15", "2027-04-17"), "Thursday–Saturday, April 15–17, 2027");
    assert.equal(whenLabelFor("2027-04-30", "2027-05-02"), "Friday, April 30 – Sunday, May 2, 2027");
    assert.equal(whenLabelFor("2026-12-31", "2027-01-01"), "Thursday, December 31, 2026 – Friday, January 1, 2027");
    assert.equal(whenLabelFor(null, "2026-11-21"), null);
    assert.equal(whenLabelFor(undefined, undefined), null);
  });
});

describe("withWhenText", () => {
  it("fills a blank when line from the dates and leaves any other item", () => {
    const labeled = { when_label: "April 16, 2027 · 9:00 a.m.", starts_on: "2027-04-16", ends_on: null };
    assert.equal(withWhenText(labeled), labeled);
    assert.equal(withWhenText({ when_label: "", starts_on: "2026-11-21", ends_on: null }).when_label, "Saturday, November 21, 2026");
    assert.equal(withWhenText({ when_label: null, starts_on: "2026-11-21", ends_on: null }).when_label, "Saturday, November 21, 2026");
    const undated = { when_label: null, starts_on: null, ends_on: null };
    assert.equal(withWhenText(undated), undated);
    assert.equal(undated.when_label, null);
    const blank = { when_label: "", starts_on: null, ends_on: null };
    assert.equal(withWhenText(blank), blank);
    assert.equal(blank.when_label, "");
  });
});
