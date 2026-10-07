import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deploymentBanner } from "./deployment-banner.ts";

const COPY_URL = "postgresql://ep-example-copy-e5f6a7b8-pooler.c-0.us-east-2.aws.neon.tech/neondb";
const LIVE_URL = "postgresql://ep-example-main-a1b2c3d4-pooler.c-0.us-east-2.aws.neon.tech/neondb";
const PRODUCTION = "ep-example-main-a1b2c3d4";

describe("deploymentBanner", () => {
  it("is quiet on production", () => {
    assert.equal(deploymentBanner({ VERCEL_ENV: "production" }), null);
  });

  it("calls a computer with no database a test copy", () => {
    assert.equal(deploymentBanner({}), "test");
    assert.equal(deploymentBanner({ DATABASE_URL: "  " }), "test");
  });

  it("names a preview of a different endpoint a copy", () => {
    assert.equal(
      deploymentBanner({
        VERCEL_ENV: "preview",
        DATABASE_URL: COPY_URL,
        PRODUCTION_DB_ENDPOINT: PRODUCTION,
      }),
      "copy",
    );
  });

  it("names a preview of the live endpoint live", () => {
    assert.equal(
      deploymentBanner({
        VERCEL_ENV: "preview",
        DATABASE_URL: LIVE_URL,
        PRODUCTION_DB_ENDPOINT: PRODUCTION,
      }),
      "live",
    );
  });

  it("is unknown when a preview cannot name the live endpoint", () => {
    assert.equal(deploymentBanner({ VERCEL_ENV: "preview", DATABASE_URL: COPY_URL }), "unknown");
  });

  it("is unknown when a database is set and the environment is not named", () => {
    assert.equal(deploymentBanner({ DATABASE_URL: LIVE_URL }), "unknown");
  });
});
