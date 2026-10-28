import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAID_GROUP,
  PAID_UNAVAILABLE,
  PAYMENT_LINK_PASTE,
  PAYMENT_LINK_TEST,
  paidRegistrationError,
  paymentLinkError,
  paymentStateLabel,
  payUrl,
} from "./payment-link-rules.ts";

const LIVE = "https://buy.stripe.com/aEexample";
const TEST = "https://buy.stripe.com/test_aEexample";

describe("paymentLinkError", () => {
  it("accepts a live Stripe Payment Link", () => {
    assert.equal(paymentLinkError(LIVE, undefined), null);
    assert.equal(paymentLinkError(LIVE, "preview"), null);
    assert.equal(paymentLinkError(LIVE, "production"), null);
  });

  it("asks for a Stripe Payment Link when the text is not one", () => {
    assert.equal(paymentLinkError("", "production"), PAYMENT_LINK_PASTE);
    assert.equal(paymentLinkError("https://example.com/pay", "production"), PAYMENT_LINK_PASTE);
    assert.equal(paymentLinkError("http://buy.stripe.com/abc", undefined), PAYMENT_LINK_PASTE);
  });

  it("rejects a test link only in production, and only after the prefix check", () => {
    assert.equal(paymentLinkError(TEST, "preview"), null);
    assert.equal(paymentLinkError(TEST, undefined), null);
    assert.equal(paymentLinkError(TEST, "production"), PAYMENT_LINK_TEST);
    assert.equal(paymentLinkError("https://example.com/test_abc", "production"), PAYMENT_LINK_PASTE);
  });
});

describe("payUrl", () => {
  it("adds the code and email when the link has no query string", () => {
    assert.equal(
      payUrl(LIVE, "R27-7KQ4", "ada.lee@example.com"),
      `${LIVE}?client_reference_id=R27-7KQ4&prefilled_email=ada.lee%40example.com`,
    );
  });

  it("appends when the link already has a question mark", () => {
    assert.equal(
      payUrl(`${LIVE}?locale=en`, "R27/7 K", "a b@example.com"),
      `${LIVE}?locale=en&client_reference_id=R27%2F7%20K&prefilled_email=a%20b%40example.com`,
    );
  });
});

describe("paidRegistrationError", () => {
  const admission = { priceCents: 2500, kind: "admission", paymentLink: LIVE };
  const freeAddOn = { priceCents: 0, kind: "add_on", paymentLink: null };

  it("leaves a free registration alone", () => {
    assert.equal(
      paidRegistrationError({
        totalCents: 0,
        attendeeCount: 2,
        lines: [
          { priceCents: 0, kind: "admission", paymentLink: null },
          { priceCents: 0, kind: "admission", paymentLink: null },
        ],
      }),
      null,
    );
  });

  it("allows one person, one priced admission, and free add-ons", () => {
    assert.equal(
      paidRegistrationError({ totalCents: 2500, attendeeCount: 1, lines: [admission, freeAddOn] }),
      null,
    );
  });

  it("refuses a group", () => {
    assert.equal(
      paidRegistrationError({ totalCents: 5000, attendeeCount: 2, lines: [admission, admission] }),
      PAID_GROUP,
    );
  });

  it("refuses a priced ticket that has no payment link", () => {
    assert.equal(
      paidRegistrationError({
        totalCents: 2500,
        attendeeCount: 1,
        lines: [{ priceCents: 2500, kind: "admission", paymentLink: null }],
      }),
      PAID_UNAVAILABLE,
    );
  });

  it("refuses a priced add-on or more than one priced line", () => {
    assert.equal(
      paidRegistrationError({
        totalCents: 3000,
        attendeeCount: 1,
        lines: [admission, { priceCents: 500, kind: "add_on", paymentLink: LIVE }],
      }),
      PAID_UNAVAILABLE,
    );
    assert.equal(
      paidRegistrationError({
        totalCents: 500,
        attendeeCount: 1,
        lines: [
          { priceCents: 0, kind: "admission", paymentLink: null },
          { priceCents: 500, kind: "add_on", paymentLink: LIVE },
        ],
      }),
      PAID_UNAVAILABLE,
    );
  });
});

describe("paymentStateLabel", () => {
  it("names the stored payment states", () => {
    assert.equal(paymentStateLabel("free"), "Free");
    assert.equal(paymentStateLabel("pending"), "Awaiting payment");
    assert.equal(paymentStateLabel("paid"), "Paid");
    assert.equal(paymentStateLabel("cancelled"), "Cancelled");
    assert.equal(paymentStateLabel("refunded"), "Refunded");
  });
});
