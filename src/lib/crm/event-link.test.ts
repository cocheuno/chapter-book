import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eventPageLink, matchingEventPage } from "./event-link.ts";

const page = { id: "page-1", title: "AI conference", kind: "event" as const, slug: "ai-conference", published: true };
const other = { id: "page-2", title: "Gold Mass", kind: "event" as const, slug: "gold-mass", published: true };

describe("event web page link", () => {
  it("reuses the page already linked, or one with the same title", () => {
    assert.equal(matchingEventPage([page, other], "Something else", "page-2"), "page-2");
    assert.equal(matchingEventPage([page, other], "AI conference", null), "page-1");
    assert.equal(matchingEventPage([page], "Parish supper", null), null);
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
