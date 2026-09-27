import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalDetailPaths, eventPageLink, matchingEventPage, samePublicEventKey } from "./event-link.ts";

const page = { id: "page-1", title: "AI conference", kind: "event" as const, slug: "ai-conference", published: true };
const other = { id: "page-2", title: "Gold Mass", kind: "event" as const, slug: "gold-mass", published: true };

describe("event web page link", () => {
  it("reuses the page already linked, or one with the same title", () => {
    assert.equal(matchingEventPage([page, other], "Something else", "page-2"), "page-2");
    assert.equal(matchingEventPage([page, other], "AI conference", null), "page-1");
    assert.equal(matchingEventPage([page], "Parish supper", null), null);
  });

  it("sends the events list and the announcement to the page that has the details", () => {
    assert.equal(samePublicEventKey("Madison Gold Mass"), samePublicEventKey("Gold Mass · Madison"));
    assert.notEqual(samePublicEventKey("Gold Mass · Madison"), samePublicEventKey("Gold Mass · Milwaukee"));
    const paths = canonicalDetailPaths([
      {
        id: "ann",
        kind: "announcement",
        title: "Madison Gold Mass",
        slug: "gold-mass-madison-2",
        summary: "<section><p>Parking on Gorham Street.</p></section>",
        body: null,
      },
      {
        id: "ev",
        kind: "event",
        title: "Gold Mass · Madison",
        slug: "gold-mass-madison-2-2",
        summary: "Followed by luncheon.",
        body: null,
      },
      {
        id: "mil",
        kind: "event",
        title: "Gold Mass · Milwaukee",
        slug: "gold-mass-milwaukee",
        summary: "Dinner after Mass.",
        body: null,
      },
    ]);
    assert.equal(paths.get("ann"), "/p/gold-mass-madison-2");
    assert.equal(paths.get("ev"), "/p/gold-mass-madison-2");
    assert.equal(paths.get("mil"), undefined);
  });

  it("links an announcement only to a published page", () => {
    assert.deepEqual(eventPageLink([page, other], "page-1"), {
      href: "/p/ai-conference",
      title: "AI conference",
    });
    assert.equal(eventPageLink([{ ...page, published: false }], "page-1"), null);
    assert.equal(eventPageLink([page], null), null);
  });
});
