import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { publicCopyHtml } from "./announcement-html";
import { recordAudit } from "./audit";
import { changedFields } from "./audit-rules";
import { bookRegistrationAllowed } from "./book-registration";
import { maySetBookRegistration } from "./handler-roles";
import { nid } from "./ids";
import { assertAdmin, assertEditor, loadMember } from "./member";
import { parsePriceCents } from "@/lib/payments/pricing";
import { ticketPartsUnchanged } from "@/lib/payments/registration-desk";

type Sql = Awaited<ReturnType<typeof getSql>>;

const AGREEMENT_KINDS = ["guardian", "privacy", "refund", "conduct", "photo"] as const;

type PartRow = {
  id: string;
  chapter_id: string;
  event_id: string;
  title: string;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  capacity: number | null;
  held: number;
  taken: number;
  is_meal: boolean;
  sort_order: number;
};

type TicketRow = {
  id: string;
  chapter_id: string;
  event_id: string;
  kind: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  for_minors: boolean;
  needs_code: boolean;
  sales_start: Date | string | null;
  sales_end: Date | string | null;
  active: boolean;
  sort_order: number;
};

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString();
}

function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function whenOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (Number.isNaN(Date.parse(text))) throw new Error("Enter a date and time.");
  return text;
}

function capacityOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Capacity is a positive number, or empty for no limit.");
  }
  return value;
}

function requireText(value: string, message: string): string {
  const text = value.trim();
  if (!text) throw new Error(message);
  return text;
}

async function requireEvent(sql: Sql, chapterId: string, eventId: string) {
  const rows = await sql<{
    id: string;
    title: string;
    timezone: string;
    public_item_id: string | null;
    slug: string | null;
  }>`
    select e.id, e.title, e.timezone, e.public_item_id, i.slug
    from events e
    left join site_items i on i.id = e.public_item_id and i.chapter_id = e.chapter_id
    where e.id = ${eventId} and e.chapter_id = ${chapterId}
  `;
  const event = rows[0];
  if (!event) throw new Error("Event not found");
  return event;
}

async function editor(userId: string) {
  const member = await loadMember(userId);
  assertEditor(member.role);
  return member;
}

async function auditSetup(
  sql: Sql,
  member: { chapterId: string; userId: string },
  eventId: string,
  detail: { what: string; name: string; price_cents?: number },
) {
  await recordAudit(sql, {
    chapterId: member.chapterId,
    actor: member.userId,
    action: "registration_setup_saved",
    entity: "event",
    entityId: eventId,
    detail,
  });
}

async function partsOfEvent(sql: Sql, chapterId: string, eventId: string, partIds: string[]) {
  const unique = [...new Set(partIds)];
  if (!unique.length) return unique;
  const found = await sql<{ id: string }>`
    select id from event_parts
    where event_id = ${eventId} and chapter_id = ${chapterId}
  `;
  const ids = new Set(found.map((row) => row.id));
  if (unique.some((id) => !ids.has(id))) throw new Error("Choose parts of this gathering.");
  return unique;
}

export const getRegistrationSetup = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((eventId: string) => z.string().min(1).parse(eventId))
  .handler(async ({ context, data: eventId }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    const event = await requireEvent(sql, member.chapterId, eventId);
    const parts = await sql<PartRow>`
      select id, chapter_id, event_id, title, starts_at, ends_at, capacity, held, taken, is_meal, sort_order
      from event_parts
      where event_id = ${eventId} and chapter_id = ${member.chapterId}
      order by sort_order, starts_at nulls last
    `;
    const tickets = await sql<TicketRow>`
      select id, chapter_id, event_id, kind, name, description, price_cents, currency,
             for_minors, needs_code, sales_start, sales_end, active, sort_order
      from ticket_types
      where event_id = ${eventId} and chapter_id = ${member.chapterId}
      order by sort_order, name
    `;
    const links = await sql<{ ticket_type_id: string; part_id: string }>`
      select l.ticket_type_id, l.part_id
      from ticket_type_parts l
      join event_parts p on p.id = l.part_id
      where p.event_id = ${eventId} and p.chapter_id = ${member.chapterId}
    `;
    const pages = await sql<{
      use_book_registration: boolean;
      intro: string | null;
      for_schools: string | null;
      manage_message: string | null;
    }>`
      select use_book_registration, intro, for_schools, manage_message
      from registration_pages
      where event_id = ${eventId} and chapter_id = ${member.chapterId}
    `;
    const agreements = await sql<{ id: string; kind: string; html: string; created_at: Date | string }>`
      select distinct on (kind) id, kind, html, created_at
      from consent_texts
      where event_id = ${eventId} and chapter_id = ${member.chapterId}
      order by kind, created_at desc, id desc
    `;
    const page = pages[0];
    return {
      event: { title: event.title, timezone: event.timezone, slug: event.slug },
      parts: parts.map((part) => ({
        id: part.id,
        chapter_id: part.chapter_id,
        event_id: part.event_id,
        title: part.title,
        starts_at: iso(part.starts_at),
        ends_at: iso(part.ends_at),
        capacity: part.capacity,
        held: part.held,
        taken: part.taken,
        is_meal: part.is_meal,
        sort_order: part.sort_order,
      })),
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        chapter_id: ticket.chapter_id,
        event_id: ticket.event_id,
        kind: ticket.kind === "add_on" ? "add_on" : "admission",
        name: ticket.name,
        description: ticket.description,
        price_cents: ticket.price_cents,
        currency: ticket.currency,
        for_minors: ticket.for_minors,
        needs_code: ticket.needs_code,
        sales_start: iso(ticket.sales_start),
        sales_end: iso(ticket.sales_end),
        active: ticket.active,
        sort_order: ticket.sort_order,
        partIds: links.filter((link) => link.ticket_type_id === ticket.id).map((link) => link.part_id),
      })),
      page: page
        ? {
            use_book_registration: page.use_book_registration,
            intro: page.intro,
            for_schools: page.for_schools,
            manage_message: page.manage_message,
          }
        : { use_book_registration: false, intro: null, for_schools: null, manage_message: null },
      bookRegistrationAllowed: bookRegistrationAllowed(
        typeof process === "undefined" ? undefined : process.env.BOOK_REGISTRATION,
      ),
      agreements: agreements.map((row) => ({
        id: row.id,
        kind: row.kind,
        html: row.html,
        created_at: iso(row.created_at) ?? "",
      })),
    };
  });

