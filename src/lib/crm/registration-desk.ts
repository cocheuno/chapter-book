import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { csvRow } from "./csv";
import { todayIn } from "./dates";
import { recordAudit } from "./audit";
import { nid } from "./ids";
import { assertEditor, loadMember } from "./member";
import { seatsLeft } from "@/lib/payments/pricing";
import { mealCounts, partReleases, seatDrift } from "@/lib/payments/registration-desk";

type Sql = Awaited<ReturnType<typeof getSql>>;

const nameField = z.string().trim().min(1).max(100);

function asNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function plusDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dueInSevenDays(timeZone: string): string {
  let today: string;
  try {
    today = todayIn(timeZone);
  } catch {
    today = todayIn("UTC");
  }
  return plusDays(today, 7);
}

function fullName(given: string, family: string): string {
  return `${given} ${family}`.trim();
}

function csvFile(header: string[], rows: unknown[][]): string {
  return [csvRow(header), ...rows.map((row) => csvRow(row))].join("\n");
}

async function editor(userId: string) {
  const member = await loadMember(userId);
  assertEditor(member.role);
  return member;
}

async function requireEvent(sql: Sql, chapterId: string, eventId: string) {
  const rows = await sql<{ id: string }>`
    select id from events
    where id = ${eventId} and chapter_id = ${chapterId}
  `;
  if (!rows[0]) throw new Error("Event not found");
  return rows[0];
}

/** Cancels one attendee, then releases one seat per distinct part. False when already cancelled. */
async function releaseAttendee(sql: Sql, chapterId: string, eventId: string, attendeeId: string): Promise<boolean> {
  const marked = await sql<{ id: string }>`
    update registration_attendees set cancelled_at = now()
    where id = ${attendeeId} and chapter_id = ${chapterId} and cancelled_at is null
    returning id
  `;
  if (!marked[0]) return false;
  const parts = await sql<{ part_id: string }>`
    select distinct tp.part_id
    from attendee_items ai
    join registration_attendees a on a.id = ai.attendee_id and a.chapter_id = ${chapterId}
    join ticket_type_parts tp on tp.ticket_type_id = ai.ticket_type_id
    join event_parts p on p.id = tp.part_id and p.chapter_id = a.chapter_id and p.event_id = ${eventId}
    where ai.attendee_id = ${attendeeId}
  `;
  for (const partId of Object.keys(partReleases(parts.map((part) => part.part_id)))) {
    const moved = await sql<{ id: string }>`
      update event_parts set taken = greatest(taken - 1, 0)
      where id = ${partId} and chapter_id = ${chapterId}
      returning id
    `;
    if (!moved[0]) {
      // The part is not in this chapter, so this click did not release a seat.
      continue;
    }
  }
  await sql`
    update participations set guest_status = 'declined'
    where chapter_id = ${chapterId}
      and registration_attendee_id = ${attendeeId}
      and guest_status in ('attending', 'no_response', 'waitlisted')
    returning id
  `;
  return true;
}

async function cancelOpenAttendees(sql: Sql, chapterId: string, eventId: string, registrationId: string) {
  const rows = await sql<{ id: string }>`
    select id from registration_attendees
    where registration_id = ${registrationId} and chapter_id = ${chapterId} and cancelled_at is null
  `;
  let cancelled = 0;
  for (const row of rows) {
    if (await releaseAttendee(sql, chapterId, eventId, row.id)) cancelled += 1;
  }
  return cancelled;
}

async function cancelHeldMail(sql: Sql, chapterId: string, registrationId: string) {
  await sql`
    update mail_outbox set status = 'cancelled'
    where chapter_id = ${chapterId} and registration_id = ${registrationId} and status = 'held'
    returning id
  `;
}

