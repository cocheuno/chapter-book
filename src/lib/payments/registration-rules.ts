import { ticketOnSale } from "./pricing.ts";

export const MAX_ATTENDEES = 10;

/** Attempts per IP per hour. The server stores a hash of the address, not the address. */
export const THROTTLE_LIMIT = 10;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type RegistrationAttendeeInput = {
  givenName: string;
  familyName: string;
  email?: string;
  under18: boolean;
  admissionId: string;
  addOnIds: string[];
};

export type RegistrationPlanInput = {
  attendees: RegistrationAttendeeInput[];
};

export type CatalogTicket = {
  id: string;
  kind: string;
  name: string;
  price_cents: number;
  for_minors: boolean;
  needs_code: boolean;
  active: boolean;
  sales_start: string | null;
  sales_end: string | null;
  partIds: string[];
};

export type CatalogPart = {
  id: string;
  title: string;
  capacity: number | null;
  held: number;
  taken: number;
};

export type RegistrationCatalog = {
  tickets: CatalogTicket[];
  parts: CatalogPart[];
};

export type RegistrationLine = {
  attendeeIndex: number;
  ticketId: string;
  priceCents: number;
};

export type RegistrationPlan =
  | { ok: true; lines: RegistrationLine[]; totalCents: number; partNeeds: Record<string, number> }
  | { ok: false; error: string };

function blank(value: string | null | undefined): boolean {
  return (value ?? "").trim() === "";
}

/** Decide whether a free registration can be taken, or the first reason it cannot. */
export function planRegistration(
  input: RegistrationPlanInput,
  catalog: RegistrationCatalog,
  now: Date,
): RegistrationPlan {
  const attendees = input.attendees ?? [];
  if (attendees.length < 1 || attendees.length > MAX_ATTENDEES) {
    return { ok: false, error: "Add between 1 and 10 people." };
  }
  if (attendees.some((person) => blank(person.givenName) || blank(person.familyName))) {
    return { ok: false, error: "Enter each person's first and last name." };
  }
  if (attendees.some((person) => person.under18)) {
    return { ok: false, error: "Registration for students under 18 opens soon." };
  }

  const tickets = new Map(catalog.tickets.map((ticket) => [ticket.id, ticket]));
  const admissions = attendees.map((person) => tickets.get(person.admissionId));
  if (admissions.some((ticket) => !ticket || ticket.kind !== "admission")) {
    return { ok: false, error: "Choose a ticket for each person." };
  }

  const unavailable = (ticket: CatalogTicket): boolean =>
    !ticket.active || !ticketOnSale(ticket, now) || ticket.needs_code || ticket.for_minors;

  if (admissions.some((ticket) => ticket && unavailable(ticket))) {
    return { ok: false, error: "That ticket is not available." };
  }

  for (const person of attendees) {
    const seen = new Set<string>();
    for (const addOnId of person.addOnIds) {
      const addOn = tickets.get(addOnId);
      if (!addOn || addOn.kind !== "add_on" || seen.has(addOnId) || unavailable(addOn)) {
        return { ok: false, error: "That ticket is not available." };
      }
      seen.add(addOnId);
    }
  }

  const chosen: CatalogTicket[] = [];
  for (const person of attendees) {
    const admission = tickets.get(person.admissionId);
    if (admission) chosen.push(admission);
    for (const addOnId of person.addOnIds) {
      const addOn = tickets.get(addOnId);
      if (addOn) chosen.push(addOn);
    }
  }
  if (chosen.some((ticket) => ticket.price_cents > 0)) {
    return { ok: false, error: "Online payment opens soon. Choose a free ticket for now." };
  }

  const knownParts = new Set(catalog.parts.map((part) => part.id));
  const partNeeds: Record<string, number> = {};
  const lines: RegistrationLine[] = [];
  attendees.forEach((person, attendeeIndex) => {
    const ids = [person.admissionId, ...person.addOnIds];
    const parts = new Set<string>();
    for (const ticketId of ids) {
      const ticket = tickets.get(ticketId);
      if (!ticket) continue;
      lines.push({ attendeeIndex, ticketId, priceCents: ticket.price_cents });
      for (const partId of ticket.partIds) {
        if (knownParts.has(partId)) parts.add(partId);
      }
    }
    for (const partId of parts) partNeeds[partId] = (partNeeds[partId] ?? 0) + 1;
  });

  for (const part of catalog.parts) {
    const need = partNeeds[part.id] ?? 0;
    if (need <= 0 || part.capacity == null) continue;
    if (part.taken + part.held + need > part.capacity) {
      return { ok: false, error: `${part.title} is full.` };
    }
  }

  const totalCents = lines.reduce((sum, line) => sum + line.priceCents, 0);
  return { ok: true, lines, totalCents, partNeeds };
}

/** `Ryy-XXXX`, four Crockford characters from the given bytes. */
export function registrationCode(year: number, bytes: Uint8Array): string {
  const yy = String(Math.abs(Math.trunc(year)) % 100).padStart(2, "0");
  let tail = "";
  for (let i = 0; i < 4; i += 1) tail += CROCKFORD[(bytes[i] ?? 0) % 32];
  return `R${yy}-${tail}`;
}

export function matchAttendee(
  typed: { email: string | null; givenName: string; familyName: string },
  byEmail: { id: string } | null,
  sameName: { id: string; email: string | null }[],
):
  | { action: "link"; personId: string; reason: "email" }
  | { action: "create"; possibleDuplicateOf: string | null } {
  if (byEmail) return { action: "link", personId: byEmail.id, reason: "email" };
  void typed;
  return { action: "create", possibleDuplicateOf: sameName[0]?.id ?? null };
}

function sameText(book: string | null | undefined, typed: string | null | undefined): boolean {
  return (book ?? "").trim().toLowerCase() === (typed ?? "").trim().toLowerCase();
}

/** Fields the visitor filled in that differ from the book. Null when nothing differs. */
export function reviewChanges(
  person: { given_name: string | null; family_name: string | null; dietary: string | null },
  typed: { givenName: string; familyName: string; dietary?: string | null },
): Record<string, { book: string | null; typed: string }> | null {
  const pairs: [string, string | null, string | null | undefined][] = [
    ["given_name", person.given_name, typed.givenName],
    ["family_name", person.family_name, typed.familyName],
    ["dietary", person.dietary, typed.dietary],
  ];
  const changes: Record<string, { book: string | null; typed: string }> = {};
  for (const [key, book, raw] of pairs) {
    const typedText = (raw ?? "").trim();
    if (!typedText || sameText(book, typedText)) continue;
    const bookText = (book ?? "").trim();
    changes[key] = { book: bookText ? bookText : null, typed: typedText };
  }
  return Object.keys(changes).length ? changes : null;
}

function keyPresent(value: string | undefined): boolean {
  return (value ?? "").trim() !== "";
}

export function turnstileMode(env: { siteKey?: string; secretKey?: string }): "skip" | "verify" | "misconfigured" {
  const site = keyPresent(env.siteKey);
  const secret = keyPresent(env.secretKey);
  if (site && secret) return "verify";
  if (!site && !secret) return "skip";
  return "misconfigured";
}

export function agreementsAccepted(latestIds: string[], acceptedIds: string[]): boolean {
  const accepted = new Set(acceptedIds);
  return latestIds.every((id) => accepted.has(id));
}
