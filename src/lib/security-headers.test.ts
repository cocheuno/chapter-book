import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySecurityHeaders, SECURITY_CSP_REPORT_ONLY } from "./security-headers.ts";

const ALWAYS = [
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
] as const;

function applied(betterAuthUrl: string | undefined, existing?: Headers): Headers {
  const headers = existing ?? new Headers();
  applySecurityHeaders(headers, betterAuthUrl);
  return headers;
}

describe("security headers", () => {
  it("sends the always headers when BETTER_AUTH_URL is unset", () => {
    const headers = applied(undefined);
    for (const [name, value] of ALWAYS) assert.equal(headers.get(name), value);
    assert.equal(headers.get("strict-transport-security"), null);
    assert.equal(headers.get("x-frame-options"), null);
    assert.equal(headers.get("content-security-policy-report-only"), null);
  });

  it("sends the always headers when BETTER_AUTH_URL is blank", () => {
    for (const url of ["", "  "]) {
      const headers = applied(url);
      for (const [name, value] of ALWAYS) assert.equal(headers.get(name), value);
      assert.equal(headers.get("strict-transport-security"), null);
      assert.equal(headers.get("x-frame-options"), null);
      assert.equal(headers.get("content-security-policy-report-only"), null);
    }
  });

  it("adds HSTS, framing denial, and the report-only policy when BETTER_AUTH_URL is set", () => {
    const headers = applied("https://chapter.example");
    for (const [name, value] of ALWAYS) assert.equal(headers.get(name), value);
    assert.equal(headers.get("strict-transport-security"), "max-age=31536000");
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(headers.get("content-security-policy-report-only"), SECURITY_CSP_REPORT_ONLY);
  });

  it("does not overwrite a header that is already present", () => {
    const headers = applied(
      "https://chapter.example",
      new Headers({
        "Access-Control-Allow-Origin": "https://scs-wisconsin-usa.org",
        "X-Frame-Options": "SAMEORIGIN",
      }),
    );
    assert.equal(headers.get("access-control-allow-origin"), "https://scs-wisconsin-usa.org");
    assert.equal(headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
  });
});
