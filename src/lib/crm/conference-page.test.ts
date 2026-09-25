import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildConferenceProgram, pieceHref, speakerCardText, type ConferenceItem } from "./conference-page.ts";

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

  it("links a shelf page before an external url", () => {
    assert.equal(pieceHref({ slug: "opening", url: "https://example.edu" }), "/p/opening");
    assert.equal(pieceHref({ slug: null, url: "example.edu/rsvp" }), "https://example.edu/rsvp");
    assert.equal(pieceHref({ slug: null, url: null }), null);
  });
});