export const savePart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      partId: z.string().min(1).optional(),
      title: z.string(),
      startsAt: z.string().nullable().optional(),
      endsAt: z.string().nullable().optional(),
      capacity: z.number().nullable().optional(),
      isMeal: z.boolean(),
      sortOrder: z.number().int(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, data.eventId);
    const title = requireText(data.title, "Enter a title.");
    const starts = whenOrNull(data.startsAt);
    const ends = whenOrNull(data.endsAt);
    const capacity = capacityOrNull(data.capacity);
    if (data.partId) {
      const beforeRows = await sql<{
        title: string;
        starts_at: Date | string | null;
        ends_at: Date | string | null;
        capacity: number | null;
        is_meal: boolean;
        sort_order: number;
      }>`
        select title, starts_at, ends_at, capacity, is_meal, sort_order
        from event_parts
        where id = ${data.partId} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
      `;
      const saved = await sql<{ id: string }>`
        update event_parts set
          title = ${title},
          starts_at = ${starts},
          ends_at = ${ends},
          capacity = ${capacity},
          is_meal = ${data.isMeal},
          sort_order = ${data.sortOrder}
        where id = ${data.partId} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
        returning id
      `;
      if (!saved[0]) throw new Error("Part not found");
      const before = beforeRows[0];
      if (
        before &&
        changedFields(
          {
            title: before.title,
            starts_at: iso(before.starts_at),
            ends_at: iso(before.ends_at),
            capacity: before.capacity,
            is_meal: before.is_meal,
            sort_order: before.sort_order,
          },
          {
            title,
            starts_at: iso(starts),
            ends_at: iso(ends),
            capacity,
            is_meal: data.isMeal,
            sort_order: data.sortOrder,
          },
          ["title", "starts_at", "ends_at", "capacity", "is_meal", "sort_order"],
        ).length
      ) {
        await auditSetup(sql, member, data.eventId, { what: "part", name: title });
      }
      return { id: saved[0].id };
    }
    const id = nid();
    await sql`
      insert into event_parts (
        id, chapter_id, event_id, title, starts_at, ends_at, capacity, is_meal, sort_order
      ) values (
        ${id}, ${member.chapterId}, ${data.eventId}, ${title}, ${starts}, ${ends},
        ${capacity}, ${data.isMeal}, ${data.sortOrder}
      )
    `;
    await auditSetup(sql, member, data.eventId, { what: "part", name: title });
    return { id };
  });

export const removePart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), partId: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, data.eventId);
    const rows = await sql<{ held: number; taken: number }>`
      select held, taken from event_parts
      where id = ${data.partId} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
    `;
    const part = rows[0];
    if (!part) throw new Error("Part not found");
    if (Number(part.held) !== 0 || Number(part.taken) !== 0) {
      throw new Error("Seats are held or taken for this part.");
    }
    const removed = await sql<{ title: string }>`
      delete from event_parts
      where id = ${data.partId} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
      returning title
    `;
    if (removed[0]) {
      await auditSetup(sql, member, data.eventId, { what: "part_removed", name: removed[0].title });
    }
    return { id: data.partId };
  });

