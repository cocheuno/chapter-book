import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FEED_CACHE_CONTROL, publicSiteCorsHeaders } from "./public-cors.ts";

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

  it("defaults Cache-Control to no-store", () => {
    const h = publicSiteCorsHeaders(new Request("https://chapter-book.example/api/public-site"));
    assert.equal(h.get("Cache-Control"), "no-store");
  });

  it("uses the feed cache policy", () => {
    const h = publicSiteCorsHeaders(
      new Request("https://chapter-book.example/api/public-site", {
        headers: { origin: "https://scs-wisconsin-usa.org" },
      }),
      "feed",
    );
    assert.equal(h.get("Cache-Control"), FEED_CACHE_CONTROL);
  });

  it("sends Vary Origin for an allowed origin, a refused origin, and no origin", () => {
    const allowed = publicSiteCorsHeaders(
      new Request("https://chapter-book.example/api/public-site", {
        headers: { origin: "https://scs-wisconsin-usa.org" },
      }),
    );
    const refused = publicSiteCorsHeaders(
      new Request("https://chapter-book.example/api/public-site", {
        headers: { origin: "https://evil.example" },
      }),
    );
    const bare = publicSiteCorsHeaders(new Request("https://chapter-book.example/api/public-site"));
    assert.equal(allowed.get("Vary"), "Origin");
    assert.equal(refused.get("Vary"), "Origin");
    assert.equal(bare.get("Vary"), "Origin");
    assert.equal(allowed.get("Access-Control-Allow-Origin"), "https://scs-wisconsin-usa.org");
    assert.equal(refused.get("Access-Control-Allow-Origin"), null);
    assert.equal(bare.get("Access-Control-Allow-Origin"), null);
  });
});
