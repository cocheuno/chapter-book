export const ACTIVE_REGISTRATION_STATUSES = ["free", "paid", "pending"] as const;

export type DeskFilter = "all" | "active" | "awaiting_payment" | "cancelled" | "needs_look" | "consent_missing";

const CANCELLED_STATUSES = new Set(["cancelled", "expired", "refunded"]);

export function isActiveRegistration(status: string): boolean {
  return (ACTIVE_REGISTRATION_STATUSES as readonly string[]).includes(status);
}

export function deskFilter(
  reg: {
    status: string;
    needsReview: string | null;
    attendees: { review: boolean; isMinor?: boolean; consentOnFile?: boolean; cancelled?: boolean }[];
  },
  filter: DeskFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "active") return isActiveRegistration(reg.status);
  if (filter === "awaiting_payment") return reg.status === "pending";
  if (filter === "cancelled") return CANCELLED_STATUSES.has(reg.status);
  if (filter === "consent_missing") {
    return reg.attendees.some((attendee) => attendee.isMinor && !attendee.consentOnFile && !attendee.cancelled);
  }
  return reg.needsReview != null || reg.attendees.some((attendee) => attendee.review);
}

export function deskSearch(
  reg: {
    code: string;
    purchaserName: string;
    purchaserEmail: string;
    attendees: { givenName: string; familyName: string }[];
  },
  text: string,
): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const names = reg.attendees.flatMap((attendee) => [
    attendee.givenName,
    attendee.familyName,
    `${attendee.givenName} ${attendee.familyName}`.trim(),
  ]);
  const haystack = [reg.code, reg.purchaserName, reg.purchaserEmail, ...names].join("\n").toLowerCase();
  return haystack.includes(needle);
}

export function mealCounts(
  rows: { partId: string; partTitle: string; dietary: string | null }[],
): { partId: string; partTitle: string; dietary: string; count: number }[] {
  const grouped = new Map<string, { partId: string; partTitle: string; dietary: string; count: number }>();
  for (const row of rows) {
    const dietary = row.dietary?.trim() ? row.dietary.trim() : "None given";
    const key = `${row.partId}\0${dietary}`;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { partId: row.partId, partTitle: row.partTitle, dietary, count: 1 });
  }
  return [...grouped.values()].sort((a, b) => {
    const byTitle = a.partTitle.localeCompare(b.partTitle);
    if (byTitle) return byTitle;
    if (a.count !== b.count) return b.count - a.count;
    return a.dietary.localeCompare(b.dietary);
  });
}

export function seatDrift(
  parts: { id: string; title: string; taken: number }[],
  counted: Record<string, number>,
): { id: string; title: string; taken: number; counted: number }[] {
  return parts.flatMap((part) => {
    const countedSeats = counted[part.id] ?? 0;
    if (part.taken === countedSeats) return [];
    return [{ id: part.id, title: part.title, taken: part.taken, counted: countedSeats }];
  });
}

export function uniqueEmails(list: (string | null)[]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of list) {
    const email = value?.trim().toLowerCase() ?? "";
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

/** One seat per attendee per part, matching planRegistration. */
export function partReleases(attendeeParts: string[]): Record<string, number> {
  const releases: Record<string, number> = {};
  for (const partId of attendeeParts) {
    if (!partId) continue;
    releases[partId] = 1;
  }
  return releases;
}

/** True when two ticket part lists are the same set. */
export function ticketPartsUnchanged(current: readonly string[], next: readonly string[]): boolean {
  const left = [...new Set(current)].sort();
  const right = [...new Set(next)].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
