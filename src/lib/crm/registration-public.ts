import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getSql, withSavepoint, withTransaction } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { bookRegistrationAllowed } from "./book-registration";
import { calendarHref } from "./calendar-file";
import { todayIn } from "./dates";
import { lowerEmail, nid } from "./ids";
import { loadMember } from "./member";
import { composePersonName, splitWalkupName } from "./names";
import { findPersonByEmail } from "./person-emails";
import { hashInviteToken, newInviteToken } from "./operator-rules";
import { publicOrigin } from "./page-head";
import { guardianConsentErrors, type GuardianConsentInput } from "@/lib/payments/consent-rules";
import { paymentLinkError, paidRegistrationError, payUrl } from "@/lib/payments/payment-link-rules";
import { seatsLeft, ticketOnSale } from "@/lib/payments/pricing";
import {
  THROTTLE_LIMIT,
  agreementsAccepted,
  duplicateAttendees,
  duplicateRegistrationMessage,
  matchAttendee,
  planRegistration,
  registrationCode,
  reviewChanges,
  shownTextMismatch,
  turnstileMode,
  type RegistrationCatalog,
} from "@/lib/payments/registration-rules";
import { latestGuardianText, writeOnlineConsent } from "./consent";
import { registrationInput } from "./registration-input";

export { registrationInput };

type Sql = Awaited<ReturnType<typeof getSql>>;

const AGREEMENT_ORDER = ["privacy", "refund", "conduct"] as const;

type RegistrationEvent = {
  itemId: string;
  eventId: string;
  title: string;
  slug: string;
  whenLabel: string | null;
  location: string | null;
  kind: string | null;
  startsOn: string | null;
  published: boolean;
  startsAt: Date | string | null;
  timezone: string;
  chapterTimezone: string;
  enabled: boolean;
  intro: string | null;
  forSchools: string | null;
  manageMessage: string | null;
  contactLine: string | null;
  publicTitle: string | null;
};

type PersonSnap = {
  id: string;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  dietary: string | null;
};

type WebPerson = PersonSnap & { created: boolean; linkedByEmail: boolean };

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function asNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function storedPaymentLink(value: string | null | undefined): string | null {
  const url = (value ?? "").trim();
  if (!url) return null;
  const env = typeof process === "undefined" ? undefined : process.env.VERCEL_ENV;
  if (paymentLinkError(url, env)) return null;
  return url;
}

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "23505") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|unique index|23505/i.test(msg);
}

function clientIp(): string {
  try {
    const request = getRequest();
    const headers = request?.headers;
    if (!headers) return "unknown";
    const real = headers.get("x-real-ip")?.trim() ?? "";
    if (real) return real;
    const first = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
    return first || "unknown";
  } catch {
    return "unknown";
  }
}

function randomCodeBytes(): Uint8Array {
  if (typeof process === "undefined" || typeof process.getBuiltinModule !== "function") {
    throw new Error("Registration could not be completed. Please try again.");
  }
  return process.getBuiltinModule("node:crypto").randomBytes(4);
}

function eventYear(startsAt: Date | string | null, timeZone: string, now: Date): number {
  const parsed = startsAt == null ? now : startsAt instanceof Date ? startsAt : new Date(startsAt);
  const at = Number.isNaN(parsed.getTime()) ? now : parsed;
  try {
    const year = Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(at));
    if (Number.isFinite(year)) return year;
  } catch {
    // An unknown time zone falls through to the UTC year.
  }
  return at.getUTCFullYear();
}

function plusDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dueInSevenDays(timeZone: string, now = new Date()): string {
  let today: string;
  try {
    today = todayIn(timeZone, now);
  } catch {
    today = todayIn("UTC", now);
  }
  return plusDays(today, 7);
}

async function firstChapterId(sql: Sql): Promise<string | null> {
  const rows = await sql<{ id: string }>`select id from chapters order by created_at limit 1`;
  return rows[0]?.id ?? null;
}

