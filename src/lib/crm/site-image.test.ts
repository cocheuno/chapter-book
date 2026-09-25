import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { siteImageBytes, siteImageSrc, sniffSiteImage } from "./site-image.ts";

function bytes(list: number[]) {
  return Uint8Array.from(list);
}

describe("site images", () => {
  it("recognizes jpeg, png, gif, and webp headers", () => {
    const pad = Array.from({ length: 16 }, () => 0);
    assert.equal(sniffSiteImage(bytes([0xff, 0xd8, 0xff, ...pad])), "image/jpeg");
    assert.equal(sniffSiteImage(bytes([0x89, 0x50, 0x4e, 0x47, ...pad])), "image/png");
    assert.equal(sniffSiteImage(bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...pad])), "image/gif");
    assert.equal(
      sniffSiteImage(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...pad])),
      "image/webp",
    );
  });

  it("rejects html, a short file, and a remote address", () => {
    assert.equal(sniffSiteImage(bytes([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0, 0, 0, 0, 0, 0, 0])), null);
    assert.equal(sniffSiteImage(bytes([0xff, 0xd8])), null);
    assert.equal(siteImageSrc("https://example.edu/a.jpg"), null);
    assert.equal(siteImageSrc("../secret"), null);
    assert.equal(
      siteImageSrc("11111111-1111-4111-8111-111111111111"),
      "/api/site-image/11111111-1111-4111-8111-111111111111",
    );
  });

  it("reads a hex bytea string", () => {
    const out = siteImageBytes("\\xffd8ff");
    assert.deepEqual(out ? Array.from(out) : null, [0xff, 0xd8, 0xff]);
  });
});
