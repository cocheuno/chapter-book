import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mayExportNametags,
  mayPreviewMail,
  maySetBookRegistration,
  operatorDirectory,
} from "./handler-roles.ts";

describe("exportNametags", () => {
  it("allows an admin and an editor, and refuses a viewer", () => {
    assert.equal(mayExportNametags("admin"), true);
    assert.equal(mayExportNametags("editor"), true);
    assert.equal(mayExportNametags("viewer"), false);
  });
});

describe("previewMail", () => {
  it("allows an admin and an editor, and refuses a viewer", () => {
    assert.equal(mayPreviewMail("admin"), true);
    assert.equal(mayPreviewMail("editor"), true);
    assert.equal(mayPreviewMail("viewer"), false);
  });
});

describe("setBookRegistration", () => {
  it("allows an admin and refuses an editor and a viewer", () => {
    assert.equal(maySetBookRegistration("admin"), true);
    assert.equal(maySetBookRegistration("editor"), false);
    assert.equal(maySetBookRegistration("viewer"), false);
  });
});

describe("listOperators", () => {
  it("gives an admin the full directory and everyone else names and roles", () => {
    assert.equal(operatorDirectory("admin"), "full");
    assert.equal(operatorDirectory("editor"), "names");
    assert.equal(operatorDirectory("viewer"), "names");
  });
});
