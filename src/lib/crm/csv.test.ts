import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, csvRow } from "./csv.ts";

describe("csvCell", () => {
  it("quotes a plain name", () => {
    assert.equal(csvCell("Fr. John"), '"Fr. John"');
  });

  it("doubles quotes inside a cell", () => {
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  });

  it("prefixes a leading formula character", () => {
    assert.equal(csvCell("=1+1"), "\"'=1+1\"");
    assert.equal(csvCell("+1"), "\"'+1\"");
    assert.equal(csvCell("-1"), "\"'-1\"");
    assert.equal(csvCell("@x"), "\"'@x\"");
    assert.equal(csvCell("\tx"), "\"'\tx\"");
    assert.equal(csvCell("\rx"), "\"'\rx\"");
  });

  it("leaves an equals sign alone when it is not the first character", () => {
    assert.equal(csvCell("a=b"), '"a=b"');
  });

  it("quotes null and undefined as empty cells", () => {
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(undefined), '""');
  });

  it("quotes a number", () => {
    assert.equal(csvCell(2), '"2"');
  });

  it("neutralizes a hyperlink formula and doubles its quotes", () => {
    assert.equal(csvCell('=HYPERLINK("x")'), "\"'=HYPERLINK(\"\"x\"\")\"");
  });

  it("joins a row of cells", () => {
    assert.equal(csvRow(["Dr.", "Ann", 2]), '"Dr.","Ann","2"');
  });
});
