import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFERENCE_SECTIONS,
  moveSection,
  parseSectionOrder,
  serializeSectionOrder,
} from "./section-order.ts";

const defaults = CONFERENCE_SECTIONS.map((section) => section.key);

describe("conference section order", () => {
  it("lists today's sections in the order the page already uses", () => {
    assert.deepEqual(
      CONFERENCE_SECTIONS.map((section) => [section.key, section.label]),
      [
        ["program", "Program (agenda)"],
        ["speakers", "Speakers"],
        ["workshops", "Workshops"],
        ["notes", "Practical notes"],
        ["about", "The gathering"],
        ["visit", "When and where"],
      ],
    );
  });

  it("uses the default order when nothing is saved", () => {
    assert.deepEqual(parseSectionOrder(null), defaults);
    assert.deepEqual(parseSectionOrder(undefined), defaults);
    assert.deepEqual(parseSectionOrder(""), defaults);
    assert.deepEqual(parseSectionOrder("   "), defaults);
  });

  it("keeps a saved order and fills in the sections that were left out", () => {
    assert.deepEqual(parseSectionOrder("about,speakers,program"), [
      "about",
      "speakers",
      "program",
      "workshops",
      "notes",
      "visit",
    ]);
  });

  it("drops unknown and repeated keys", () => {
    assert.deepEqual(parseSectionOrder("Speakers, nope, speakers, ABOUT"), [
      "speakers",
      "about",
      "program",
      "workshops",
      "notes",
      "visit",
    ]);
  });

  it("stores the default order as null", () => {
    assert.equal(serializeSectionOrder(defaults), null);
    assert.equal(serializeSectionOrder(parseSectionOrder(null)), null);
  });

  it("stores a custom order as a comma list", () => {
    const keys = parseSectionOrder("about,speakers,program");
    assert.equal(serializeSectionOrder(keys), "about,speakers,program,workshops,notes,visit");
  });

  it("does not move the first section up or the last section down", () => {
    const keys = [...defaults];
    assert.deepEqual(moveSection(keys, "program", "up"), defaults);
    assert.deepEqual(moveSection(keys, "visit", "down"), defaults);
    assert.deepEqual(keys, defaults);
  });

  it("moves a section one step", () => {
    assert.deepEqual(moveSection(defaults, "speakers", "up"), [
      "speakers",
      "program",
      "workshops",
      "notes",
      "about",
      "visit",
    ]);
    assert.deepEqual(moveSection(defaults, "notes", "down"), [
      "program",
      "speakers",
      "workshops",
      "about",
      "notes",
      "visit",
    ]);
  });
});
