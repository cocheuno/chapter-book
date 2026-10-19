import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canWrite } from "./access.ts";

describe("canWrite", () => {
  it("allows an admin and an editor", () => {
    assert.equal(canWrite("admin"), true);
    assert.equal(canWrite("editor"), true);
  });

  it("refuses a viewer and any other role", () => {
    assert.equal(canWrite("viewer"), false);
    assert.equal(canWrite(""), false);
    assert.equal(canWrite("guest"), false);
  });
});
