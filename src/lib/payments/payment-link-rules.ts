import { formatCents } from "./pricing.ts";

const STRIPE_LINK = "https://buy.stripe.com/";
const STRIPE_BODY = /^[A-Za-z0-9]{10,}$/;

export const PAYMENT_LINK_PASTE =
  "Paste the Stripe Payment Link (it starts with https://buy.stripe.com/).";

export const PAYMENT_LINK_TEST = "This is a Stripe test link. Use the live link.";

export const PAID_GROUP =
  "Paid tickets are for one person at a time. For a group, please contact the chapter.";

export const PAID_UNAVAILABLE = "This ticket can't be paid online yet.";

export type PaidRegistrationLine = {
  priceCents: number;
  kind: string;
  paymentLink?: string | null;
};

export type PaidRegistrationPlan = {
  totalCents: number;
  attendeeCount: number;
  lines: PaidRegistrationLine[];
};

/** Null when the text is a Stripe Payment Link this environment may store. */
export function paymentLinkError(url: string, vercelEnv: string | undefined): string | null {
  if (!url.startsWith(STRIPE_LINK)) return PAYMENT_LINK_PASTE;
  if (vercelEnv === "production" && url.includes("/test_")) return PAYMENT_LINK_TEST;
  return null;
}

/** Payment Link with the registration code and purchaser email filled in. */
export function payUrl(link: string, code: string, email: string): string {
  const params = `client_reference_id=${encodeURIComponent(code)}&prefilled_email=${encodeURIComponent(email)}`;
  return link.includes("?") ? `${link}&${params}` : `${link}?${params}`;
}

/**
 * Null when a total above $0 can be paid through one admission Payment Link.
 * A $0 total is unchanged.
 */
export function paidRegistrationError(plan: PaidRegistrationPlan): string | null {
  if (plan.totalCents <= 0) return null;
  if (plan.attendeeCount !== 1) return PAID_GROUP;
  const priced = plan.lines.filter((line) => line.priceCents > 0);
  const admissions = priced.filter((line) => line.kind === "admission");
  const pricedAddOn = plan.lines.some((line) => line.kind === "add_on" && line.priceCents > 0);
  const link = (admissions[0]?.paymentLink ?? "").trim();
  if (priced.length !== 1 || admissions.length !== 1 || pricedAddOn || paymentLinkError(link, undefined)) {
    return PAID_UNAVAILABLE;
  }
  return null;
}

export type PriceChangeInput = {
  issued: boolean;
  pendingHolds: number;
  isAdmin: boolean;
  linkChanged: boolean;
  priceChanged: boolean;
  confirmMatches: boolean;
};

/**
 * Null when the save may store the price and payment link.
 * An editor may change other fields. A link always needs an admin.
 * An issued ticket's price or link also needs the new price typed back.
 */
export function priceChangeCheck(input: PriceChangeInput): string | null {
  if (input.linkChanged && !input.isAdmin) return "Only an admin can set a payment link.";
  if (!input.issued || (!input.priceChanged && !input.linkChanged)) return null;
  if (input.priceChanged && input.pendingHolds > 0) {
    return `${input.pendingHolds} registrations are still awaiting payment at the current price. Wait for them to be paid or to lapse first.`;
  }
  if (!input.isAdmin || !input.confirmMatches) {
    return "Tickets were already issued. Type the new price to confirm.";
  }
  return null;
}

/** `pi_` is a payment intent. `ch_` and `py_` are charges. Null when the text is empty or malformed. */
export function parseStripePaymentId(
  text: string,
): { column: "stripe_payment_intent_id" | "stripe_charge_id"; id: string } | null {
  const id = text.trim();
  const body = id.slice(3);
  if (!STRIPE_BODY.test(body)) return null;
  if (id.startsWith("pi_")) return { column: "stripe_payment_intent_id", id };
  if (id.startsWith("ch_") || id.startsWith("py_")) return { column: "stripe_charge_id", id };
  return null;
}

/** Null when the text is empty or a Stripe refund id. A non-empty other value is refused. */
export function refundIdError(text: string): string | null {
  const id = text.trim();
  if (!id) return null;
  if (id.startsWith("re_") && STRIPE_BODY.test(id.slice(3))) return null;
  return "Enter the Stripe refund ID (it starts with re_).";
}

/** Null when the typed amount is the registration total. */
export function amountMismatch(totalCents: number, amountCents: number): string | null {
  if (totalCents === amountCents) return null;
  return `The total is ${formatCents(totalCents)} but you entered ${formatCents(amountCents)}.`;
}

/** The manage page shows a pay link only while the event is open, the registration is pending, and the hold has not lapsed. */
export function payLinkVisible(input: { open: boolean; status: string; lapsed: boolean }): boolean {
  return input.open && input.status === "pending" && !input.lapsed;
}

/** Desk and manage-page words for a stored registration status. */
export function paymentStateLabel(status: string): string {
  switch (status) {
    case "free":
      return "Free";
    case "pending":
      return "Awaiting payment";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
    case "partly_refunded":
      return "Partly refunded";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}
