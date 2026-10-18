import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forgottenLabel, nameMatches } from "./forget-rules.ts";

describe("forgottenLabel", () => {
  it("uses the first eight characters of the id", () => {
    assert.equal(forgottenLabel("11111111-2222-3333-4444-555555555555"), "Removed person 11111111");
    assert.equal(forgottenLabel("99999999-2222-3333-4444-555555555555"), "Removed person 99999999");
    assert.notEqual(
      forgottenLabel("11111111-2222-3333-4444-555555555555"),
      forgottenLabel("99999999-2222-3333-4444-555555555555"),
    );
    assert.equal(forgottenLabel("short"), "Removed person short");
  });
});

describe("nameMatches", () => {
  it("compares the trimmed names without case", () => {
    assert.equal(nameMatches("  Ada Example  ", "ada example"), true);
    assert.equal(nameMatches("ADA EXAMPLE", "Ada Example"), true);
    assert.equal(nameMatches("Ada", "Ada Example"), false);
    assert.equal(nameMatches("  ", "Ada Example"), false);
    assert.equal(nameMatches("Ben Example", "Ada Example"), false);
  });
});
