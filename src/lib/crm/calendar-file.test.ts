import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarFile, calendarHref, icsText } from "./calendar-file.ts";

const now = new Date("2026-10-10T15:04:05Z");

function file(partial: Partial<Parameters<typeof calendarFile>[0]> = {}) {
  return calendarFile({
    uid: "item@chapter-book",
    title: "Gold Mass",
    location: null,
    description: null,
    url: null,
    startsOn: "2027-04-16",
    endsOn: null,
    timed: null,
    now,
    ...partial,
  });
}

function linesOf(text: string): string[] {
  assert.equal(text.endsWith("\r\n"), true);
  const bare = text.replaceAll("\r\n", "");
  assert.equal(bare.includes("\n"), false);
  assert.equal(bare.includes("\r"), false);
  const lines = text.split("\r\n").slice(0, -1);
  for (const line of lines) {
    assert.ok(Buffer.byteLength(line) <= 75, `line longer than 75 octets: ${line}`);
  }
  return text.replaceAll("\r\n ", "").split("\r\n").slice(0, -1);
}

describe("calendarHref", () => {
  it("links a published dated event and nothing else", () => {
    assert.equal(
      calendarHref({ kind: "event", slug: "gold-mass", starts_on: "2027-04-16" }),
      "/p/gold-mass/calendar.ics",
    );
    assert.equal(
      calendarHref({ kind: "event", slug: "gold-mass", starts_on: "2027-04-16", published: true }),
      "/p/gold-mass/calendar.ics",
    );
    assert.equal(calendarHref({ kind: "article", slug: "talk", starts_on: "2027-04-16" }), null);
    assert.equal(calendarHref({ kind: "event", slug: "gold-mass", starts_on: null }), null);
    assert.equal(calendarHref({ kind: "event", slug: "gold-mass" }), null);
    assert.equal(
      calendarHref({ kind: "event", slug: "gold-mass", starts_on: "2027-04-16", published: false }),
      null,
    );
    assert.equal(calendarHref({ kind: "event", slug: null, starts_on: "2027-04-16" }), null);
    assert.equal(calendarHref({ kind: "event", slug: "", starts_on: "2027-04-16" }), null);
  });
});

describe("icsText", () => {
  it("escapes commas, semicolons, backslashes, and line breaks", () => {
    assert.equal(icsText("Faith, Reason; AI \\ Q&A\nDay 2"), "Faith\\, Reason\\; AI \\\\ Q&A\\nDay 2");
  });
});

describe("calendarFile", () => {
  it("writes a one-day all-day event through the next date", () => {
    const lines = linesOf(file());
    assert.ok(lines.includes("DTSTART;VALUE=DATE:20270416"));
    assert.ok(lines.includes("DTEND;VALUE=DATE:20270417"));
    assert.equal(lines.includes("DTSTART:20270416T000000Z"), false);
  });

  it("ends a multi-day event on the day after the last date", () => {
    const lines = linesOf(file({ startsOn: "2027-04-15", endsOn: "2027-04-17" }));
    assert.ok(lines.includes("DTSTART;VALUE=DATE:20270415"));
    assert.ok(lines.includes("DTEND;VALUE=DATE:20270418"));
  });

  it("rolls a New Year's Eve event into the next year", () => {
    const lines = linesOf(file({ startsOn: "2027-12-31", endsOn: null }));
    assert.ok(lines.includes("DTSTART;VALUE=DATE:20271231"));
    assert.ok(lines.includes("DTEND;VALUE=DATE:20280101"));
  });

  it("writes a timed event in UTC, and omits DTEND when there is no later end", () => {
    const timed = linesOf(
      file({
        timed: { startsAt: "2027-04-17T00:00:00Z", endsAt: "2027-04-17T01:30:00Z" },
      }),
    );
    assert.ok(timed.includes("DTSTART:20270417T000000Z"));
    assert.ok(timed.includes("DTEND:20270417T013000Z"));
    assert.equal(timed.some((line) => line.includes("VALUE=DATE")), false);

    const open = linesOf(file({ timed: { startsAt: "2027-04-17T00:00:00Z", endsAt: null } }));
    assert.ok(open.includes("DTSTART:20270417T000000Z"));
    assert.equal(open.some((line) => line.startsWith("DTEND")), false);
  });

  it("leaves out location, description, and url when they are null", () => {
    const lines = linesOf(file());
    assert.equal(lines.some((line) => line.startsWith("LOCATION:")), false);
    assert.equal(lines.some((line) => line.startsWith("DESCRIPTION:")), false);
    assert.equal(lines.some((line) => line.startsWith("URL:")), false);
  });

  it("folds a long title on UTF-8 boundaries and unfolds to the escaped text", () => {
    const title = `Café, Reason — ${"N".repeat(185)}`;
    assert.equal(title.length, 200);
    assert.equal(title.includes("é"), true);
    assert.equal(title.includes("—"), true);
    const text = file({ title });
    const lines = linesOf(text);
    const summary = lines.find((line) => line.startsWith("SUMMARY:"));
    assert.equal(summary, `SUMMARY:${icsText(title)}`);
    assert.ok(text.includes("\r\n "));
  });
});