export async function findRegistrationEvent(
  sql: Sql,
  chapterId: string,
  slug: string,
): Promise<RegistrationEvent | null> {
  const rows = await sql<{
    item_id: string;
    slug: string;
    when_label: string | null;
    location: string | null;
    kind: string | null;
    starts_on: string | null;
    published: boolean;
    event_id: string;
    title: string;
    starts_at: Date | string | null;
    timezone: string;
    chapter_timezone: string;
    use_book_registration: boolean;
    intro: string | null;
    for_schools: string | null;
    manage_message: string | null;
    contact_line: string | null;
    public_title: string | null;
  }>`
    select i.id as item_id, i.slug, i.when_label, i.location, i.kind, i.starts_on, i.published,
           e.id as event_id, e.title, e.starts_at, e.timezone, c.timezone as chapter_timezone,
           coalesce(rp.use_book_registration, false) as use_book_registration,
           rp.intro, rp.for_schools, rp.manage_message,
           c.contact_line, s.public_title
    from site_items i
    join events e on e.public_item_id = i.id and e.chapter_id = i.chapter_id
    join chapters c on c.id = e.chapter_id
    left join registration_pages rp on rp.event_id = e.id and rp.chapter_id = e.chapter_id
    left join site_settings s on s.chapter_id = e.chapter_id
    where i.chapter_id = ${chapterId} and i.slug = ${slug} and i.published
    order by e.created_at
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    itemId: row.item_id,
    eventId: row.event_id,
    title: row.title,
    slug: row.slug,
    whenLabel: row.when_label,
    location: row.location,
    kind: row.kind,
    startsOn: row.starts_on,
    published: row.published,
    startsAt: row.starts_at,
    timezone: row.timezone,
    chapterTimezone: row.chapter_timezone,
    enabled:
      bookRegistrationAllowed(
        typeof process === "undefined" ? undefined : process.env.BOOK_REGISTRATION,
      ) && row.use_book_registration === true,
    intro: row.intro,
    forSchools: row.for_schools,
    manageMessage: row.manage_message,
    contactLine: row.contact_line,
    publicTitle: row.public_title,
  };
}

async function loadCatalog(sql: Sql, chapterId: string, eventId: string, now: Date): Promise<RegistrationCatalog & {
  pageTickets: {
    id: string;
    kind: string;
    name: string;
    description: string | null;
    price_cents: number;
    for_minors: boolean;
    needs_code: boolean;
    partIds: string[];
    onSale: boolean;
    full: boolean;
    hasPaymentLink: boolean;
  }[];
  pageParts: { id: string; title: string; left: number | null }[];
}> {
  const tickets = await sql<{
    id: string;
    kind: string;
    name: string;
    description: string | null;
    price_cents: number | string;
    for_minors: boolean;
    needs_code: boolean;
    sales_start: Date | string | null;
    sales_end: Date | string | null;
    active: boolean;
    payment_link: string | null;
  }>`
    select id, kind, name, description, price_cents, for_minors, needs_code, sales_start, sales_end, active,
           payment_link
    from ticket_types
    where event_id = ${eventId} and chapter_id = ${chapterId}
    order by sort_order, name
  `;
  const parts = await sql<{
    id: string;
    title: string;
    capacity: number | string | null;
    held: number | string;
    taken: number | string;
  }>`
    select id, title, capacity, held, taken
    from event_parts
    where event_id = ${eventId} and chapter_id = ${chapterId}
    order by sort_order, title
  `;
  const links = await sql<{ ticket_type_id: string; part_id: string }>`
    select l.ticket_type_id, l.part_id
    from ticket_type_parts l
    join event_parts p on p.id = l.part_id
    where p.event_id = ${eventId} and p.chapter_id = ${chapterId}
  `;
  const partIdsOf = (ticketId: string) =>
    links.filter((link) => link.ticket_type_id === ticketId).map((link) => link.part_id);
  const catalogParts = parts.map((part) => ({
    id: part.id,
    title: part.title,
    capacity: asNumberOrNull(part.capacity),
    held: asNumber(part.held),
    taken: asNumber(part.taken),
  }));
  const catalogTickets = tickets
    .filter((ticket) => ticket.kind === "admission" || ticket.kind === "add_on")
    .map((ticket) => ({
      id: ticket.id,
      kind: ticket.kind,
      name: ticket.name,
      price_cents: asNumber(ticket.price_cents),
      for_minors: ticket.for_minors,
      needs_code: ticket.needs_code,
      active: ticket.active,
      sales_start: iso(ticket.sales_start),
      sales_end: iso(ticket.sales_end),
      partIds: partIdsOf(ticket.id),
      payment_link: storedPaymentLink(ticket.payment_link),
    }));
  const leftOf = new Map(catalogParts.map((part) => [part.id, seatsLeft(part)]));
  const pageTickets = catalogTickets
    .filter((ticket) => ticket.active)
    .map((ticket) => ({
      id: ticket.id,
      kind: ticket.kind,
      name: ticket.name,
      description: tickets.find((row) => row.id === ticket.id)?.description ?? null,
      price_cents: ticket.price_cents,
      for_minors: ticket.for_minors,
      needs_code: ticket.needs_code,
      partIds: ticket.partIds,
      onSale: ticketOnSale(ticket, now),
      full: ticket.partIds.some((partId) => leftOf.get(partId) === 0),
      hasPaymentLink: Boolean(ticket.payment_link),
    }));
  return {
    tickets: catalogTickets,
    parts: catalogParts,
    pageTickets,
    pageParts: catalogParts.map((part) => ({ id: part.id, title: part.title, left: leftOf.get(part.id) ?? null })),
  };
}

async function latestAgreements(sql: Sql, chapterId: string, eventId: string) {
  const rows = await sql<{ id: string; kind: string; html: string }>`
    select distinct on (kind) id, kind, html
    from consent_texts
    where event_id = ${eventId} and chapter_id = ${chapterId}
      and kind in ('privacy', 'refund', 'conduct')
    order by kind, created_at desc, id desc
  `;
  return [...rows].sort(
    (a, b) => AGREEMENT_ORDER.indexOf(a.kind as (typeof AGREEMENT_ORDER)[number]) - AGREEMENT_ORDER.indexOf(b.kind as (typeof AGREEMENT_ORDER)[number]),
  );
}

function registerPayload(
  event: RegistrationEvent,
  catalog: Awaited<ReturnType<typeof loadCatalog>>,
  agreements: { id: string; kind: string; html: string }[],
  guardian: { id: string; html: string } | null,
) {
  return {
    enabled: event.enabled,
    event: {
      title: event.title,
      slug: event.slug,
      when_label: event.whenLabel,
      location: event.location,
    },
    intro: event.intro,
    for_schools: event.forSchools,
    tickets: catalog.pageTickets,
    parts: catalog.pageParts,
    agreements,
    guardianConsent: guardian ? { id: guardian.id, html: guardian.html } : null,
    turnstileSiteKey: readEnv("TURNSTILE_SITE_KEY") ?? null,
    public_title: event.publicTitle,
  };
}

function consentInput(person: {
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  relationship?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  medicalNotes?: string;
  photoRelease?: boolean;
  agreed?: boolean;
  signature?: string;
}): GuardianConsentInput {
  return {
    guardianName: person.guardianName ?? "",
    guardianPhone: person.guardianPhone ?? "",
    guardianEmail: person.guardianEmail,
    relationship: person.relationship ?? "",
    emergencyName: person.emergencyName ?? "",
    emergencyPhone: person.emergencyPhone ?? "",
    medicalNotes: person.medicalNotes,
    photoRelease: person.photoRelease === true,
    agreed: person.agreed === true,
    signature: person.signature ?? "",
  };
}

async function takeSeats(
  sql: Sql,
  chapterId: string,
  partNeeds: Record<string, number>,
  titles: Map<string, string>,
) {
  for (const [partId, n] of Object.entries(partNeeds)) {
    if (n <= 0) continue;
    const rows = await sql<{ id: string }>`
      update event_parts set taken = taken + ${n}
      where id = ${partId} and chapter_id = ${chapterId}
        and (capacity is null or taken + held + ${n} <= capacity)
      returning id
    `;
    if (!rows[0]) throw new Error(`${titles.get(partId) ?? "That part"} is full.`);
  }
}

async function verifyTurnstile(token: string | undefined, ip: string, secret: string) {
  const body = new URLSearchParams({ secret, response: token ?? "", remoteip: ip });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    const payload = (await response.json()) as { success?: boolean };
    if (payload.success !== true) throw new Error("Please complete the check and try again.");
  } catch (err) {
    if (err instanceof Error && err.message === "Please complete the check and try again.") throw err;
    throw new Error("Please complete the check and try again.");
  } finally {
    clearTimeout(timer);
  }
}

async function createWebPerson(
  sql: Sql,
  chapterId: string,
  input: {
    givenName: string;
    familyName: string | null;
    email: string | null;
    phone: string | null;
    newsConsent: "yes" | "no";
  },
): Promise<WebPerson> {
  const givenName = input.givenName.trim();
  const familyName = (input.familyName ?? "").trim();
  const displayName = composePersonName({ givenName, familyName });
  const id = nid();
  try {
    await withSavepoint(sql, async () => {
      await sql`
        insert into persons (
          id, chapter_id, display_name, given_name, family_name, email, phone,
          source, country, news_consent, news_consent_at
        ) values (
          ${id}, ${chapterId}, ${displayName}, ${givenName || null}, ${familyName || null}, ${input.email}, ${input.phone},
          ${"web"}, ${"United States"}, ${input.newsConsent},
          case when ${input.newsConsent} = 'yes' then now() else null end
        )
      `;
    });
    await sql`insert into person_roles (person_id, role_key) values (${id}, ${"friend"})`;
    return {
      id,
      display_name: displayName,
      given_name: givenName || null,
      family_name: familyName || null,
      dietary: null,
      created: true,
      linkedByEmail: false,
    };
  } catch (err) {
    if (!isUniqueViolation(err) || input.email) throw err;
    const existing = await sql<PersonSnap>`
      select id, display_name, given_name, family_name, dietary
      from persons
      where chapter_id = ${chapterId} and email is null and lower(display_name) = ${displayName.toLowerCase()}
      limit 1
    `;
    const row = existing[0];
    if (!row) throw err;
    return { ...row, created: false, linkedByEmail: false };
  }
}

async function personByEmail(sql: Sql, chapterId: string, email: string): Promise<PersonSnap | null> {
  const found = await findPersonByEmail(sql, chapterId, email);
  if (!found) return null;
  const rows = await sql<PersonSnap>`
    select id, display_name, given_name, family_name, dietary
    from persons
    where id = ${found.id} and chapter_id = ${chapterId}
    limit 1
  `;
  return rows[0] ?? null;
}

async function addTask(
  sql: Sql,
  chapterId: string,
  title: string,
  dueOn: string,
  eventId: string,
  personId: string,
) {
  const id = nid();
  await sql`
    insert into tasks (id, chapter_id, title, due_on, status, event_id, person_id, hat)
    values (${id}, ${chapterId}, ${title}, ${dueOn}, ${"open"}, ${eventId}, ${personId}, ${"secretary"})
  `;
}

function confirmationText(input: {
  purchaserName: string;
  eventTitle: string;
  code: string;
  names: string[];
  whenLabel: string | null;
  location: string | null;
  pageUrl: string;
  contactLine: string | null;
}): string {
  const lines = [
    `Hello ${input.purchaserName},`,
    "",
    `You're registered for ${input.eventTitle}.`,
    `Code: ${input.code}`,
    "",
    "Attendees:",
    ...input.names,
  ];
  const place = [input.whenLabel, input.location].filter((line): line is string => Boolean(line?.trim()));
  if (place.length) lines.push("", ...place);
  lines.push("", `Your registration page: ${input.pageUrl}`);
  if (input.contactLine?.trim()) lines.push("", input.contactLine.trim());
  return lines.join("\n");
}

