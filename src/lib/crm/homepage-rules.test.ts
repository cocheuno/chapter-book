import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_SECTIONS,
  homeBadges,
  homeSectionLabel,
  moveItem,
  moveKey,
  parseHomeSections,
  pickTopItem,
  serializeHomeSections,
} from "./homepage-rules.ts";

const today = "2026-11-21";
const todayOrder = ["event", "announcement", "article", "document", "course"] as const;

function event(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    kind: "event",
    title,
    featured: false,
    sort_order: 0,
    starts_on: null as string | null,
    ends_on: null as string | null,
    ...extra,
  };
}

describe("HOME_SECTIONS", () => {
  it("lists today's /site blocks", () => {
    assert.deepEqual(
      HOME_SECTIONS.map((section) => section.key),
      [...todayOrder],
    );
    assert.deepEqual(
      HOME_SECTIONS.map((section) => section.label),
      ["Upcoming Events", "Announcements", "Articles", "Documents", "Courses"],
    );
    assert.equal(homeSectionLabel("article"), "Articles");
    assert.equal(homeSectionLabel("missing"), "missing");
  });
});

describe("parseHomeSections", () => {
  it("no settings give no top item and today's section order", () => {
    const shelf = [event("gold", "Gold Mass", { featured: true, starts_on: "2026-12-01" })];
    assert.equal(pickTopItem(shelf, {}, today), null);
    assert.equal(pickTopItem(shelf, { topAuto: false, topItemId: null }, today), null);
    assert.deepEqual(parseHomeSections(null), [...todayOrder]);
    assert.deepEqual(parseHomeSections(""), [...todayOrder]);
    assert.deepEqual(parseHomeSections("   "), [...todayOrder]);
  });

  it("drops unknown and repeated keys, then appends the missing blocks", () => {
    assert.deepEqual(parseHomeSections("course, event, event, bogus, course"), [
      "course",
      "event",
      "announcement",
      "article",
      "document",
    ]);
    assert.equal(
      serializeHomeSections(parseHomeSections("article,document")),
      "article,document,event,announcement,course",
    );
    assert.equal(serializeHomeSections([...todayOrder]), todayOrder.join(","));
  });
});

describe("moveKey", () => {
  const order = [...todayOrder];

  it("swaps with the neighbor and stays put at either end", () => {
    assert.deepEqual(moveKey(order, "announcement", "up"), [
      "announcement",
      "event",
      "article",
      "document",
      "course",
    ]);
    assert.deepEqual(moveKey(order, "article", "down"), [
      "event",
      "announcement",
      "document",
      "article",
      "course",
    ]);
    assert.deepEqual(moveKey(order, "event", "up"), order);
    assert.deepEqual(moveKey(order, "course", "down"), order);
    assert.deepEqual(moveKey(order, "nope", "up"), order);
  });
});

describe("pickTopItem", () => {
  const shelf = [
    event("past", "Past Mass", { featured: true, starts_on: "2026-11-01", sort_order: 0 }),
    event("early", "Early Mass", { featured: true, starts_on: "2026-11-22", sort_order: 5 }),
    event("zeta", "Zeta Mass", { featured: true, starts_on: "2026-12-01", sort_order: 2 }),
    event("alpha", "Alpha Mass", { featured: true, starts_on: "2026-12-01", sort_order: 2 }),
    event("first", "First Mass", { featured: true, starts_on: "2026-12-01", sort_order: 1 }),
    event("plain", "Plain Mass", { featured: false, starts_on: "2026-11-22", sort_order: 0 }),
    event("open", "Open Mass", { featured: true, sort_order: 0 }),
    {
      id: "note",
      kind: "announcement",
      title: "Chapter note",
      featured: true,
      sort_order: 0,
      starts_on: "2026-11-01",
      ends_on: "2026-12-01",
    },
    {
      id: "old-note",
      kind: "announcement",
      title: "Old note",
      featured: false,
      sort_order: 1,
      starts_on: null,
      ends_on: "2026-11-01",
    },
  ];

  it("picks the earliest featured event that is not past, then sort_order, then title", () => {
    assert.equal(pickTopItem(shelf, { topAuto: true }, today)?.id, "early");
    const tied = shelf.filter((item) => item.starts_on === "2026-12-01" && item.featured);
    assert.equal(pickTopItem(tied, { topAuto: true }, today)?.id, "first");
    const sameOrder = tied.filter((item) => item.sort_order === 2);
    assert.equal(pickTopItem(sameOrder, { topAuto: true }, today)?.id, "alpha");
    assert.equal(pickTopItem([shelf[5], shelf[6]], { topAuto: true }, today), null);
  });

  it("uses a chosen item only while it is on the shelf and not past", () => {
    assert.equal(pickTopItem(shelf, { topItemId: "note" }, today)?.id, "note");
    assert.equal(pickTopItem(shelf, { topItemId: "past" }, today), null);
    assert.equal(pickTopItem(shelf, { topItemId: "old-note" }, today), null);
    assert.equal(pickTopItem(shelf, { topItemId: "missing" }, today), null);
    assert.equal(pickTopItem(shelf, { topAuto: true, topItemId: "note" }, today)?.id, "early");
  });
});

describe("moveItem", () => {
  const ids = ["a", "b", "c"];

  it("swaps with the neighbor and stays put at either end", () => {
    assert.deepEqual(moveItem(ids, "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(moveItem(ids, "b", "down"), ["a", "c", "b"]);
    assert.deepEqual(moveItem(ids, "a", "up"), ids);
    assert.deepEqual(moveItem(ids, "c", "down"), ids);
    assert.deepEqual(moveItem(ids, "missing", "down"), ids);
  });
});

describe("homeBadges", () => {
  it("marks a published event with no date, and an item kept off the homepage", () => {
    assert.deepEqual(homeBadges({ kind: "event", published: true, starts_on: null, on_shelf: true }, today), [
      "No date",
    ]);
    assert.deepEqual(homeBadges({ kind: "event", published: false, starts_on: null, on_shelf: true }, today), []);
    assert.deepEqual(
      homeBadges({ kind: "event", published: true, starts_on: "2026-12-01", on_shelf: true }, today),
      [],
    );
    assert.deepEqual(homeBadges({ kind: "article", published: true, on_shelf: false }, today), ["Not on homepage"]);
    assert.deepEqual(
      homeBadges({ kind: "event", published: true, starts_on: null, on_shelf: false }, today),
      ["No date", "Not on homepage"],
    );
  });
});