export const saveTicketType = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      ticketTypeId: z.string().min(1).optional(),
      kind: z.enum(["admission", "add_on"]),
      name: z.string(),
      description: z.string().nullable().optional(),
      price: z.string(),
      forMinors: z.boolean(),
      needsCode: z.boolean(),
      salesStart: z.string().nullable().optional(),
      salesEnd: z.string().nullable().optional(),
      active: z.boolean(),
      sortOrder: z.number().int(),
      partIds: z.array(z.string()),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, data.eventId);
    const cents = parsePriceCents(data.price);
    if (cents == null) throw new Error("Enter a price like 25 or 25.50.");
    const name = requireText(data.name, "Enter a name.");
    const description = blankToNull(data.description);
    const salesStart = whenOrNull(data.salesStart);
    const salesEnd = whenOrNull(data.salesEnd);
    const partIds = await partsOfEvent(sql, member.chapterId, data.eventId, data.partIds);
    let id = data.ticketTypeId;
    let replaceParts = true;
    let changed = true;
    if (id) {
      const current = await sql<{
        kind: string;
        name: string;
        description: string | null;
        price_cents: number;
        for_minors: boolean;
        needs_code: boolean;
        sales_start: Date | string | null;
        sales_end: Date | string | null;
        active: boolean;
        sort_order: number;
      }>`
        select kind, name, description, price_cents, for_minors, needs_code,
               sales_start, sales_end, active, sort_order
        from ticket_types
        where id = ${id} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
      `;
      const issued = await sql<{ attendee_id: string }>`
        select ai.attendee_id
        from attendee_items ai
        join registration_attendees a on a.id = ai.attendee_id and a.chapter_id = ${member.chapterId}
        where ai.ticket_type_id = ${id}
        limit 1
      `;
      const currentParts = await sql<{ part_id: string }>`
        select l.part_id
        from ticket_type_parts l
        join event_parts p on p.id = l.part_id and p.chapter_id = ${member.chapterId} and p.event_id = ${data.eventId}
        where l.ticket_type_id = ${id}
      `;
      const sameParts = ticketPartsUnchanged(
        currentParts.map((part) => part.part_id),
        partIds,
      );
      if (issued[0] && !sameParts) {
        throw new Error("Tickets were already issued, so its parts can't change. Add a new ticket instead.");
      }
      replaceParts = !sameParts;
      const saved = await sql<{ id: string }>`
        update ticket_types set
          kind = ${data.kind},
          name = ${name},
          description = ${description},
          price_cents = ${cents},
          for_minors = ${data.forMinors},
          needs_code = ${data.needsCode},
          sales_start = ${salesStart},
          sales_end = ${salesEnd},
          active = ${data.active},
          sort_order = ${data.sortOrder}
        where id = ${id} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
        returning id
      `;
      if (!saved[0]) throw new Error("Ticket not found");
      const row = current[0];
      const columnChanges = row
        ? changedFields(
            {
              kind: row.kind,
              name: row.name,
              description: row.description,
              price_cents: row.price_cents,
              for_minors: row.for_minors,
              needs_code: row.needs_code,
              sales_start: iso(row.sales_start),
              sales_end: iso(row.sales_end),
              active: row.active,
              sort_order: row.sort_order,
            },
            {
              kind: data.kind,
              name,
              description,
              price_cents: cents,
              for_minors: data.forMinors,
              needs_code: data.needsCode,
              sales_start: iso(salesStart),
              sales_end: iso(salesEnd),
              active: data.active,
              sort_order: data.sortOrder,
            },
            [
              "kind",
              "name",
              "description",
              "price_cents",
              "for_minors",
              "needs_code",
              "sales_start",
              "sales_end",
              "active",
              "sort_order",
            ],
          )
        : [];
      changed = columnChanges.length > 0 || !sameParts;
    } else {
      id = nid();
      await sql`
        insert into ticket_types (
          id, chapter_id, event_id, kind, name, description, price_cents,
          for_minors, needs_code, sales_start, sales_end, active, sort_order
        ) values (
          ${id}, ${member.chapterId}, ${data.eventId}, ${data.kind}, ${name}, ${description}, ${cents},
          ${data.forMinors}, ${data.needsCode}, ${salesStart}, ${salesEnd}, ${data.active}, ${data.sortOrder}
        )
      `;
    }
    if (replaceParts) {
      await sql`delete from ticket_type_parts where ticket_type_id = ${id}`;
      for (const partId of partIds) {
        await sql`
          insert into ticket_type_parts (ticket_type_id, part_id) values (${id}, ${partId})
        `;
      }
    }
    if (changed) {
      await auditSetup(sql, member, data.eventId, { what: "ticket", name, price_cents: cents });
    }
    return { id };
  });

