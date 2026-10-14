import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addRecent, KIND_LABEL, parseRecent, type RecentItem } from "./nav-rules.ts";

function item(kind: RecentItem["kind"], id: string, label = id): RecentItem {
  const root = kind === "person" ? "people" : kind === "partner" ? "partners" : kind === "event" ? "events" : "mail";
  return { kind, id, label, href: `/${root}/${id}` };
}

describe("addRecent", () => {
  it("puts the new item first and drops the older copy of the same kind and id", () => {
    const older = item("person", "1", "Old");
    const other = item("event", "1", "Gathering");
    const next = item("person", "1", "New");
    const start = [older, other];
    assert.deepEqual(addRecent(start, next), [next, other]);
    assert.deepEqual(start, [older, other]);
  });

  it("keeps a different kind that shares the id", () => {
    const person = item("person", "1");
    const partner = item("partner", "1");
    assert.deepEqual(addRecent([person], partner), [partner, person]);
  });

  it("keeps at most max items, dropping the oldest", () => {
    const start = Array.from({ length: 8 }, (_, index) => item("letter", String(index)));
    const next = item("letter", "new", "New");
    const saved = addRecent(start, next);
    assert.equal(saved.length, 8);
    assert.equal(saved[0], next);
    assert.equal(
      saved.some((row) => row.id === "7"),
      false,
    );
    assert.deepEqual(addRecent(start, next, 2).map((row) => row.id), ["new", "0"]);
  });
});

describe("parseRecent", () => {
  it("returns items that match the shape", () => {
    const raw = JSON.stringify([
      { kind: "person", id: "p1", label: "Ada", href: "/people/p1", extra: true },
    ]);
    assert.deepEqual(parseRecent(raw), [{ kind: "person", id: "p1", label: "Ada", href: "/people/p1" }]);
  });

  it("drops garbage and never throws", () => {
    const mixed = JSON.stringify([
      null,
      "nope",
      { kind: "org", id: "1", label: "Org", href: "/partners/1" },
      { kind: "person", id: "", label: "Missing", href: "/people/x" },
      { kind: "person", id: "p2", label: "Outside", href: "https://example.com/people/p2" },
      { kind: "person", id: "p3", label: "Relative", href: "people/p3" },
      { kind: "letter", id: "m1", label: "Hello", href: "/mail/m1" },
    ]);
    assert.doesNotThrow(() => {
      parseRecent(null);
      parseRecent("{");
      parseRecent("null");
      parseRecent("42");
      parseRecent("{}");
      parseRecent(mixed);
    });
    assert.deepEqual(parseRecent(null), []);
    assert.deepEqual(parseRecent("{"), []);
    assert.deepEqual(parseRecent("null"), []);
    assert.deepEqual(parseRecent("42"), []);
    assert.deepEqual(parseRecent("{}"), []);
    assert.deepEqual(parseRecent(mixed), [{ kind: "letter", id: "m1", label: "Hello", href: "/mail/m1" }]);
  });
});

describe("KIND_LABEL", () => {
  it("names each kind", () => {
    assert.deepEqual(KIND_LABEL, {
      person: "Person",
      partner: "Partner",
      event: "Event",
      letter: "Letter",
    });
  });
});