/** Public register page. Null until an editor turns registration on. */
export const getRegisterPage = createServerFn({ method: "GET" })
  .validator((slug: string) => z.string().min(1).max(200).parse(slug))
  .handler(async ({ data: slug }) => {
    const sql = await getSql();
    const chapterId = await firstChapterId(sql);
    if (!chapterId) return null;
    const event = await findRegistrationEvent(sql, chapterId, slug);
    if (!event?.enabled) return null;
    const now = new Date();
    const [catalog, agreements, guardian] = await Promise.all([
      loadCatalog(sql, chapterId, event.eventId, now),
      latestAgreements(sql, chapterId, event.eventId),
      latestGuardianText(sql, chapterId, event.eventId),
    ]);
    return registerPayload(event, catalog, agreements, guardian);
  });

/** Same page for an editor or a viewer, including while the switch is off. */
export const getRegisterPreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((slug: string) => z.string().min(1).max(200).parse(slug))
  .handler(async ({ context, data: slug }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    const event = await findRegistrationEvent(sql, member.chapterId, slug);
    if (!event) return null;
    const now = new Date();
    const [catalog, agreements, guardian] = await Promise.all([
      loadCatalog(sql, member.chapterId, event.eventId, now),
      latestAgreements(sql, member.chapterId, event.eventId),
      latestGuardianText(sql, member.chapterId, event.eventId),
    ]);
    return registerPayload(event, catalog, agreements, guardian);
  });