export const getRegistrationDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((eventId: string) => z.string().min(1).parse(eventId))
  .handler(async ({ context, data: eventId }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    const events = await sql<{ id: string; title: string; slug: string | null; switch_on: boolean }>`
      select e.id, e.title, i.slug, coalesce(rp.use_book_registration, false) as switch_on
      from events e
      left join site_items i on i.id = e.public_item_id and i.chapter_id = e.chapter_id
      left join registration_pages rp on rp.event_id = e.id and rp.chapter_id = e.chapter_id
      where e.id = ${eventId} and e.chapter_id = ${member.chapterId}
    `;
    const event = events[0];
    if (!event) throw new Error("Event not found");

    const partRows = await sql<{
      id: string;
      title: string;
      capacity: number | null;
      held: number;
      taken: number;
      is_meal: boolean;
      sort_order: number;
    }>`
      select id, title, capacity, held, taken, is_meal, sort_order
      from event_parts
      where event_id = ${eventId} and chapter_id = ${member.chapterId}
      order by sort_order, title
    `;
    const parts = partRows.map((part) => {
      const capacity = asNumberOrNull(part.capacity);
      const held = asNumber(part.held);
      const taken = asNumber(part.taken);
      return {
        id: part.id,
        title: part.title,
        capacity,
        held,
        taken,
        left: seatsLeft({ capacity, held, taken }),
        isMeal: Boolean(part.is_meal),
        sortOrder: asNumber(part.sort_order),
      };
    });

    const ticketRows = await sql<{ id: string; name: string; kind: string; count: number }>`
      select t.id, t.name, t.kind,
        count(distinct case
          when a.cancelled_at is null and r.status in ('free', 'paid', 'pending') then a.id
        end)::int as count
      from ticket_types t
      left join attendee_items ai on ai.ticket_type_id = t.id
      left join registration_attendees a on a.id = ai.attendee_id and a.chapter_id = t.chapter_id
      left join registrations r
        on r.id = a.registration_id and r.chapter_id = a.chapter_id and r.event_id = t.event_id
      where t.chapter_id = ${member.chapterId} and t.event_id = ${eventId}
      group by t.id, t.name, t.kind, t.sort_order
      order by t.sort_order, t.name
    `;

    const countedRows = await sql<{ part_id: string; n: number }>`
      select p.id as part_id, count(distinct a.id)::int as n
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      join attendee_items ai on ai.attendee_id = a.id
      join ticket_type_parts tp on tp.ticket_type_id = ai.ticket_type_id
      join event_parts p on p.id = tp.part_id and p.chapter_id = a.chapter_id and p.event_id = r.event_id
      where a.chapter_id = ${member.chapterId}
        and r.event_id = ${eventId}
        and a.cancelled_at is null
        and r.status in ('free', 'paid', 'pending')
      group by p.id
    `;
    const counted: Record<string, number> = {};
    for (const row of countedRows) counted[row.part_id] = asNumber(row.n);

    const mealRows = await sql<{ attendee_id: string; part_id: string; part_title: string; dietary: string | null }>`
      select distinct a.id as attendee_id, p.id as part_id, p.title as part_title, a.dietary
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      join attendee_items ai on ai.attendee_id = a.id
      join ticket_type_parts tp on tp.ticket_type_id = ai.ticket_type_id
      join event_parts p on p.id = tp.part_id and p.chapter_id = a.chapter_id and p.event_id = r.event_id
      where a.chapter_id = ${member.chapterId}
        and r.event_id = ${eventId}
        and a.cancelled_at is null
        and r.status in ('free', 'paid', 'pending')
        and p.is_meal
    `;

    const registrationRows = await sql<{
      id: string;
      code: string;
      status: string;
      created_at: string;
      purchaser_name: string;
      purchaser_email: string;
      purchaser_phone: string | null;
      needs_review: string | null;
    }>`
      select r.id, r.code, r.status,
        to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
        r.purchaser_name, r.purchaser_email, r.purchaser_phone, r.needs_review
      from registrations r
      where r.chapter_id = ${member.chapterId} and r.event_id = ${eventId}
      order by r.created_at desc, r.id desc
    `;

    const attendeeRows = await sql<{
      id: string;
      registration_id: string;
      given_name: string;
      family_name: string;
      email: string | null;
      badge_affiliation: string | null;
      dietary: string | null;
      accessibility: string | null;
      cancelled_at: Date | string | null;
      review_changes: unknown;
      ticket_name: string | null;
    }>`
      select a.id, a.registration_id, a.given_name, a.family_name, a.email, a.badge_affiliation,
        a.dietary, a.accessibility, a.cancelled_at, a.review_changes, t.name as ticket_name
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      left join attendee_items ai on ai.attendee_id = a.id
      left join ticket_types t on t.id = ai.ticket_type_id and t.chapter_id = a.chapter_id
      where a.chapter_id = ${member.chapterId} and r.event_id = ${eventId}
      order by a.given_name, a.family_name, a.id, t.sort_order, t.name
    `;

    const mailRows = await sql<{ registration_id: string; status: string }>`
      select distinct on (m.registration_id) m.registration_id, m.status
      from mail_outbox m
      join registrations r on r.id = m.registration_id and r.chapter_id = m.chapter_id
      where m.chapter_id = ${member.chapterId}
        and r.event_id = ${eventId}
        and m.template_key = 'registration_confirmation'
      order by m.registration_id, m.created_at desc, m.id desc
    `;
    const confirmation = new Map(mailRows.map((row) => [row.registration_id, row.status]));

    const attendeesByRegistration = new Map<
      string,
      {
        id: string;
        givenName: string;
        familyName: string;
        email: string | null;
        badgeAffiliation: string | null;
        dietary: string | null;
        accessibility: string | null;
        tickets: string[];
        cancelled: boolean;
        review: boolean;
      }[]
    >();
    for (const row of attendeeRows) {
      const list = attendeesByRegistration.get(row.registration_id) ?? [];
      let attendee = list.find((item) => item.id === row.id);
      if (!attendee) {
        attendee = {
          id: row.id,
          givenName: row.given_name,
          familyName: row.family_name,
          email: row.email,
          badgeAffiliation: row.badge_affiliation,
          dietary: row.dietary,
          accessibility: row.accessibility,
          tickets: [],
          cancelled: row.cancelled_at != null,
          review: row.review_changes != null,
        };
        list.push(attendee);
        attendeesByRegistration.set(row.registration_id, list);
      }
      if (row.ticket_name) attendee.tickets.push(row.ticket_name);
    }

    const totals = await sql<{ active_registrations: number; since_yesterday: number }>`
      select
        count(*) filter (where status in ('free', 'paid', 'pending'))::int as active_registrations,
        count(*) filter (
          where status in ('free', 'paid', 'pending') and created_at >= now() - interval '24 hours'
        )::int as since_yesterday
      from registrations
      where chapter_id = ${member.chapterId} and event_id = ${eventId}
    `;
    const people = await sql<{ n: number }>`
      select count(*)::int as n
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      where a.chapter_id = ${member.chapterId}
        and r.event_id = ${eventId}
        and a.cancelled_at is null
        and r.status in ('free', 'paid', 'pending')
    `;

    return {
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        switchOn: Boolean(event.switch_on),
      },
      role: member.role,
      parts,
      tickets: ticketRows.map((ticket) => ({
        id: ticket.id,
        name: ticket.name,
        kind: ticket.kind,
        count: asNumber(ticket.count),
      })),
      meals: mealCounts(
        mealRows.map((row) => ({ partId: row.part_id, partTitle: row.part_title, dietary: row.dietary })),
      ),
      drift: seatDrift(parts, counted),
      registrations: registrationRows.map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        createdAt: row.created_at,
        purchaserName: row.purchaser_name,
        purchaserEmail: row.purchaser_email,
        purchaserPhone: row.purchaser_phone,
        needsReview: row.needs_review,
        confirmationStatus: confirmation.get(row.id) ?? null,
        attendees: attendeesByRegistration.get(row.id) ?? [],
      })),
      totals: {
        activeRegistrations: asNumber(totals[0]?.active_registrations),
        activeAttendees: asNumber(people[0]?.n),
        sinceYesterday: asNumber(totals[0]?.since_yesterday),
      },
    };
  });

