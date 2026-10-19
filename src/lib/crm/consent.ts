import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getSql } from "@/lib/db";
import {
  EMERGENCY_NAME_MAX,
  EMERGENCY_PHONE_MAX,
  GUARDIAN_EMAIL_MAX,
  GUARDIAN_NAME_MAX,
  GUARDIAN_PHONE_MAX,
  MEDICAL_NOTES_MAX,
  RELATIONSHIP_MAX,
  SIGNATURE_MAX,
  guardianConsentErrors,
  paperConsentErrors,
  studentPublicName,
  type GuardianConsentInput,
} from "@/lib/payments/consent-rules";
import { THROTTLE_LIMIT, turnstileMode } from "@/lib/payments/registration-rules";
import { bookRegistrationAllowed } from "./book-registration";
import { lowerEmail, nid } from "./ids";
import { composePersonName, splitWalkupName } from "./names";
import { hashInviteToken, newInviteToken } from "./operator-rules";
import { findPersonByEmail } from "./person-emails";

type Sql = Awaited<ReturnType<typeof getSql>>;

const INVALID_LINK = "This consent link is no longer valid.";

export type ConsentDetail = {
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  relationship: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  medicalNotes: string | null;
  photoRelease: boolean;
  method: string;
  signedName: string | null;
  signedAt: string | null;
  receivedAt: string | null;
};

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
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

async function firstChapterId(sql: Sql): Promise<string | null> {
  const rows = await sql<{ id: string }>`select id from chapters order by created_at limit 1`;
  return rows[0]?.id ?? null;
}

