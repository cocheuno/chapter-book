import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAIL_TEMPLATE_SEEDS, toHonorificGreeting, toSalutationGreeting } from "./templates.ts";

describe("mail template greetings", () => {
  it("seeds a new chapter with the salutation field", () => {
    assert.equal(MAIL_TEMPLATE_SEEDS.length, 10);
    for (const seed of MAIL_TEMPLATE_SEEDS) {
      assert.equal(seed.body.startsWith("{{salutation}},"), true, seed.key);
      assert.equal(seed.body.includes("{{honorific}}"), false, seed.key);
    }
  });

  it("round-trips a salutation greeting and an honorific greeting", () => {
    for (const seed of MAIL_TEMPLATE_SEEDS) {
      const honorific = toHonorificGreeting(seed.body);
      assert.equal(honorific.startsWith("Dear {{honorific}} {{family_name}},"), true, seed.key);
      assert.equal(toSalutationGreeting(honorific), seed.body, seed.key);
    }
  });
});
