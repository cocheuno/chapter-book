import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAID_GROUP,
  PAID_UNAVAILABLE,
  PAYMENT_LINK_PASTE,
  PAYMENT_LINK_TEST,
  amountMismatch,
  paidRegistrationError,
  parseStripePaymentId,
  payLinkVisible,
  paymentLinkError,
  paymentStateLabel,
  payUrl,
  priceChangeCheck,
  refundIdError,
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

const PENDING =
  " registrations are still awaiting payment at the current price. Wait for them to be paid or to lapse first.";
const CONFIRM = "Tickets were already issued. Type the new price to confirm.";
const ADMIN_LINK = "Only an admin can set a payment link.";

describe("priceChangeCheck", () => {
  const base = {
    issued: false,
    pendingHolds: 0,
    isAdmin: false,
    linkChanged: false,
    priceChanged: false,
    confirmMatches: false,
  };

  it("allows an unissued ticket unless an editor changes the link", () => {
    assert.equal(priceChangeCheck(base), null);
    assert.equal(priceChangeCheck({ ...base, priceChanged: true }), null);
    assert.equal(priceChangeCheck({ ...base, linkChanged: true }), ADMIN_LINK);
    assert.equal(priceChangeCheck({ ...base, isAdmin: true, linkChanged: true }), null);
  });

  it("allows an issued ticket when the price and link stay the same", () => {
    assert.equal(priceChangeCheck({ ...base, issued: true }), null);
  });

  it("refuses a price change while registrations are awaiting payment", () => {
    assert.equal(
      priceChangeCheck({ ...base, issued: true, priceChanged: true, pendingHolds: 2, isAdmin: true, confirmMatches: true }),
      `2${PENDING}`,
    );
    assert.equal(
      priceChangeCheck({ ...base, issued: true, priceChanged: true, pendingHolds: 1 }),
      `1${PENDING}`,
    );
    assert.equal(
      priceChangeCheck({
        ...base,
        issued: true,
        priceChanged: true,
        linkChanged: true,
        pendingHolds: 3,
        isAdmin: true,
        confirmMatches: true,
      }),
      `3${PENDING}`,
    );
  });

  it("asks an admin to type the new price, and refuses an editor", () => {
    assert.equal(
      priceChangeCheck({ ...base, issued: true, priceChanged: true, confirmMatches: true }),
      CONFIRM,
    );
    assert.equal(
      priceChangeCheck({ ...base, issued: true, priceChanged: true, isAdmin: true, confirmMatches: false }),
      CONFIRM,
    );
    assert.equal(
      priceChangeCheck({ ...base, issued: true, priceChanged: true, isAdmin: true, confirmMatches: true }),
      null,
    );
  });

  it("treats a link change on an issued ticket as a price confirmation", () => {
    assert.equal(priceChangeCheck({ ...base, issued: true, linkChanged: true }), ADMIN_LINK);
    assert.equal(
      priceChangeCheck({ ...base, issued: true, linkChanged: true, isAdmin: true, confirmMatches: false }),
      CONFIRM,
    );
    assert.equal(
      priceChangeCheck({
        ...base,
        issued: true,
        linkChanged: true,
        isAdmin: true,
        confirmMatches: true,
        pendingHolds: 4,
      }),
      null,
    );
    assert.equal(
      priceChangeCheck({ ...base, issued: true, priceChanged: true, linkChanged: true, pendingHolds: 2 }),
      ADMIN_LINK,
    );
  });
});

describe("parseStripePaymentId", () => {
  it("accepts a payment intent or a charge, and refuses anything else", () => {
    assert.equal(parseStripePaymentId(""), null);
    assert.equal(parseStripePaymentId("pi_123"), null);
    assert.equal(parseStripePaymentId("PI_abcdefghij"), null);
    assert.equal(parseStripePaymentId("xx_abcdefghij"), null);
    assert.deepEqual(parseStripePaymentId("pi_abcdefghij"), {
      column: "stripe_payment_intent_id",
      id: "pi_abcdefghij",
    });
    assert.deepEqual(parseStripePaymentId(" ch_ABCDEFGHIJ "), {
      column: "stripe_charge_id",
      id: "ch_ABCDEFGHIJ",
    });
    assert.deepEqual(parseStripePaymentId("py_0123456789"), {
      column: "stripe_charge_id",
      id: "py_0123456789",
    });
  });
});

describe("refundIdError", () => {
  it("allows a blank or a refund id, and refuses anything else", () => {
    assert.equal(refundIdError(""), null);
    assert.equal(refundIdError("  "), null);
    assert.equal(refundIdError("re_abcdefghij"), null);
    assert.equal(refundIdError("re_short"), "Enter the Stripe refund ID (it starts with re_).");
    assert.equal(refundIdError("pi_abcdefghij"), "Enter the Stripe refund ID (it starts with re_).");
  });
});

describe("amountMismatch", () => {
  it("is quiet when the amount is the total", () => {
    assert.equal(amountMismatch(2500, 2500), null);
    assert.equal(amountMismatch(2500, 2000), "The total is $25.00 but you entered $20.00.");
  });
});

describe("payLinkVisible", () => {
  it("shows the pay link only for an open pending registration whose hold has not lapsed", () => {
    assert.equal(payLinkVisible({ open: true, status: "pending", lapsed: false }), true);
    assert.equal(payLinkVisible({ open: false, status: "pending", lapsed: false }), false);
    assert.equal(payLinkVisible({ open: true, status: "paid", lapsed: false }), false);
    assert.equal(payLinkVisible({ open: true, status: "pending", lapsed: true }), false);
    assert.equal(payLinkVisible({ open: true, status: "free", lapsed: false }), false);
  });
});