async function bumpThrottle(sql: Sql, key: string) {
  const throttled = await sql<{ count: number | string }>`
    insert into public_throttle (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when public_throttle.window_start < now() - interval '1 hour' then 1 else public_throttle.count + 1 end,
      window_start = case when public_throttle.window_start < now() - interval '1 hour' then now() else public_throttle.window_start end
    returning count
  `;
  const count = Number(throttled[0]?.count ?? 0);
  if (count > THROTTLE_LIMIT) throw new Error("Too many attempts. Please try again in an hour.");
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

export async function latestGuardianText(
  sql: Sql,
  chapterId: string,
  eventId: string,
): Promise<{ id: string; html: string } | null> {
  const rows = await sql<{ id: string; html: string }>`
    select id, html from consent_texts
    where event_id = ${eventId} and chapter_id = ${chapterId} and kind = 'guardian'
    order by created_at desc, id desc
    limit 1
  `;
  return rows[0] ?? null;
}

async function matchOrCreateGuardian(
  sql: Sql,
  chapterId: string,
  input: { name: string; email: string; phone: string },
): Promise<{ id: string; created: boolean }> {
  const found = await findPersonByEmail(sql, chapterId, input.email);
  if (found) return { id: found.id, created: false };
  const split = splitWalkupName(input.name);
  const givenName = split.givenName.trim();
  const familyName = (split.familyName ?? "").trim();
  const displayName = composePersonName({ givenName, familyName });
  const id = nid();
  try {
    await sql`
      insert into persons (
        id, chapter_id, display_name, given_name, family_name, email, phone,
        source, country, news_consent
      ) values (
        ${id}, ${chapterId}, ${displayName}, ${givenName || null}, ${familyName || null},
        ${input.email}, ${input.phone}, ${"web"}, ${"United States"}, ${"no"}
      )
    `;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await findPersonByEmail(sql, chapterId, input.email);
    if (!again) throw err;
    return { id: again.id, created: false };
  }
  try {
    await sql`insert into person_roles (person_id, role_key) values (${id}, ${"friend"})`;
  } catch (err) {
    await sql`delete from persons where id = ${id} and chapter_id = ${chapterId}`;
    throw err;
  }
  return { id, created: true };
}

/** Guardian person, relationship, and an online consent row. Pushes an undo for each new row. */
export async function writeOnlineConsent(
  sql: Sql,
  input: {
    chapterId: string;
    attendeeId: string;
    studentPersonId: string | null;
    textId: string;
    signedIp: string;
    consent: GuardianConsentInput;
    undos: Array<() => Promise<void>>;
  },
): Promise<void> {
  const message = guardianConsentErrors(input.consent)[0];
  if (message) throw new Error(message);
  const name = input.consent.guardianName.trim();
  const phone = input.consent.guardianPhone.trim();
  const email = lowerEmail(input.consent.guardianEmail);
  if (!email) throw new Error("Enter the guardian's email.");
  const guardian = await matchOrCreateGuardian(sql, input.chapterId, { name, email, phone });
  if (guardian.created) {
    const guardianId = guardian.id;
    input.undos.push(async () => {
      await sql`delete from persons where id = ${guardianId} and chapter_id = ${input.chapterId} and source = 'web'`;
    });
  }
  if (input.studentPersonId && input.studentPersonId !== guardian.id) {
    const studentId = input.studentPersonId;
    const linked = await sql<{ person_id: string }>`
      insert into person_relationships (person_id, related_person_id, kind)
      values (${guardian.id}, ${studentId}, ${"guardian_of"})
      on conflict do nothing
      returning person_id
    `;
    if (linked[0]) {
      const guardianId = guardian.id;
      input.undos.push(async () => {
        await sql`
          delete from person_relationships
          where person_id = ${guardianId} and related_person_id = ${studentId} and kind = 'guardian_of'
        `;
      });
    }
  }
  const consentId = nid();
  await sql`
    insert into guardian_consents (
      id, chapter_id, attendee_id, guardian_name, guardian_email, guardian_phone,
      relationship, emergency_name, emergency_phone, medical_notes, photo_release,
      consent_text_id, signed_name, signed_at, signed_ip, method
    ) values (
      ${consentId}, ${input.chapterId}, ${input.attendeeId}, ${name}, ${email}, ${phone},
      ${input.consent.relationship.trim()}, ${input.consent.emergencyName.trim()},
      ${input.consent.emergencyPhone.trim()}, ${blankToNull(input.consent.medicalNotes)},
      ${input.consent.photoRelease === true}, ${input.textId}, ${input.consent.signature.trim()},
      now(), ${input.signedIp}, ${"online"}
    )
  `;
  input.undos.push(async () => {
    await sql`delete from guardian_consents where id = ${consentId} and chapter_id = ${input.chapterId}`;
  });
}

type OpenConsent = {
  attendeeId: string;
  studentPersonId: string | null;
  eventId: string;
  givenName: string;
  familyName: string;
  eventTitle: string;
};

async function openConsent(sql: Sql, chapterId: string, tokenHash: string): Promise<OpenConsent | null> {
  const rows = await sql<{
    id: string;
    person_id: string | null;
    event_id: string;
    given_name: string;
    family_name: string;
    event_title: string;
  }>`
    select a.id, a.person_id, r.event_id, a.given_name, a.family_name, e.title as event_title
    from registration_attendees a
    join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
    join events e on e.id = r.event_id and e.chapter_id = r.chapter_id
    where a.chapter_id = ${chapterId}
      and a.consent_token_hash = ${tokenHash}
      and a.is_minor
      and a.cancelled_at is null
      and not exists (
        select 1 from guardian_consents g
        where g.attendee_id = a.id and g.chapter_id = a.chapter_id
      )
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    attendeeId: row.id,
    studentPersonId: row.person_id,
    eventId: row.event_id,
    givenName: row.given_name,
    familyName: row.family_name,
    eventTitle: row.event_title,
  };
}

/** New single-use link for a minor who has no consent yet. Stores only the hash. */
export async function issueConsentLink(sql: Sql, chapterId: string, attendeeId: string): Promise<string> {
  const rows = await sql<{ event_id: string }>`
    select r.event_id
    from registration_attendees a
    join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
    where a.id = ${attendeeId} and a.chapter_id = ${chapterId}
      and a.is_minor
      and a.cancelled_at is null
      and not exists (
        select 1 from guardian_consents g
        where g.attendee_id = a.id and g.chapter_id = a.chapter_id
      )
  `;
  const row = rows[0];
  if (!row) throw new Error("This student does not need a consent link.");
  const text = await latestGuardianText(sql, chapterId, row.event_id);
  if (!text) throw new Error("Add the guardian consent text before sending a consent link.");
  const token = newInviteToken();
  const updated = await sql<{ id: string }>`
    update registration_attendees
    set consent_token_hash = ${hashInviteToken(token)}
    where id = ${attendeeId} and chapter_id = ${chapterId}
      and is_minor
      and cancelled_at is null
      and not exists (
        select 1 from guardian_consents g
        where g.attendee_id = registration_attendees.id and g.chapter_id = registration_attendees.chapter_id
      )
    returning id
  `;
  if (!updated[0]) throw new Error("This student does not need a consent link.");
  return `/c/${token}`;
}

export async function recordPaperConsent(
  sql: Sql,
  input: {
    chapterId: string;
    eventId: string;
    attendeeId: string;
    guardianName: string;
    guardianPhone: string;
    receivedBy: string;
  },
): Promise<{ code: string }> {
  const message = paperConsentErrors(input)[0];
  if (message) throw new Error(message);
  const text = await latestGuardianText(sql, input.chapterId, input.eventId);
  if (!text) throw new Error("Add the guardian consent text before recording consent.");
  const rows = await sql<{ code: string }>`
    select r.code
    from registration_attendees a
    join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
    where a.id = ${input.attendeeId}
      and a.chapter_id = ${input.chapterId}
      and r.event_id = ${input.eventId}
      and a.is_minor
      and a.cancelled_at is null
      and not exists (
        select 1 from guardian_consents g
        where g.attendee_id = a.id and g.chapter_id = a.chapter_id
      )
  `;
  const attendee = rows[0];
  if (!attendee) throw new Error("This student does not need a paper consent.");
  await sql`
    insert into guardian_consents (
      id, chapter_id, attendee_id, guardian_name, guardian_phone, photo_release,
      consent_text_id, method, received_by, received_at
    ) values (
      ${nid()}, ${input.chapterId}, ${input.attendeeId}, ${input.guardianName.trim()},
      ${input.guardianPhone.trim()}, ${false}, ${text.id}, ${"paper"}, ${input.receivedBy}, now()
    )
  `;
  return { code: attendee.code };
}

/** Editors only. Medical notes and emergency contacts are not on the desk list. */
export async function readConsentDetail(
  sql: Sql,
  chapterId: string,
  eventId: string,
  attendeeId: string,
): Promise<ConsentDetail | null> {
  const rows = await sql<{
    guardian_name: string;
    guardian_phone: string;
    guardian_email: string | null;
    relationship: string | null;
    emergency_name: string | null;
    emergency_phone: string | null;
    medical_notes: string | null;
    photo_release: boolean;
    method: string;
    signed_name: string | null;
    signed_at: Date | string | null;
    received_at: Date | string | null;
  }>`
    select g.guardian_name, g.guardian_phone, g.guardian_email, g.relationship,
      g.emergency_name, g.emergency_phone, g.medical_notes, g.photo_release,
      g.method, g.signed_name, g.signed_at, g.received_at
    from guardian_consents g
    join registration_attendees a on a.id = g.attendee_id and a.chapter_id = g.chapter_id
    join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
    where g.attendee_id = ${attendeeId} and g.chapter_id = ${chapterId} and r.event_id = ${eventId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    guardianEmail: row.guardian_email,
    relationship: row.relationship,
    emergencyName: row.emergency_name,
    emergencyPhone: row.emergency_phone,
    medicalNotes: row.medical_notes,
    photoRelease: row.photo_release === true,
    method: row.method,
    signedName: row.signed_name,
    signedAt: iso(row.signed_at),
    receivedAt: iso(row.received_at),
  };
}

export const getConsentPage = createServerFn({ method: "GET" })
  .validator((token: unknown) => (typeof token === "string" ? token.trim().slice(0, 200) : ""))
  .handler(async ({ data: token }) => {
    if (
      !bookRegistrationAllowed(
        typeof process === "undefined" ? undefined : process.env.BOOK_REGISTRATION,
      )
    ) {
      return { valid: false as const };
    }
    if (!token) return { valid: false as const };
    const sql = await getSql();
    const chapterId = await firstChapterId(sql);
    if (!chapterId) return { valid: false as const };
    const open = await openConsent(sql, chapterId, hashInviteToken(token));
    if (!open) return { valid: false as const };
    const text = await latestGuardianText(sql, chapterId, open.eventId);
    if (!text) return { valid: false as const };
    return {
      valid: true as const,
      eventTitle: open.eventTitle,
      studentName: studentPublicName(open.givenName, open.familyName),
      html: text.html,
      turnstileSiteKey: readEnv("TURNSTILE_SITE_KEY") ?? null,
    };
  });

const consentSubmit = z.object({
  token: z.string().min(1).max(200),
  guardianName: z.string().max(GUARDIAN_NAME_MAX),
  guardianPhone: z.string().max(GUARDIAN_PHONE_MAX),
  guardianEmail: z.string().max(GUARDIAN_EMAIL_MAX).optional(),
  relationship: z.string().max(RELATIONSHIP_MAX),
  emergencyName: z.string().max(EMERGENCY_NAME_MAX),
  emergencyPhone: z.string().max(EMERGENCY_PHONE_MAX),
  medicalNotes: z.string().max(MEDICAL_NOTES_MAX).optional(),
  photoRelease: z.boolean(),
  agreed: z.boolean(),
  signature: z.string().max(SIGNATURE_MAX),
  turnstileToken: z.string().max(4096).optional(),
});

export const submitConsent = createServerFn({ method: "POST" })
  .validator(consentSubmit.parse)
  .handler(async ({ data }) => {
    if (
      !bookRegistrationAllowed(
        typeof process === "undefined" ? undefined : process.env.BOOK_REGISTRATION,
      )
    ) {
      throw new Error(INVALID_LINK);
    }
    const sql = await getSql();
    const ip = clientIp();
    await bumpThrottle(sql, `consent:${hashInviteToken(ip)}`);
    const mode = turnstileMode({
      siteKey: readEnv("TURNSTILE_SITE_KEY"),
      secretKey: readEnv("TURNSTILE_SECRET_KEY"),
    });
    if (mode === "misconfigured") throw new Error("This page is not available right now.");
    if (mode === "verify") await verifyTurnstile(data.turnstileToken, ip, readEnv("TURNSTILE_SECRET_KEY") ?? "");

    const chapterId = await firstChapterId(sql);
    const tokenHash = hashInviteToken(data.token.trim());
    const open = chapterId ? await openConsent(sql, chapterId, tokenHash) : null;
    if (!chapterId || !open) throw new Error(INVALID_LINK);
    const text = await latestGuardianText(sql, chapterId, open.eventId);
    if (!text) throw new Error(INVALID_LINK);
    const consent: GuardianConsentInput = {
      guardianName: data.guardianName,
      guardianPhone: data.guardianPhone,
      guardianEmail: data.guardianEmail,
      relationship: data.relationship,
      emergencyName: data.emergencyName,
      emergencyPhone: data.emergencyPhone,
      medicalNotes: data.medicalNotes,
      photoRelease: data.photoRelease,
      agreed: data.agreed,
      signature: data.signature,
    };
    const message = guardianConsentErrors(consent)[0];
    if (message) throw new Error(message);

    const undos: Array<() => Promise<void>> = [];
    try {
      await writeOnlineConsent(sql, {
        chapterId,
        attendeeId: open.attendeeId,
        studentPersonId: open.studentPersonId,
        textId: text.id,
        signedIp: hashInviteToken(ip),
        consent,
        undos,
      });
      const cleared = await sql<{ id: string }>`
        update registration_attendees
        set consent_token_hash = null
        where id = ${open.attendeeId} and chapter_id = ${chapterId} and consent_token_hash = ${tokenHash}
        returning id
      `;
      if (!cleared[0]) throw new Error(INVALID_LINK);
    } catch (err) {
      for (let i = undos.length - 1; i >= 0; i -= 1) {
        try {
          await undos[i]();
        } catch {
          // The visitor still sees one sentence.
        }
      }
      if (err instanceof Error && err.message === INVALID_LINK) throw err;
      throw new Error(INVALID_LINK);
    }
    return { ok: true as const };
  });

/** Purchaser manage page. The manage token is the proof; no operator sign-in. */
export const mintConsentLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().min(1).max(200),
      attendeeId: z.string().min(1).max(64),
    }).parse,
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const chapterId = await firstChapterId(sql);
    if (!chapterId) throw new Error("We couldn't find that registration.");
    const rows = await sql<{ id: string }>`
      select a.id
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      where a.id = ${data.attendeeId}
        and a.chapter_id = ${chapterId}
        and r.manage_token_hash = ${hashInviteToken(data.token.trim())}
    `;
    if (!rows[0]) throw new Error("We couldn't find that registration.");
    const path = await issueConsentLink(sql, chapterId, data.attendeeId);
    return { path };
  });
