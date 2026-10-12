/** Dollars as typed by an editor, or null when the text is not a price. */
export function parsePriceCents(text: string): number | null {
  let raw = text.trim();
  if (raw.startsWith("$")) raw = raw.slice(1).trim();
  raw = raw.replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const dollars = Number(match[1]);
  if (!Number.isSafeInteger(dollars) || dollars > 100000) return null;
  const frac = (match[2] ?? "").padEnd(2, "0");
  if (dollars === 100000 && Number(frac) > 0) return null;
  return dollars * 100 + Number(frac || "0");
}

/** "$1,250.00" from a cent amount. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${frac}`;
}

/** Seats still open. Null capacity means no limit. Never negative. */
export function seatsLeft(part: { capacity: number | null; held: number; taken: number }): number | null {
  if (part.capacity == null) return null;
  return Math.max(0, part.capacity - part.held - part.taken);
}

/** True when the ticket is active and now is inside its sales window. */
export function ticketOnSale(
  t: { active: boolean; sales_start: string | null; sales_end: string | null },
  now: Date,
): boolean {
  if (!t.active) return false;
  const at = now.getTime();
  if (t.sales_start && new Date(t.sales_start).getTime() > at) return false;
  if (t.sales_end && new Date(t.sales_end).getTime() < at) return false;
  return true;
}
