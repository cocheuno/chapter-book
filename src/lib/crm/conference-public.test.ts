import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chooseConferenceItem } from "./conference-page.ts";

const ai = {
  id: "page-ai",
  title: "Faith, Reason, and AI — Putting Humanity First in the Age of Intelligent Machines",
  kind: "event",
  layout: "conference",
};
const mass = { id: "page-mass", title: "Gold Mass · Milwaukee", kind: "event", layout: "page" };

describe("choose conference page", () => {
  it("keeps the page already linked to this event", () => {
    assert.equal(chooseConferenceItem([ai, mass], "AI conference", "page-ai"), "page-ai");
  });

  it("uses the only conference page when the event title differs", () => {
    assert.equal(chooseConferenceItem([ai, mass], "AI conference", null), "page-ai");
  });

  it("does not guess when two conference pages exist", () => {
    const other = { ...ai, id: "page-other", title: "Another conference" };
    assert.equal(chooseConferenceItem([ai, other], "Spring meeting", null), null);
  });
});
