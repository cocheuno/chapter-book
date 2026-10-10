import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  biographyParagraphs,
  buildConferenceProgram,
  lineupFromSpeakers,
  pieceHref,
  programDays,
  speakerCardText,
  type ConferenceItem,
} from "./conference-page.ts";

function item(partial: Partial<ConferenceItem> & Pick<ConferenceItem, "id" | "kind" | "title">): ConferenceItem {
  return {
    subtitle: null,
    summary: null,
    url: null,
    when_label: null,
    audience: null,
    featured: false,
    slug: null,
    ...partial,
  };
}

describe("conference program", () => {
  it("groups talks into tracks and keeps keynotes out of those tracks", () => {
    const program = buildConferenceProgram([
      item({
        id: "k",
        kind: "article",
        title: "The human person and the machine",
        subtitle: "Dr. Ada More",
        audience: "Anthropology",
        featured: true,
      }),
      item({
        id: "a",
        kind: "article",
        title: "What the systems actually do",
        subtitle: "Dr. Ada More",
        audience: "How it works",
        when_label: "9:30 a.m.",
      }),
      item({
        id: "b",
        kind: "article",
        title: "Parish life and the tools",
        subtitle: "Fr. John Cole",
        audience: "How it works",
      }),
      item({
        id: "w",
        kind: "course",
        title: "A workshop for teachers",
        audience: "Classrooms",
      }),
      item({
        id: "n",
        kind: "document",
        title: "Campus map",
        url: "https://example.edu/map",
      }),
      item({
        id: "note",
        kind: "announcement",
        title: "Dinner follows the last session",
      }),
    ]);

    assert.deepEqual(
      program.keynotes.map((talk) => talk.id),
      ["k"],
    );
    assert.equal(program.tracks.length, 1);
    assert.equal(program.tracks[0]?.name, "How it works");
    assert.deepEqual(
      program.tracks[0]?.talks.map((talk) => talk.id),
      ["a", "b"],
    );
    assert.equal(program.speakers.length, 2);
    assert.equal(program.speakers[0]?.name, "Dr. Ada More");
    assert.equal(program.speakers[0]?.headshot, null);
    assert.deepEqual(
      program.speakers[0]?.talks.map((talk) => talk.title),
      ["The human person and the machine", "What the systems actually do"],
    );
    assert.deepEqual(
      program.topics.map((topic) => topic.name),
      ["Anthropology", "How it works", "Classrooms"],
    );
    assert.equal(program.topics[0]?.anchor, "keynotes");
    assert.equal(program.topics[2]?.anchor, "workshops");
    assert.equal(program.workshops.length, 1);
    assert.equal(program.notes.length, 1);
    assert.equal(program.notices.length, 1);
  });

  it("skips a speaker row when the talk has no speaker line", () => {
    const program = buildConferenceProgram([
      item({ id: "a", kind: "article", title: "Untitled chair", subtitle: "   " }),
    ]);
    assert.equal(program.speakers.length, 0);
    assert.equal(program.tracks[0]?.name, "Sessions");
  });

  it("uses an uploaded headshot and ignores a web address", () => {
    const program = buildConferenceProgram([
      item({
        id: "a",
        kind: "article",
        title: "Opening",
        subtitle: "Ada More",
        image_id: "https://example.edu/ada.jpg",
      }),
      item({
        id: "b",
        kind: "article",
        title: "Second talk",
        subtitle: "Ada More",
        image_id: "11111111-1111-4111-8111-111111111111",
      }),
    ]);
    assert.equal(program.speakers[0]?.headshot, "/api/site-image/11111111-1111-4111-8111-111111111111");
  });

  it("splits a speaker line into a name and a role, and gives the portrait a stable address", () => {
    assert.deepEqual(speakerCardText("Ada More, professor of physics"), {
      title: "Ada More",
      line: "professor of physics",
    });
    const program = buildConferenceProgram([
      item({
        id: "a",
        kind: "article",
        title: "Opening",
        subtitle: "Ada More, professor of physics",
        body: "A short biography.",
      }),
    ]);
    assert.equal(program.speakers[0]?.slug, "ada-more");
    assert.equal(program.speakers[0]?.title, "Ada More");
    assert.equal(program.speakers[0]?.bio, "A short biography.");
  });

  it("keeps biography paragraph breaks that were typed", () => {
    const program = buildConferenceProgram([
      item({
        id: "a",
        kind: "article",
        title: "Opening",
        subtitle: "Ada More",
        body: "First paragraph.\n\nSecond paragraph.\nThird paragraph.",
      }),
    ]);
    assert.deepEqual(biographyParagraphs(program.speakers[0]?.bio), [
      "First paragraph.",
      "Second paragraph.",
      "Third paragraph.",
    ]);
  });

  it("keeps the first speaker when a second speaker is added", () => {
    const talks = [
      item({ id: "talk-1", kind: "article", title: "Opening", subtitle: "Ada More" }),
      item({ id: "talk-2", kind: "article", title: "Closing", subtitle: "John Cole" }),
    ];
    const lineup = lineupFromSpeakers(
      [
        { name: "Ada More", role: "professor of physics", body: "First biography.", imageId: null, talkIds: ["talk-1"] },
        { name: "John Cole", role: "parish priest", body: "Second biography.", imageId: null, talkIds: ["talk-2"] },
      ],
      talks,
    );
    assert.deepEqual(
      lineup.map((speaker) => speaker.title),
      ["Ada More", "John Cole"],
    );
    assert.equal(lineup[0]?.bio, "First biography.");
    assert.equal(lineup[1]?.talks[0]?.title, "Closing");
  });

  it("links a shelf page before an external url", () => {
    assert.equal(pieceHref({ slug: "opening", url: "https://example.edu" }), "/p/opening");
    assert.equal(pieceHref({ slug: null, url: "example.edu/rsvp" }), "https://example.edu/rsvp");
    assert.equal(pieceHref({ slug: null, url: null }), null);
  });
});

