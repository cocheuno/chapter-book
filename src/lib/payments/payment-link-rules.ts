const STRIPE_LINK = "https://buy.stripe.com/";

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
