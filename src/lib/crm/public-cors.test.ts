import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicSiteCorsHeaders } from "./public-cors.ts";

describe("public site CORS", () => {
  it("allows the chapter domain", () => {
    const h = publicSiteCorsHeaders(
      new Request("https://chapter-book.example/api/public-site", {
        headers: { origin: "https://scs-wisconsin-usa.org" },
      }),
    );
    assert.equal(h.get("Access-Control-Allow-Origin"), "https://scs-wisconsin-usa.org");
  });

  it("does not allow an arbitrary origin", () => {
    const h = publicSiteCorsHeaders(
      new Request("https://chapter-book.example/api/public-site", {
        headers: { origin: "https://evil.example" },
      }),
    );
    assert.equal(h.get("Access-Control-Allow-Origin"), null);
  });
});