describe("programDays", () => {
  const zone = "America/Chicago";

  it("is null when there are no talks", () => {
    assert.equal(programDays([], {}, zone), null);
    assert.equal(
      programDays(
        [
          item({ id: "w", kind: "course", title: "Workshop" }),
          item({ id: "n", kind: "document", title: "Note" }),
          item({ id: "a", kind: "announcement", title: "Notice" }),
        ],
        {},
        zone,
      ),
      null,
    );
  });

  it("is null when one of three talks has no time", () => {
    const talks = [
      item({ id: "a", kind: "article", title: "One" }),
      item({ id: "b", kind: "article", title: "Two" }),
      item({ id: "c", kind: "article", title: "Three" }),
    ];
    assert.equal(
      programDays(
        talks,
        {
          a: "2027-04-15T14:30:00Z",
          c: "2027-04-17T15:00:00Z",
        },
        zone,
      ),
      null,
    );
  });

  it("groups Chicago times into Thursday, Friday, and Saturday", () => {
    const days = programDays(
      [
        item({ id: "open", kind: "article", title: "Opening", featured: true, audience: "Anthropology" }),
        item({ id: "late", kind: "article", title: "Late session", audience: "How it works" }),
        item({ id: "noon", kind: "article", title: "Midday", audience: "Parish" }),
        item({ id: "sat", kind: "article", title: "Saturday talk" }),
        item({ id: "workshop", kind: "course", title: "A workshop" }),
        item({ id: "note", kind: "document", title: "A note" }),
        item({ id: "news", kind: "announcement", title: "A notice" }),
      ],
      {
        open: "2027-04-15T14:30:00Z",
        late: "2027-04-16T04:30:00Z",
        noon: "2027-04-16T17:00:00Z",
        sat: "2027-04-17T15:00:00Z",
        workshop: "2027-04-15T14:30:00Z",
      },
      zone,
    );
    assert.ok(days);
    assert.deepEqual(
      days.map((day) => ({
        key: day.key,
        name: day.name,
        heading: day.heading,
        anchor: day.anchor,
        talks: day.talks.map((row) => ({ id: row.talk.id, time: row.time, featured: row.talk.featured })),
      })),
      [
        {
          key: "2027-04-15",
          name: "Thursday",
          heading: "Thursday, April 15",
          anchor: "day-2027-04-15",
          talks: [
            { id: "open", time: "9:30 a.m.", featured: true },
            { id: "late", time: "11:30 p.m.", featured: false },
          ],
        },
        {
          key: "2027-04-16",
          name: "Friday",
          heading: "Friday, April 16",
          anchor: "day-2027-04-16",
          talks: [{ id: "noon", time: "12:00 p.m.", featured: false }],
        },
        {
          key: "2027-04-17",
          name: "Saturday",
          heading: "Saturday, April 17",
          anchor: "day-2027-04-17",
          talks: [{ id: "sat", time: "10:00 a.m.", featured: false }],
        },
      ],
    );
    const ids = days.flatMap((day) => day.talks.map((row) => row.talk.id));
    assert.equal(ids.includes("workshop"), false);
    assert.equal(ids.includes("note"), false);
    assert.equal(ids.includes("news"), false);
    assert.equal(ids.includes("open"), true);
  });

  it("orders two talks on one day by time when they are given in reverse", () => {
    const days = programDays(
      [
        item({ id: "later", kind: "article", title: "Later" }),
        item({ id: "earlier", kind: "article", title: "Earlier" }),
      ],
      {
        later: "2027-04-16T17:00:00Z",
        earlier: "2027-04-16T15:00:00Z",
      },
      zone,
    );
    assert.deepEqual(
      days?.[0]?.talks.map((row) => row.talk.id),
      ["earlier", "later"],
    );
  });
});