export const cancelAttendee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), attendeeId: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; registration_id: string; status: string; code: string }>`
      select a.id, r.id as registration_id, r.status, r.code
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      where a.id = ${data.attendeeId} and a.chapter_id = ${member.chapterId} and r.event_id = ${data.eventId}
    `;
    const attendee = rows[0];
    if (!attendee) throw new Error("Attendee not found.");
    if (attendee.status !== "free") throw new Error("Only free registrations can be cancelled here for now.");
    const released = await releaseAttendee(sql, member.chapterId, data.eventId, attendee.id);
    if (!released) throw new Error("Already cancelled.");
    const remaining = await sql<{ n: number }>`
      select count(*)::int as n from registration_attendees
      where registration_id = ${attendee.registration_id}
        and chapter_id = ${member.chapterId}
        and cancelled_at is null
    `;
    if (asNumber(remaining[0]?.n) === 0) {
      const closed = await sql<{ id: string }>`
        update registrations set status = 'cancelled', cancelled_at = now()
        where id = ${attendee.registration_id} and chapter_id = ${member.chapterId} and status = 'free'
        returning id
      `;
      if (closed[0]) {
        await cancelHeldMail(sql, member.chapterId, attendee.registration_id);
        await recordAudit(sql, {
          chapterId: member.chapterId,
          actor: member.userId,
          action: "registration_cancelled",
          entity: "registration",
          entityId: attendee.registration_id,
          detail: { code: attendee.code, attendees: 0, reason: "last attendee cancelled", eventId: data.eventId },
        });
      }
    }
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "attendee_cancelled",
      entity: "registration_attendee",
      entityId: attendee.id,
      detail: { code: attendee.code, registrationId: attendee.registration_id, eventId: data.eventId },
    });
    return { ok: true };
  });