export const removeTicketType = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), ticketTypeId: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, data.eventId);
    const tickets = await sql<{ id: string; name: string }>`
      select id, name from ticket_types
      where id = ${data.ticketTypeId} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
    `;
    if (!tickets[0]) throw new Error("Ticket not found");
    const used = await sql<{ attendee_id: string }>`
      select attendee_id from attendee_items
      where ticket_type_id = ${data.ticketTypeId}
      limit 1
    `;
    if (used[0]) throw new Error("Tickets were already issued. Set it inactive instead.");
    const removed = await sql<{ name: string }>`
      delete from ticket_types
      where id = ${data.ticketTypeId} and event_id = ${data.eventId} and chapter_id = ${member.chapterId}
      returning name
    `;
    if (removed[0]) {
      await auditSetup(sql, member, data.eventId, { what: "ticket_removed", name: removed[0].name });
    }
    return { id: data.ticketTypeId };
  });

export const saveRegistrationPage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      intro: z.string().nullable().optional(),
      forSchools: z.string().nullable().optional(),
      manageMessage: z.string().nullable().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    const event = await requireEvent(sql, member.chapterId, data.eventId);
    const intro = blankToNull(data.intro);
    const forSchools = blankToNull(data.forSchools);
    const manageMessage = blankToNull(data.manageMessage);
    const existing = await sql<{ intro: string | null; for_schools: string | null; manage_message: string | null }>`
      select intro, for_schools, manage_message
      from registration_pages
      where event_id = ${data.eventId} and chapter_id = ${member.chapterId}
    `;
    const before = existing[0] ?? { intro: null, for_schools: null, manage_message: null };
    // The on/off switch stays untouched. setBookRegistration is the only writer.
    await sql`
      insert into registration_pages (
        event_id, chapter_id, intro, for_schools, manage_message, updated_at, updated_by
      ) values (
        ${data.eventId}, ${member.chapterId}, ${intro}, ${forSchools}, ${manageMessage}, now(), ${member.userId}
      )
      on conflict (event_id) do update set
        chapter_id = excluded.chapter_id,
        intro = excluded.intro,
        for_schools = excluded.for_schools,
        manage_message = excluded.manage_message,
        updated_at = now(),
        updated_by = excluded.updated_by
    `;
    if (
      changedFields(
        before,
        { intro, for_schools: forSchools, manage_message: manageMessage },
        ["intro", "for_schools", "manage_message"],
      ).length
    ) {
      await auditSetup(sql, member, data.eventId, { what: "page", name: event.title });
    }
    return { ok: true };
  });

export const saveAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      kind: z.enum(AGREEMENT_KINDS),
      html: z.string(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await editor(context.userId);
    const sql = await getSql();
    await requireEvent(sql, member.chapterId, data.eventId);
    const trimmed = data.html.trim();
    const html = publicCopyHtml(trimmed) ?? trimmed;
    const latest = await sql<{ html: string }>`
      select html from consent_texts
      where event_id = ${data.eventId} and chapter_id = ${member.chapterId} and kind = ${data.kind}
      order by created_at desc, id desc
      limit 1
    `;
    if (html === (latest[0]?.html ?? "").trim()) return { saved: false };
    const id = nid();
    await sql`
      insert into consent_texts (id, chapter_id, event_id, kind, html, created_by)
      values (${id}, ${member.chapterId}, ${data.eventId}, ${data.kind}, ${html}, ${member.userId})
    `;
    await auditSetup(sql, member, data.eventId, { what: "agreement", name: data.kind });
    return { saved: true, id };
  });

export const setBookRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), enabled: z.boolean() }).parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertAdmin(member.role);
    if (!maySetBookRegistration(member.role)) throw new Error("Only an admin can do that.");
    const sql = await getSql();
    const event = await requireEvent(sql, member.chapterId, data.eventId);
    if (!event.public_item_id) throw new Error("This event has no public page.");
    if (data.enabled) {
      const tickets = await sql<{ id: string }>`
        select id from ticket_types
        where event_id = ${data.eventId} and chapter_id = ${member.chapterId}
          and kind = 'admission' and active
        limit 1
      `;
      if (!tickets[0]) throw new Error("Add a ticket first.");
    }
    await sql`
      insert into registration_pages (
        event_id, chapter_id, use_book_registration, updated_at, updated_by
      ) values (
        ${data.eventId}, ${member.chapterId}, ${data.enabled}, now(), ${member.userId}
      )
      on conflict (event_id) do update set
        use_book_registration = excluded.use_book_registration,
        updated_at = now(),
        updated_by = excluded.updated_by
    `;
    await sql`
      insert into audit_log (id, chapter_id, actor, action, entity, entity_id, detail)
      values (
        ${nid()}, ${member.chapterId}, ${member.userId}, ${"registration_switch"}, ${"event"}, ${data.eventId},
        ${JSON.stringify({ enabled: data.enabled })}::jsonb
      )
    `;
    return { ok: true };
  });
