import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { onPublicShelf } from "./shelf.ts";

describe("onPublicShelf", () => {
  it("leaves a talk off the public shelf when the editor unticked it", () => {
    const talk = { kind: "article", conference_id: "conf", on_shelf: false };
    assert.equal(onPublicShelf(talk), false);
  });

  it("keeps a talk on the public shelf when the box stays ticked", () => {
    const talk = { kind: "article", conference_id: "conf", on_shelf: true };
    assert.equal(onPublicShelf(talk), true);
  });

  it("keeps a notice on the public shelf", () => {
    const notice = { kind: "announcement", conference_id: "conf", on_shelf: true };
    assert.equal(onPublicShelf(notice), true);
  });

  it("keeps an item when on_shelf was not set", () => {
    assert.equal(onPublicShelf({}), true);
  });
});