export const cancelRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), registrationId: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    const saved = await sql<{ id: string; code: string }>`
      update registrations set status = 'cancelled', cancelled_at = now()
      where id = ${data.registrationId}
        and chapter_id = ${member.chapterId}
        and event_id = ${data.eventId}
        and status = 'free'
      returning id, code
    `;
    const registration = saved[0];
    if (!registration) throw new Error("Only free registrations can be cancelled here for now.");
    const attendees = await cancelOpenAttendees(sql, member.chapterId, data.eventId, registration.id);
    await cancelHeldMail(sql, member.chapterId, registration.id);
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "registration_cancelled",
      entity: "registration",
      entityId: registration.id,
      detail: { code: registration.code, attendees, eventId: data.eventId },
    });
    return { ok: true };
  });

export const renameAttendee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      attendeeId: z.string().min(1),
      givenName: nameField,
      familyName: nameField,
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      given_name: string;
      family_name: string;
      person_id: string | null;
      code: string;
    }>`
      select a.id, a.given_name, a.family_name, a.person_id, r.code
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      where a.id = ${data.attendeeId}
        and a.chapter_id = ${member.chapterId}
        and a.cancelled_at is null
        and r.event_id = ${data.eventId}
        and r.status in ('free', 'paid', 'pending')
    `;
    const current = rows[0];
    if (!current) throw new Error("Attendee not found.");
    const saved = await sql<{ id: string }>`
      update registration_attendees set given_name = ${data.givenName}, family_name = ${data.familyName}
      where id = ${current.id} and chapter_id = ${member.chapterId} and cancelled_at is null
      returning id
    `;
    if (!saved[0]) throw new Error("Attendee not found.");
    const from = fullName(current.given_name, current.family_name);
    const to = fullName(data.givenName, data.familyName);
    await sql`
      insert into tasks (id, chapter_id, title, due_on, status, event_id, person_id, hat)
      values (
        ${nid()}, ${member.chapterId},
        ${`Registration ${current.code}: ${from} renamed to ${to}. Check the person record.`},
        ${dueInSevenDays(member.timezone)}, ${"open"}, ${data.eventId}, ${current.person_id}, ${"secretary"}
      )
    `;
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "attendee_renamed",
      entity: "registration_attendee",
      entityId: current.id,
      detail: { code: current.code, from, to, eventId: data.eventId },
    });
    return { id: current.id };
  });

export const getConfirmationEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), registrationId: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    const registrations = await sql<{ id: string; code: string }>`
      select id, code from registrations
      where id = ${data.registrationId} and chapter_id = ${member.chapterId} and event_id = ${data.eventId}
    `;
    const registration = registrations[0];
    if (!registration) throw new Error("Registration not found.");
    const rows = await sql<{ to_address: string; subject: string; text_body: string; status: string }>`
      select to_address, subject, text_body, status
      from mail_outbox
      where chapter_id = ${member.chapterId}
        and registration_id = ${registration.id}
        and template_key = 'registration_confirmation'
      order by created_at desc, id desc
      limit 1
    `;
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "confirmation_viewed",
      entity: "registration",
      entityId: registration.id,
      detail: { code: registration.code, eventId: data.eventId },
    });
    const row = rows[0];
    if (!row) return null;
    return { to: row.to_address, subject: row.subject, body: row.text_body, status: row.status };
  });

async function exportAudit(sql: Sql, chapterId: string, actor: string, eventId: string, kind: string, rows: number) {
  await recordAudit(sql, {
    chapterId,
    actor,
    action: "export",
    entity: "event",
    entityId: eventId,
    detail: { kind, rows },
  });
}