function keepRegistrationError(message: string): boolean {
  return (
    message === "The same person is listed twice." ||
    message.startsWith("There is already a registration for ") ||
    message.endsWith(" is full.")
  );
}

export const createRegistration = createServerFn({ method: "POST" })
  .validator(registrationInput.parse)
  .handler(async ({ data }) => {
    if ((data.website ?? "").trim()) throw new Error("Please try again.");
    const sql = await getSql();
    const ip = clientIp();
    // A raw IP is never stored. The throttle key is a hash.
    const throttleKey = `register:${hashInviteToken(ip)}`;
    const throttled = await sql<{ count: number | string }>`
      insert into public_throttle (key, window_start, count) values (${throttleKey}, now(), 1)
      on conflict (key) do update set
        count = case when public_throttle.window_start < now() - interval '1 hour' then 1 else public_throttle.count + 1 end,
        window_start = case when public_throttle.window_start < now() - interval '1 hour' then now() else public_throttle.window_start end
      returning count
    `;
    if (asNumber(throttled[0]?.count) > THROTTLE_LIMIT) {
      throw new Error("Too many attempts. Please try again in an hour.");
    }

    const mode = turnstileMode({
      siteKey: readEnv("TURNSTILE_SITE_KEY"),
      secretKey: readEnv("TURNSTILE_SECRET_KEY"),
    });
    if (mode === "misconfigured") throw new Error("Registration is not available right now.");
    if (mode === "verify") await verifyTurnstile(data.turnstileToken, ip, readEnv("TURNSTILE_SECRET_KEY") ?? "");

    const chapterId = await firstChapterId(sql);
    const event = chapterId ? await findRegistrationEvent(sql, chapterId, data.slug.trim()) : null;
    if (!chapterId || !event?.enabled) throw new Error("Registration is not open.");

    const now = new Date();
    const [catalog, agreements, guardianText] = await Promise.all([
      loadCatalog(sql, chapterId, event.eventId, now),
      latestAgreements(sql, chapterId, event.eventId),
      latestGuardianText(sql, chapterId, event.eventId),
    ]);
    const staleText = shownTextMismatch({
      currentAgreementIds: agreements.map((row) => row.id),
      currentConsentId: guardianText?.id ?? null,
      sentAgreementIds: data.acceptedAgreementIds,
      sentConsentId: data.consentTextId,
      consentRequired: Boolean(guardianText) && data.attendees.some((person) => person.under18),
    });
    if (staleText) throw new Error(staleText);
    if (!agreementsAccepted(agreements.map((row) => row.id), data.acceptedAgreementIds)) {
      throw new Error("The terms changed while you were registering. Please review them and agree again.");
    }
    if (!data.purchaser.name.trim()) throw new Error("Enter the purchaser's name.");
    const plan = planRegistration(
      {
        attendees: data.attendees.map((person) => ({
          givenName: person.givenName,
          familyName: person.familyName,
          email: person.email,
          under18: person.under18,
          admissionId: person.admissionId,
          addOnIds: person.addOnIds,
        })),
      },
      catalog,
      now,
      { guardianConsent: Boolean(guardianText) },
    );
    if (!plan.ok) throw new Error(plan.error);
    const paidError = paidRegistrationError({
      totalCents: plan.totalCents,
      attendeeCount: data.attendees.length,
      lines: plan.lines.map((line) => {
        const ticket = catalog.tickets.find((item) => item.id === line.ticketId);
        return { priceCents: line.priceCents, kind: ticket?.kind ?? "", paymentLink: ticket?.payment_link ?? null };
      }),
    });
    if (paidError) throw new Error(paidError);
    const registrationStatus = plan.totalCents > 0 ? "pending" : "free";
    for (const person of data.attendees) {
      if (!person.under18 || person.consent === "later") continue;
      if (!guardianText) throw new Error("Registration for students under 18 is not open yet.");
      const message = guardianConsentErrors(consentInput(person))[0];
      if (message) throw new Error(message);
    }
    // Same hash the throttle stores. The address itself is not saved on the consent.
    const signedIp = hashInviteToken(ip);

    const titles = new Map(catalog.parts.map((part) => [part.id, part.title]));
    try {
      return await withTransaction(async (tx) => {
        const locked = await tx<{ id: string }>`
          select id from events where id = ${event.eventId} and chapter_id = ${chapterId} for update
        `;
        if (!locked[0]) throw new Error("Registration could not be completed. Please try again.");

        const repeated = duplicateAttendees(data.attendees);
        if (repeated) throw new Error(repeated);

        const purchaserEmail = lowerEmail(data.purchaser.email);
        if (!purchaserEmail) throw new Error("Registration could not be completed. Please try again.");
        const emails = [purchaserEmail];
        for (const person of data.attendees) {
          const email = lowerEmail(person.email);
          if (email && !emails.includes(email)) emails.push(email);
        }
        const conflicts = await tx<{ email: string }>`
          select lower(r.purchaser_email) as email
          from registrations r
          where r.chapter_id = ${chapterId}
            and r.event_id = ${event.eventId}
            and r.status <> 'cancelled'
            and r.status <> 'expired'
            and lower(r.purchaser_email) = any(${emails}::text[])
          union
          select lower(a.email) as email
          from registration_attendees a
          join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
          where a.chapter_id = ${chapterId}
            and r.event_id = ${event.eventId}
            and r.status <> 'cancelled'
            and r.status <> 'expired'
            and a.cancelled_at is null
            and a.email is not null
            and lower(a.email) = any(${emails}::text[])
        `;
        const found = new Set(conflicts.map((row) => (row.email ?? "").toLowerCase()));
        const hit = emails.find((email) => found.has(email));
        if (hit) throw new Error(duplicateRegistrationMessage(hit));

        await takeSeats(tx, chapterId, plan.partNeeds, titles);

        const purchaserName = data.purchaser.name.trim();
        let purchaser = await personByEmail(tx, chapterId, purchaserEmail);
        if (!purchaser) {
          const split = splitWalkupName(purchaserName);
          try {
            purchaser = await createWebPerson(tx, chapterId, {
              givenName: split.givenName,
              familyName: split.familyName,
              email: purchaserEmail,
              phone: blankToNull(data.purchaser.phone),
              newsConsent: data.newsOptIn ? "yes" : "no",
            });
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            purchaser = await personByEmail(tx, chapterId, purchaserEmail);
            if (!purchaser) throw err;
          }
        }

        const registrationId = nid();
        const token = newInviteToken();
        const tokenHash = hashInviteToken(token);
        const year = eventYear(event.startsAt, event.timezone || event.chapterTimezone, now);
        let code = "";
        let inserted = false;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          code = registrationCode(year, randomCodeBytes());
          try {
            await withSavepoint(tx, async () => {
              await tx`
                insert into registrations (
                  id, chapter_id, event_id, code, status,
                  purchaser_name, purchaser_email, purchaser_phone, purchaser_person_id,
                  total_cents, news_opt_in, heard_from, utm_source, manage_token_hash
                ) values (
                  ${registrationId}, ${chapterId}, ${event.eventId}, ${code}, ${registrationStatus},
                  ${purchaserName}, ${purchaserEmail}, ${blankToNull(data.purchaser.phone)}, ${purchaser.id},
                  ${plan.totalCents}, ${data.newsOptIn}, ${blankToNull(data.heardFrom)}, ${blankToNull(data.utmSource)}, ${tokenHash}
                )
              `;
            });
            inserted = true;
            break;
          } catch (err) {
            if (!isUniqueViolation(err) || attempt === 4) throw err;
          }
        }
        if (!inserted) throw new Error("Registration could not be completed. Please try again.");

        const dueOn = dueInSevenDays(event.chapterTimezone || event.timezone, now);
        const attendeeNames: string[] = [];
        for (let index = 0; index < data.attendees.length; index += 1) {
          const typed = data.attendees[index];
          const given = typed.givenName.trim();
          const family = typed.familyName.trim();
          const email = lowerEmail(typed.email);
          const byEmail = email ? await personByEmail(tx, chapterId, email) : null;
          const sameName = await tx<{ id: string; email: string | null }>`
            select id, email from persons
            where chapter_id = ${chapterId}
              and lower(coalesce(given_name, '')) = ${given.toLowerCase()}
              and lower(coalesce(family_name, '')) = ${family.toLowerCase()}
            order by id
          `;
          const matched = matchAttendee({ email, givenName: given, familyName: family }, byEmail, sameName);
          let person: WebPerson | PersonSnap;
          let review: ReturnType<typeof reviewChanges> = null;
          if (matched.action === "link" && byEmail) {
            person = byEmail;
            review = reviewChanges(
              { given_name: byEmail.given_name, family_name: byEmail.family_name, dietary: byEmail.dietary },
              { givenName: given, familyName: family, dietary: typed.dietary },
            );
            if (review) {
              await addTask(
                tx,
                chapterId,
                `Web registration: check changes for ${byEmail.display_name}`,
                dueOn,
                event.eventId,
                byEmail.id,
              );
            }
          } else {
            let created: WebPerson;
            try {
              created = await createWebPerson(tx, chapterId, {
                givenName: given,
                familyName: family,
                email,
                phone: null,
                newsConsent: "no",
              });
            } catch (err) {
              if (!isUniqueViolation(err) || !email) throw err;
              const again = await personByEmail(tx, chapterId, email);
              if (!again) throw err;
              created = { ...again, created: false, linkedByEmail: true };
            }
            person = created;
            if (!created.created && created.linkedByEmail) {
              review = reviewChanges(
                { given_name: created.given_name, family_name: created.family_name, dietary: created.dietary },
                { givenName: given, familyName: family, dietary: typed.dietary },
              );
              if (review) {
                await addTask(
                  tx,
                  chapterId,
                  `Web registration: check changes for ${created.display_name}`,
                  dueOn,
                  event.eventId,
                  created.id,
                );
              }
            } else if (!created.created) {
              review = reviewChanges(
                { given_name: created.given_name, family_name: created.family_name, dietary: created.dietary },
                { givenName: given, familyName: family, dietary: typed.dietary },
              );
              await addTask(
                tx,
                chapterId,
                `Web registration: check ${created.display_name} (matched by name only)`,
                dueOn,
                event.eventId,
                created.id,
              );
            } else if (matched.action === "create" && matched.possibleDuplicateOf) {
              await addTask(
                tx,
                chapterId,
                `Web registration: possible duplicate of ${created.display_name}`,
                dueOn,
                event.eventId,
                created.id,
              );
            }
          }

          const attendeeId = nid();
          const reviewJson = review ? JSON.stringify(review) : null;
          await tx`
            insert into registration_attendees (
              id, chapter_id, registration_id, given_name, family_name, email,
              badge_affiliation, dietary, accessibility, person_id, review_changes, is_minor
            ) values (
              ${attendeeId}, ${chapterId}, ${registrationId}, ${given}, ${family}, ${email},
              ${blankToNull(typed.badgeAffiliation)}, ${blankToNull(typed.dietary)}, ${blankToNull(typed.accessibility)},
              ${person.id}, ${reviewJson}::jsonb, ${typed.under18}
            )
          `;
          if (typed.under18 && typed.consent !== "later") {
            if (!guardianText) throw new Error("Registration for students under 18 is not open yet.");
            await writeOnlineConsent(tx, {
              chapterId,
              attendeeId,
              studentPersonId: person.id,
              textId: guardianText.id,
              signedIp,
              consent: consentInput(typed),
              inTransaction: true,
            });
          }
          for (const line of plan.lines.filter((item) => item.attendeeIndex === index)) {
            await tx`
              insert into attendee_items (attendee_id, ticket_type_id, price_cents)
              values (${attendeeId}, ${line.ticketId}, ${line.priceCents})
            `;
          }
          const participationId = await placeParticipation(tx, {
            chapterId,
            eventId: event.eventId,
            personId: person.id,
            attendeeId,
            dietary: blankToNull(typed.dietary),
          });
          await tx`
            update registration_attendees set participation_id = ${participationId}
            where id = ${attendeeId} and chapter_id = ${chapterId}
          `;
          attendeeNames.push(`${given} ${family}`.trim());
        }

        const origin = publicOrigin({
          PUBLIC_ORIGIN: readEnv("PUBLIC_ORIGIN"),
          BETTER_AUTH_URL: readEnv("BETTER_AUTH_URL"),
        });
        const pageUrl = origin ? `${origin}/r/${token}` : `/r/${token}`;
        await tx`
          insert into mail_outbox (
            id, chapter_id, stream, template_key, to_address, to_name, person_id, registration_id,
            subject, text_body, status
          ) values (
            ${nid()}, ${chapterId}, ${"transactional"}, ${"registration_confirmation"},
            ${purchaserEmail}, ${purchaserName}, ${purchaser.id}, ${registrationId},
            ${`You're registered: ${event.title}`},
            ${confirmationText({
              purchaserName,
              eventTitle: event.title,
              code,
              names: attendeeNames,
              whenLabel: event.whenLabel,
              location: event.location,
              pageUrl,
              contactLine: event.contactLine,
            })},
            ${"held"}
          )
        `;
        await recordAudit(tx, {
          chapterId,
          actor: "public",
          action: "registration_created",
          entity: "registration",
          entityId: registrationId,
          detail: {
            code,
            attendees: data.attendees.length,
            agreements: data.acceptedAgreementIds,
            eventId: event.eventId,
          },
        });
        const pricedAdmission = catalog.tickets.find(
          (ticket) =>
            ticket.kind === "admission" &&
            plan.lines.some((line) => line.ticketId === ticket.id && line.priceCents > 0),
        );
        const link = registrationStatus === "pending" ? (pricedAdmission?.payment_link ?? "").trim() : "";
        return {
          manageUrl: `/r/${token}`,
          code,
          status: registrationStatus,
          totalCents: plan.totalCents,
          ...(link ? { payUrl: payUrl(link, code, purchaserEmail) } : {}),
        };
      });
    } catch (err) {
      if (err instanceof Error && keepRegistrationError(err.message)) throw err;
      throw new Error("Registration could not be completed. Please try again.");
    }
  });

async function placeParticipation(
  sql: Sql,
  input: {
    chapterId: string;
    eventId: string;
    personId: string;
    attendeeId: string;
    dietary: string | null;
  },
): Promise<string> {
  const existing = await sql<{ id: string }>`
    select id
    from participations
    where chapter_id = ${input.chapterId} and event_id = ${input.eventId}
      and person_id = ${input.personId} and party_type = 'person'
    limit 1
  `;
  const updateRow = async (row: { id: string }) => {
    await sql`
      update participations set
        guest_status = 'attending',
        registration_attendee_id = ${input.attendeeId},
        dietary_for_this_event = coalesce(dietary_for_this_event, ${input.dietary})
      where id = ${row.id} and chapter_id = ${input.chapterId}
    `;
    return row.id;
  };
  if (existing[0]) return updateRow(existing[0]);
  const id = nid();
  try {
    await withSavepoint(sql, async () => {
      await sql`
        insert into participations (
          id, chapter_id, event_id, party_type, person_id, kind_key, guest_status, source,
          party_size, dietary_for_this_event, registration_attendee_id
        ) values (
          ${id}, ${input.chapterId}, ${input.eventId}, ${"person"}, ${input.personId}, ${"guest"},
          ${"attending"}, ${"web"}, ${1}, ${input.dietary}, ${input.attendeeId}
        )
      `;
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await sql<{ id: string }>`
      select id
      from participations
      where chapter_id = ${input.chapterId} and event_id = ${input.eventId}
        and person_id = ${input.personId} and party_type = 'person'
      limit 1
    `;
    if (!again[0]) throw err;
    return updateRow(again[0]);
  }
  return id;
}

export const getManagePage = createServerFn({ method: "GET" })
  .validator((token: string) => z.string().min(1).max(200).parse(token))
  .handler(async ({ data: token }) => {
    const sql = await getSql();
    const chapterId = await firstChapterId(sql);
    if (!chapterId) return null;
    const rows = await sql<{
      id: string;
      code: string;
      status: string;
      total_cents: number | string;
      purchaser_email: string;
      created_at: Date | string;
      event_title: string;
      when_label: string | null;
      location: string | null;
      kind: string | null;
      slug: string | null;
      starts_on: string | null;
      published: boolean | null;
      manage_message: string | null;
      contact_line: string | null;
      public_title: string | null;
    }>`
      select r.id, r.code, r.status, r.total_cents, r.purchaser_email, r.created_at, e.title as event_title,
             i.when_label, i.location, i.kind, i.slug, i.starts_on, i.published,
             rp.manage_message, c.contact_line, s.public_title
      from registrations r
      join events e on e.id = r.event_id and e.chapter_id = r.chapter_id
      join chapters c on c.id = r.chapter_id
      left join site_items i on i.id = e.public_item_id and i.chapter_id = e.chapter_id
      left join registration_pages rp on rp.event_id = e.id and rp.chapter_id = e.chapter_id
      left join site_settings s on s.chapter_id = r.chapter_id
      where r.chapter_id = ${chapterId} and r.manage_token_hash = ${hashInviteToken(token)}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const payLinks = await sql<{ payment_link: string | null }>`
      select t.payment_link
      from registration_attendees a
      join attendee_items ai on ai.attendee_id = a.id
      join ticket_types t on t.id = ai.ticket_type_id and t.chapter_id = a.chapter_id
      where a.registration_id = ${row.id}
        and a.chapter_id = ${chapterId}
        and a.cancelled_at is null
        and t.price_cents > 0
        and t.kind = 'admission'
      order by t.sort_order, t.name
      limit 1
    `;
    const link = row.status === "pending" ? storedPaymentLink(payLinks[0]?.payment_link) : null;
    const people = await sql<{
      id: string;
      given_name: string;
      family_name: string;
      is_minor: boolean;
      consent_on_file: boolean;
      ticket_name: string | null;
    }>`
      select a.id, a.given_name, a.family_name, a.is_minor,
        exists (
          select 1 from guardian_consents g
          where g.attendee_id = a.id and g.chapter_id = a.chapter_id
        ) as consent_on_file,
        t.name as ticket_name
      from registration_attendees a
      left join attendee_items ai on ai.attendee_id = a.id
      left join ticket_types t on t.id = ai.ticket_type_id
      where a.registration_id = ${row.id} and a.chapter_id = ${chapterId} and a.cancelled_at is null
      order by a.given_name, a.family_name, a.id, t.sort_order, t.name
    `;
    const grouped = new Map<string, { id: string; name: string; tickets: string[]; needsConsent: boolean }>();
    for (const person of people) {
      const current = grouped.get(person.id) ?? {
        id: person.id,
        name: `${person.given_name} ${person.family_name}`.trim(),
        tickets: [],
        needsConsent: Boolean(person.is_minor) && person.consent_on_file !== true,
      };
      if (person.ticket_name) current.tickets.push(person.ticket_name);
      grouped.set(person.id, current);
    }
    return {
      eventTitle: row.event_title,
      when_label: row.when_label,
      location: row.location,
      calendarHref: calendarHref({
        kind: row.kind ?? "",
        slug: row.slug,
        starts_on: row.starts_on,
        published: row.published === null ? undefined : row.published,
      }),
      code: row.code,
      status: row.status,
      totalCents: asNumber(row.total_cents),
      payUrl: link ? payUrl(link, row.code, row.purchaser_email) : null,
      created_at: iso(row.created_at) ?? "",
      attendees: [...grouped.values()],
      manage_message: row.manage_message,
      contact_line: row.contact_line,
      public_title: row.public_title,
    };
  });