export const exportRegistrationAttendees = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((eventId: string) => z.string().min(1).parse(eventId))
  .handler(async ({ context, data: eventId }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, eventId);
    const rows = await sql<{
      code: string;
      registration_status: string;
      registered_at_utc: string;
      purchaser_name: string;
      purchaser_email: string;
      purchaser_phone: string | null;
      given_name: string;
      family_name: string;
      attendee_email: string | null;
      badge_affiliation: string | null;
      tickets: string | null;
      dietary: string | null;
      accessibility: string | null;
      attendee_status: string;
    }>`
      select r.code, r.status as registration_status,
        to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as registered_at_utc,
        r.purchaser_name, r.purchaser_email, r.purchaser_phone,
        a.given_name, a.family_name, a.email as attendee_email, a.badge_affiliation,
        coalesce(string_agg(t.name, '; ' order by t.sort_order, t.name), '') as tickets,
        a.dietary, a.accessibility,
        case when a.cancelled_at is null then 'active' else 'cancelled' end as attendee_status
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      left join attendee_items ai on ai.attendee_id = a.id
      left join ticket_types t on t.id = ai.ticket_type_id and t.chapter_id = a.chapter_id
      where a.chapter_id = ${member.chapterId} and r.event_id = ${eventId}
      group by r.id, a.id
      order by r.created_at desc, r.id, a.family_name, a.given_name, a.id
    `;
    const csv = csvFile(
      [
        "code",
        "registration_status",
        "registered_at_utc",
        "purchaser_name",
        "purchaser_email",
        "purchaser_phone",
        "given_name",
        "family_name",
        "attendee_email",
        "badge_affiliation",
        "tickets",
        "dietary",
        "accessibility",
        "attendee_status",
      ],
      rows.map((row) => [
        row.code,
        row.registration_status,
        row.registered_at_utc,
        row.purchaser_name,
        row.purchaser_email,
        row.purchaser_phone,
        row.given_name,
        row.family_name,
        row.attendee_email,
        row.badge_affiliation,
        row.tickets,
        row.dietary,
        row.accessibility,
        row.attendee_status,
      ]),
    );
    await exportAudit(sql, member.chapterId, member.userId, eventId, "attendees", rows.length);
    return { csv, filename: "registrations-attendees.csv" };
  });

export const exportCatererCounts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((eventId: string) => z.string().min(1).parse(eventId))
  .handler(async ({ context, data: eventId }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, eventId);
    const mealRows = await sql<{ attendee_id: string; part_id: string; part_title: string; dietary: string | null }>`
      select distinct a.id as attendee_id, p.id as part_id, p.title as part_title, a.dietary
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      join attendee_items ai on ai.attendee_id = a.id
      join ticket_type_parts tp on tp.ticket_type_id = ai.ticket_type_id
      join event_parts p on p.id = tp.part_id and p.chapter_id = a.chapter_id and p.event_id = r.event_id
      where a.chapter_id = ${member.chapterId}
        and r.event_id = ${eventId}
        and a.cancelled_at is null
        and r.status in ('free', 'paid', 'pending')
        and p.is_meal
    `;
    const counts = mealCounts(
      mealRows.map((row) => ({ partId: row.part_id, partTitle: row.part_title, dietary: row.dietary })),
    );
    const groups = new Map<string, { title: string; rows: typeof counts }>();
    for (const row of counts) {
      const group = groups.get(row.partId) ?? { title: row.partTitle, rows: [] };
      group.rows.push(row);
      groups.set(row.partId, group);
    }
    const body: unknown[][] = [];
    for (const group of groups.values()) {
      let total = 0;
      for (const row of group.rows) {
        body.push([row.partTitle, row.dietary, row.count]);
        total += row.count;
      }
      body.push([group.title, "Total", total]);
    }
    const csv = csvFile(["meal", "dietary", "count"], body);
    await exportAudit(sql, member.chapterId, member.userId, eventId, "caterer", body.length);
    return { csv, filename: "registrations-caterer.csv" };
  });

export const exportBadges = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((eventId: string) => z.string().min(1).parse(eventId))
  .handler(async ({ context, data: eventId }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, eventId);
    const rows = await sql<{
      given_name: string;
      family_name: string;
      badge_affiliation: string | null;
      code: string;
      tickets: string | null;
    }>`
      select a.given_name, a.family_name, a.badge_affiliation, r.code,
        coalesce(string_agg(t.name, '; ' order by t.sort_order, t.name), '') as tickets
      from registration_attendees a
      join registrations r on r.id = a.registration_id and r.chapter_id = a.chapter_id
      left join attendee_items ai on ai.attendee_id = a.id
      left join ticket_types t on t.id = ai.ticket_type_id and t.chapter_id = a.chapter_id
      where a.chapter_id = ${member.chapterId}
        and r.event_id = ${eventId}
        and a.cancelled_at is null
        and r.status in ('free', 'paid', 'pending')
      group by r.id, a.id
      order by a.family_name, a.given_name, a.id
    `;
    const csv = csvFile(
      ["given_name", "family_name", "badge_affiliation", "code", "tickets"],
      rows.map((row) => [row.given_name, row.family_name, row.badge_affiliation, row.code, row.tickets]),
    );
    await exportAudit(sql, member.chapterId, member.userId, eventId, "badges", rows.length);
    return { csv, filename: "registrations-badges.csv" };
  });
