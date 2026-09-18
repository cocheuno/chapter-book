import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid, lowerEmail } from "./ids";
import { CONFERENCE_CHECKLIST, GOLD_MASS_CHECKLIST, OCCASIONS, isSingularOffice, roleLabel } from "./constants";
import { formatWhen, schoolYearStartIso } from "./format";
import { composedHonorific, LIST_KEYS, type ListKey } from "./lists";
import { foldName } from "./match";
import { composePersonName, listedName, splitMiddle, splitWalkupName } from "./names";
import { assertAdmin, assertEditor, loadMember, type MemberContext } from "./member";

type Row = Record<string, string | number | boolean | null>;

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|unique index/i.test(msg);
}

async function ctx(userId: string) {
  return loadMember(userId);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + (isoDate.includes("T") ? "" : "T12:00:00"));
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function bumpTouch(
  sql: Awaited<ReturnType<typeof getSql>>,
  args: { personId?: string | null; orgId?: string | null },
) {
  if (args.personId) {
    await sql`update persons set last_touch_at = now() where id = ${args.personId}`;
  }
  if (args.orgId) {
    await sql`update organizations set last_touch_at = now() where id = ${args.orgId}`;
  }
}

export const getHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const events = await sql<{
      id: string;
      title: string;
      type_key: string;
      status: string;
      starts_at: string | null;
      venue_name: string | null;
      celebrant_name: string | null;
    }>`
      select e.id, e.title, e.type_key, e.status, e.starts_at,
             o.name as venue_name, p.display_name as celebrant_name
      from events e
      left join organizations o on o.id = e.venue_organization_id
      left join persons p on p.id = e.celebrant_id
      where e.chapter_id = ${m.chapterId}
        and e.status not in ('complete', 'cancelled')
      order by e.starts_at nulls last
      limit 1
    `;
    const next = events[0] ?? null;
    let rsvp = { attending: 0, notAnswered: 0, declined: 0 };
    let openChecklist = 0;
    if (next) {
      const counts = await sql<{ guest_status: string | null; n: number }>`
        select guest_status, count(*)::int as n
        from participations
        where event_id = ${next.id} and guest_status is not null
        group by guest_status
      `;
      for (const c of counts) {
        if (c.guest_status === "attending" || c.guest_status === "attended") rsvp.attending += c.n;
        else if (c.guest_status === "declined") rsvp.declined += c.n;
        else rsvp.notAnswered += c.n;
      }
      const t = await sql<{ n: number }>`
        select count(*)::int as n from tasks
        where event_id = ${next.id} and status = 'open'
      `;
      openChecklist = t[0]?.n ?? 0;
    }
    const tasks = await sql<{
      id: string;
      title: string;
      due_on: string | null;
      event_id: string | null;
      hat: string | null;
    }>`
      select id, title, due_on, event_id, hat
      from tasks
      where chapter_id = ${m.chapterId} and status = 'open'
      order by due_on nulls last
      limit 6
    `;
    const quiet = await sql<{
      id: string;
      name: string;
      city: string | null;
      has_chair: boolean;
    }>`
      select o.id, o.name, o.city,
        exists (
          select 1 from affiliations a
          where a.organization_id = o.id and a.is_current and a.role_key = 'science_chair'
        ) as has_chair
      from organizations o
      where o.chapter_id = ${m.chapterId} and o.status = 'active'
        and o.type_key in ('high_school', 'university')
        and (o.last_touch_at is null or o.last_touch_at < ${schoolYearStartIso()}::date)
      order by o.name
      limit 5
    `;
    return { member: m, nextEvent: next, rsvp, openChecklist, tasks, quietSchools: quiet };
  });

export const searchAll = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((q: string) => q.trim())
  .handler(async ({ context, data: q }) => {
    const m = await ctx(context.userId);
    if (q.length < 2) return [] as { kind: string; id: string; label: string; hint: string }[];
    const sql = await getSql();
    const like = `%${q}%`;
    const people = await sql<{ id: string; display_name: string; email: string | null; given_name: string | null; family_name: string | null; honorific: string | null; religious_title: string | null; academic_title: string | null; middle_name: string | null; suffix: string | null }>`
      select id, display_name, email, given_name, family_name, honorific, religious_title, academic_title,
             coalesce(middle_name, middle_initial) as middle_name, suffix from persons
      where chapter_id = ${m.chapterId}
        and (
          display_name ilike ${like}
          or coalesce(given_name,'') ilike ${like}
          or coalesce(family_name,'') ilike ${like}
          or coalesce(email,'') ilike ${like}
        )
      limit 6
    `;
    const orgs = await sql<{ id: string; name: string; type_key: string }>`
      select id, name, type_key from organizations
      where chapter_id = ${m.chapterId} and name ilike ${like}
      limit 8
    `;
    return [
      ...people.map((p) => ({
        kind: "person" as const,
        id: p.id,
        label: listedName(p),
        hint: p.email ?? "Person",
      })),
      ...orgs.map((o) => ({
        kind: "org" as const,
        id: o.id,
        label: o.name,
        hint: o.type_key.replaceAll("_", " "),
      })),
    ];
  });

const personInput = z.object({
  givenName: z.string().min(1),
  familyName: z.string().min(1),
  middleName: z.string().optional(),
  middleInitial: z.string().optional(),
  suffix: z.string().optional(),
  religiousTitle: z.string().optional(),
  academicTitle: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  street: z.string().optional(),
  street2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  website: z.string().optional(),
  dietary: z.string().optional(),
  notes: z.string().optional(),
  roles: z.array(z.string()).min(1),
});

export const listPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((role: string | undefined) => role)
  .handler(async ({ context, data: role }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      display_name: string;
      email: string | null;
      city: string | null;
      last_touch_at: string | null;
      given_name: string | null;
      family_name: string | null;
      middle_name: string | null;
      suffix: string | null;
      honorific: string | null;
      religious_title: string | null;
      academic_title: string | null;
    }>`
      select p.id, p.display_name, p.email, p.city, p.last_touch_at,
             p.given_name, p.family_name, coalesce(p.middle_name, p.middle_initial) as middle_name, p.suffix,
             p.honorific, p.religious_title, p.academic_title
      from persons p
      where p.chapter_id = ${m.chapterId}
        and (${role ?? null}::text is null or exists (
          select 1 from person_roles r where r.person_id = p.id and r.role_key = ${role ?? ""}
        ))
      order by coalesce(p.family_name, p.display_name), p.given_name, p.display_name
    `;
    const roles = await sql<{ person_id: string; role_key: string }>`
      select person_id, role_key from person_roles
      where person_id in (select id from persons where chapter_id = ${m.chapterId})
    `;
    const aff = await sql<{
      person_id: string;
      role_key: string;
      org_name: string | null;
    }>`
      select a.person_id, a.role_key, o.name as org_name
      from affiliations a
      left join organizations o on o.id = a.organization_id
      where a.chapter_id = ${m.chapterId} and a.is_current and a.is_primary
    `;
    return rows.map((p) => ({
      ...p,
      display_name: listedName(p),
      roles: roles.filter((r) => r.person_id === p.id).map((r) => r.role_key),
      primary: aff.find((a) => a.person_id === p.id) ?? null,
    }));
  });

export const getPerson = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const rows = await sql<Row>`
      select * from persons where id = ${id} and chapter_id = ${m.chapterId}
    `;
    if (!rows[0]) throw new Error("Person not found");
    const roles = await sql<{ role_key: string }>`select role_key from person_roles where person_id = ${id}`;
    const affiliations = await sql<{
      id: string;
      role_key: string;
      is_primary: boolean;
      org_id: string | null;
      org_name: string | null;
    }>`
      select a.id, a.role_key, a.is_primary,
             a.organization_id as org_id, o.name as org_name
      from affiliations a
      left join organizations o on o.id = a.organization_id
      where a.person_id = ${id} and a.is_current
    `;
    const gatherings = await sql<{
      event_id: string;
      title: string;
      type_key: string;
      guest_status: string | null;
      kind_key: string;
      starts_at: string | null;
    }>`
      select e.id as event_id, e.title, e.type_key, p.guest_status, p.kind_key, e.starts_at
      from participations p
      join events e on e.id = p.event_id
      where p.person_id = ${id}
      order by e.starts_at desc nulls last
    `;
    const celebrated = await sql<{ id: string; title: string; starts_at: string | null }>`
      select id, title, starts_at from events where celebrant_id = ${id} and chapter_id = ${m.chapterId}
    `;
    const touches = await sql<{
      id: string;
      kind: string;
      happened_at: string;
      summary: string;
    }>`
      select id, kind, happened_at, summary from touches
      where person_id = ${id} order by happened_at desc limit 12
    `;
    return { person: rows[0], roles: roles.map((r) => r.role_key), affiliations, gatherings, celebrated, touches };
  });

export const createPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(personInput.parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const email = lowerEmail(data.email);
    const given = data.givenName.trim();
    const family = data.familyName.trim();
    const mid = splitMiddle(data.middleName ?? data.middleInitial);
    const suffix = (data.suffix ?? "").trim() || null;
    const honorific = composedHonorific(data.religiousTitle, data.academicTitle);
    const name = composePersonName({
      religiousTitle: data.religiousTitle,
      academicTitle: data.academicTitle,
      givenName: given,
      middleName: mid.middleName,
      familyName: family,
      suffix,
    });
    if (email) {
      const dup = await sql<{ id: string; display_name: string }>`
        select id, display_name from persons where chapter_id = ${m.chapterId} and lower(email) = ${email}
      `;
      if (dup[0]) {
        return { id: dup[0].id, duplicate: true, name: dup[0].display_name, reason: "email" as const };
      }
    } else {
      const dup = await sql<{ id: string; display_name: string }>`
        select id, display_name from persons
        where chapter_id = ${m.chapterId}
          and (
            lower(display_name) = ${foldName(name)}
            or (
              lower(coalesce(given_name, '')) = ${foldName(given)}
              and lower(coalesce(family_name, '')) = ${foldName(family)}
            )
          )
      `;
      if (dup[0]) {
        return { id: dup[0].id, duplicate: true, name: dup[0].display_name, reason: "name" as const };
      }
    }
    const id = nid();
    try {
      await sql`
        insert into persons (
          id, chapter_id, display_name, given_name, family_name, middle_name, middle_initial, suffix,
          honorific, religious_title, academic_title,
          email, phone, mobile, street, street2, city, state, postal_code, country, website, dietary, notes, created_by
        )
        values (
          ${id}, ${m.chapterId}, ${name}, ${given}, ${family}, ${mid.middleName}, ${mid.middleInitial}, ${suffix},
          ${honorific}, ${data.religiousTitle || null}, ${data.academicTitle || null},
          ${email}, ${data.phone || null}, ${data.mobile || null}, ${data.street || null}, ${data.street2 || null},
          ${data.city || null}, ${data.state || null}, ${data.postalCode || null},
          ${data.country || "United States"}, ${data.website || null}, ${data.dietary || null}, ${data.notes || null}, ${m.userId}
        )
      `;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const again = email
        ? await sql<{ id: string; display_name: string }>`
            select id, display_name from persons
            where chapter_id = ${m.chapterId} and lower(email) = ${email}
          `
        : await sql<{ id: string; display_name: string }>`
            select id, display_name from persons
            where chapter_id = ${m.chapterId} and lower(display_name) = ${foldName(name)}
          `;
      if (again[0]) {
        return { id: again[0].id, duplicate: true, name: again[0].display_name, reason: email ? "email" : "name" };
      }
      throw new Error("That person is already in the book.");
    }
    for (const r of data.roles) {
      await sql`insert into person_roles (person_id, role_key) values (${id}, ${r})`;
    }
    return { id, duplicate: false };
  });

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(personInput.extend({ id: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const email = lowerEmail(data.email);
    const given = data.givenName.trim();
    const family = data.familyName.trim();
    const mid = splitMiddle(data.middleName ?? data.middleInitial);
    const suffix = (data.suffix ?? "").trim() || null;
    const honorific = composedHonorific(data.religiousTitle, data.academicTitle);
    const name = composePersonName({
      religiousTitle: data.religiousTitle,
      academicTitle: data.academicTitle,
      givenName: given,
      middleName: mid.middleName,
      familyName: family,
      suffix,
    });
    if (email) {
      const taken = await sql<{ id: string; display_name: string }>`
        select id, display_name from persons
        where chapter_id = ${m.chapterId} and lower(email) = ${email} and id <> ${data.id}
      `;
      if (taken[0]) throw new Error(`That email already belongs to ${taken[0].display_name}.`);
    } else {
      const taken = await sql<{ id: string; display_name: string }>`
        select id, display_name from persons
        where chapter_id = ${m.chapterId}
          and id <> ${data.id}
          and (
            lower(display_name) = ${foldName(name)}
            or (
              lower(coalesce(given_name, '')) = ${foldName(given)}
              and lower(coalesce(family_name, '')) = ${foldName(family)}
            )
          )
      `;
      if (taken[0]) {
        throw new Error(`${taken[0].display_name} is already in the book. Add an email if this is someone else.`);
      }
    }
    await sql`
      update persons set
        display_name = ${name},
        given_name = ${given},
        family_name = ${family},
        middle_name = ${mid.middleName},
        middle_initial = ${mid.middleInitial},
        suffix = ${suffix},
        honorific = ${honorific},
        religious_title = ${data.religiousTitle || null},
        academic_title = ${data.academicTitle || null},
        email = ${lowerEmail(data.email)},
        phone = ${data.phone || null},
        mobile = ${data.mobile || null},
        street = ${data.street || null},
        street2 = ${data.street2 || null},
        city = ${data.city || null},
        state = ${data.state || null},
        postal_code = ${data.postalCode || null},
        country = ${data.country || null},
        website = ${data.website || null},
        dietary = ${data.dietary || null},
        notes = ${data.notes || null}
      where id = ${data.id} and chapter_id = ${m.chapterId}
    `;
    await sql`delete from person_roles where person_id = ${data.id}`;
    for (const r of data.roles) {
      await sql`insert into person_roles (person_id, role_key) values (${data.id}, ${r})`;
    }
    return { ok: true };
  });

export const addAffiliation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      personId: z.string(),
      organizationId: z.string(),
      roleKey: z.string(),
      isPrimary: z.boolean().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const person = await sql<{ display_name: string }>`
      select display_name from persons where id = ${data.personId} and chapter_id = ${m.chapterId}
    `;
    if (!person[0]) throw new Error("Person not found.");
    const onFile = await sql<{ id: string; role_key: string; is_current: boolean }>`
      select id, role_key, is_current from affiliations
      where person_id = ${data.personId} and organization_id = ${data.organizationId} and is_current
    `;
    const sameOffice = onFile.find((a) => a.role_key === data.roleKey);
    if (sameOffice) {
      throw new Error(`${person[0].display_name} is already ${roleLabel(data.roleKey)} here.`);
    }
    if (onFile[0]) {
      throw new Error(
        `${person[0].display_name} is already ${roleLabel(onFile[0].role_key)} here. Remove that office first if this is a change.`,
      );
    }
    if (isSingularOffice(data.roleKey)) {
      const holder = await sql<{ display_name: string }>`
        select p.display_name from affiliations a
        join persons p on p.id = a.person_id
        where a.organization_id = ${data.organizationId} and a.role_key = ${data.roleKey} and a.is_current
      `;
      if (holder[0]) {
        throw new Error(
          `${roleLabel(data.roleKey)} is already ${holder[0].display_name}. Remove them first if this is a change.`,
        );
      }
    }
    const dormant = await sql<{ id: string }>`
      select id from affiliations
      where person_id = ${data.personId} and organization_id = ${data.organizationId} and role_key = ${data.roleKey}
    `;
    if (dormant[0]) {
      await sql`update affiliations set is_current = true, is_primary = ${data.isPrimary ?? false} where id = ${dormant[0].id}`;
      return { ok: true };
    }
    try {
      await sql`
        insert into affiliations (id, chapter_id, person_id, target_type, organization_id, role_key, is_primary)
        values (
          ${nid()}, ${m.chapterId}, ${data.personId}, ${"organization"},
          ${data.organizationId}, ${data.roleKey}, ${data.isPrimary ?? false}
        )
      `;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new Error(`${person[0].display_name} is already ${roleLabel(data.roleKey)} here.`);
      }
      throw err;
    }
    return { ok: true };
  });

export const removeAffiliation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      update affiliations set is_current = false
      where id = ${data.id} and chapter_id = ${m.chapterId}
    `;
    return { ok: true };
  });

export const logTouch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      kind: z.string(),
      summary: z.string().min(1),
      personId: z.string().optional(),
      organizationId: z.string().optional(),
      eventId: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      insert into touches (id, chapter_id, person_id, organization_id, kind, summary, event_id, author_id)
      values (
        ${nid()}, ${m.chapterId}, ${data.personId ?? null}, ${data.organizationId ?? null},
        ${data.kind}, ${data.summary.trim()}, ${data.eventId ?? null}, ${m.userId}
      )
    `;
    await bumpTouch(sql, { personId: data.personId, orgId: data.organizationId });
    return { ok: true };
  });

export const listPartners = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((typeKey: string | undefined) => typeKey)
  .handler(async ({ context, data: typeKey }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      name: string;
      type_key: string;
      city: string | null;
      state: string | null;
      last_touch_at: string | null;
    }>`
      select o.id, o.name, o.type_key, o.city, o.state, o.last_touch_at
      from organizations o
      where o.chapter_id = ${m.chapterId}
        and (${typeKey ?? null}::text is null or o.type_key = ${typeKey ?? ""})
      order by o.name
    `;
  });

export const getOrganization = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const rows = await sql<Row>`
      select o.*, p.name as diocese_name
      from organizations o
      left join organizations p on p.id = o.parent_id
      where o.id = ${id} and o.chapter_id = ${m.chapterId}
    `;
    if (!rows[0]) throw new Error("Partner not found");
    const contacts = await sql<{
      id: string;
      person_id: string;
      display_name: string;
      given_name: string | null;
      family_name: string | null;
      middle_name: string | null;
      suffix: string | null;
      honorific: string | null;
      religious_title: string | null;
      academic_title: string | null;
      role_key: string;
      email: string | null;
      phone: string | null;
      is_primary: boolean;
    }>`
      select a.id, a.person_id, p.display_name, p.given_name, p.family_name,
             coalesce(p.middle_name, p.middle_initial) as middle_name, p.suffix,
             p.honorific, p.religious_title, p.academic_title, a.role_key, p.email, p.phone, a.is_primary
      from affiliations a
      join persons p on p.id = a.person_id
      where a.organization_id = ${id} and a.is_current
      order by a.is_primary desc, p.family_name, p.given_name
    `;
    const hosted = await sql<{ id: string; title: string; starts_at: string | null }>`
      select id, title, starts_at from events
      where venue_organization_id = ${id} or id in (
        select event_id from event_slots where slot_key = 'host_parish' and organization_id = ${id}
      )
      order by starts_at desc nulls last
    `;
    const children = await sql<{ id: string; name: string; type_key: string }>`
      select id, name, type_key from organizations
      where parent_id = ${id}
      order by name
    `;
    const groups = await sql<{
      event_id: string;
      title: string;
      party_size: number;
      guest_status: string | null;
      lead_name: string | null;
    }>`
      select p.event_id, e.title, p.party_size, p.guest_status, pe.display_name as lead_name
      from participations p
      join events e on e.id = p.event_id
      left join persons pe on pe.id = p.person_id
      where p.organization_id = ${id} and p.kind_key = 'group_lead'
      order by e.starts_at desc nulls last
    `;
    return {
      org: rows[0],
      contacts: contacts.map((c) => ({ ...c, display_name: listedName(c) })),
      hosted,
      children,
      groups,
    };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().min(1),
      typeKey: z.string(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      parentId: z.string().optional(),
      mainEmail: z.string().optional(),
      mainPhone: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const name = data.name.trim();
    const city = (data.city ?? "").trim();
    const dup = await sql<{ id: string; name: string }>`
      select id, name from organizations
      where chapter_id = ${m.chapterId}
        and lower(name) = ${foldName(name)}
        and lower(coalesce(city, '')) = ${city.toLowerCase()}
    `;
    if (dup[0]) {
      throw new Error(
        city ? `${dup[0].name} is already a partner in ${city}.` : `${dup[0].name} is already a partner.`,
      );
    }
    const id = nid();
    const schoolish = data.typeKey === "high_school" || data.typeKey === "university";
    try {
      await sql`
        insert into organizations (
          id, chapter_id, name, type_key, parent_id, city, state, country,
          main_email, main_phone, is_venue, is_invitation_partner, preferred_door
        )
        values (
          ${id}, ${m.chapterId}, ${data.name.trim()}, ${data.typeKey}, ${data.parentId ?? null},
          ${data.city || null}, ${data.state || null}, ${data.country || "United States"},
          ${lowerEmail(data.mainEmail)}, ${data.mainPhone || null},
          ${data.typeKey !== "diocese" && data.typeKey !== "high_school"}, ${true},
          ${schoolish ? "science_chair" : null}
        )
      `;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new Error(
          city ? `${name} is already a partner in ${city}.` : `${name} is already a partner.`,
        );
      }
      throw err;
    }
    return { id };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
      mainEmail: z.string().optional(),
      mainPhone: z.string().optional(),
      capacityChurch: z.number().optional(),
      capacityHall: z.number().optional(),
      typicalMassTimes: z.string().optional(),
      bulletinDeadline: z.string().optional(),
      hallNotes: z.string().optional(),
      parkingNotes: z.string().optional(),
      liturgicalNotes: z.string().optional(),
      preferredDoor: z.string().optional(),
      scienceDeptNotes: z.string().optional(),
      canBus: z.string().optional(),
      calendarNotes: z.string().optional(),
      notes: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const name = data.name.trim();
    const city = (data.city ?? "").trim();
    const dup = await sql<{ id: string; name: string }>`
      select id, name from organizations
      where chapter_id = ${m.chapterId}
        and id <> ${data.id}
        and lower(name) = ${foldName(name)}
        and lower(coalesce(city, '')) = ${city.toLowerCase()}
    `;
    if (dup[0]) {
      throw new Error(
        city ? `${dup[0].name} is already a partner in ${city}.` : `${dup[0].name} is already a partner.`,
      );
    }
    await sql`
      update organizations set
        name = ${name},
        city = ${data.city || null},
        state = ${data.state || null},
        country = ${data.country || null},
        main_email = ${lowerEmail(data.mainEmail)},
        main_phone = ${data.mainPhone || null},
        capacity_church = ${data.capacityChurch ?? null},
        capacity_hall = ${data.capacityHall ?? null},
        typical_mass_times = ${data.typicalMassTimes || null},
        bulletin_deadline = ${data.bulletinDeadline || null},
        hall_notes = ${data.hallNotes || null},
        parking_notes = ${data.parkingNotes || null},
        liturgical_notes = ${data.liturgicalNotes || null},
        preferred_door = ${data.preferredDoor || null},
        science_dept_notes = ${data.scienceDeptNotes || null},
        can_bus_students = ${data.canBus || null},
        academic_calendar_notes = ${data.calendarNotes || null},
        notes = ${data.notes || null}
      where id = ${data.id} and chapter_id = ${m.chapterId}
    `;
    return { ok: true };
  });

export const listDioceses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    return sql<{ id: string; name: string }>`
      select id, name from organizations where chapter_id = ${m.chapterId} and type_key = 'diocese' order by name
    `;
  });

export const listParishes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    return sql<{ id: string; name: string }>`
      select id, name from organizations
      where chapter_id = ${m.chapterId} and type_key in ('parish', 'university')
      order by name
    `;
  });

async function spawnChecklist(
  sql: Awaited<ReturnType<typeof getSql>>,
  chapterId: string,
  eventId: string,
  typeKey: string,
  startsAt: string | null,
) {
  const items = typeKey === "conference" ? CONFERENCE_CHECKLIST : GOLD_MASS_CHECKLIST;
  const base = startsAt ?? new Date().toISOString();
  for (const item of items) {
    await sql`
      insert into tasks (id, chapter_id, title, due_on, status, event_id, checklist_key, hat)
      values (
        ${nid()}, ${chapterId}, ${item.title},
        ${addDays(base.slice(0, 10), item.offsetDays)},
        ${"open"}, ${eventId}, ${item.key}, ${item.hat}
      )
    `;
  }
}

export const listEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    return sql<{
      id: string;
      title: string;
      type_key: string;
      status: string;
      admission: string;
      starts_at: string | null;
      venue_name: string | null;
    }>`
      select e.id, e.title, e.type_key, e.status, e.admission, e.starts_at, o.name as venue_name
      from events e
      left join organizations o on o.id = e.venue_organization_id
      where e.chapter_id = ${m.chapterId}
      order by e.starts_at desc nulls last
    `;
  });

export const getEvent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const rows = await sql<Row>`
      select e.*, o.name as venue_name, p.display_name as celebrant_name
      from events e
      left join organizations o on o.id = e.venue_organization_id
      left join persons p on p.id = e.celebrant_id
      where e.id = ${id} and e.chapter_id = ${m.chapterId}
    `;
    if (!rows[0]) throw new Error("Event not found");
    const slots = await sql<{ slot_key: string; text_value: string | null; person_id: string | null; organization_id: string | null }>`
      select slot_key, text_value, person_id, organization_id from event_slots where event_id = ${id}
    `;
    const pieces = await sql<{
      id: string;
      kind_key: string;
      title: string | null;
      location: string | null;
      speaker_person_id: string | null;
      speaker_name: string | null;
    }>`
      select pp.id, pp.kind_key, pp.title, pp.location, pp.speaker_person_id, pe.display_name as speaker_name
      from program_pieces pp
      left join persons pe on pe.id = pp.speaker_person_id
      where pp.event_id = ${id}
      order by pp.sort_order
    `;
    const sessions = await sql<{ id: string; title: string; room: string | null; speaker_person_id: string | null }>`
      select id, title, room, speaker_person_id from event_sessions where event_id = ${id} order by sort_order
    `;
    const tasks = await sql<{
      id: string;
      title: string;
      due_on: string | null;
      status: string;
      checklist_key: string | null;
      hat: string | null;
    }>`
      select id, title, due_on, status, checklist_key, hat from tasks where event_id = ${id} order by due_on nulls last
    `;
    const counts = await sql<{ guest_status: string | null; n: number }>`
      select guest_status, count(*)::int as n from participations
      where event_id = ${id} and guest_status is not null group by guest_status
    `;
    const companion = await sql<{ id: string; title: string }>`
      select e.id, e.title from event_links l
      join events e on e.id = case when l.event_id_a = ${id} then l.event_id_b else l.event_id_a end
      where l.event_id_a = ${id} or l.event_id_b = ${id}
    `;
    return { event: rows[0], slots, pieces, sessions, tasks, counts, companion: companion[0] ?? null };
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      typeKey: z.enum(["gold_mass", "conference"]),
      title: z.string().min(1),
      startsAt: z.string().optional(),
      venueOrganizationId: z.string().optional(),
      venueDetail: z.string().optional(),
      occasion: z.string().optional(),
      hostParishId: z.string().optional(),
      theme: z.string().optional(),
      companionEventId: z.string().optional(),
      admission: z.enum(["private", "free"]).optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const id = nid();
    const venue = data.hostParishId || data.venueOrganizationId || null;
    const title = data.title.trim();
    const sameTitle = await sql<{ id: string; title: string }>`
      select id, title from events
      where chapter_id = ${m.chapterId}
        and lower(title) = ${foldName(title)}
        and status <> 'cancelled'
    `;
    if (sameTitle[0]) {
      throw new Error(`${sameTitle[0].title} is already on the calendar.`);
    }
    try {
      await sql`
        insert into events (id, chapter_id, type_key, title, status, admission, starts_at, timezone, venue_organization_id, venue_detail)
        values (
          ${id}, ${m.chapterId}, ${data.typeKey}, ${title}, ${"planning"}, ${data.admission ?? "free"},
          ${data.startsAt || null}, ${m.timezone}, ${venue}, ${data.venueDetail || null}
        )
      `;
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error(`${title} is already on the calendar.`);
      throw err;
    }
    if (data.typeKey === "gold_mass") {
      await sql`
        insert into event_slots (event_id, slot_key, text_value, organization_id)
        values (${id}, ${"liturgical_occasion"}, ${data.occasion || "st_albert"}, null)
      `;
      if (data.hostParishId) {
        await sql`
          insert into event_slots (event_id, slot_key, organization_id)
          values (${id}, ${"host_parish"}, ${data.hostParishId})
        `;
      }
    }
    if (data.theme) {
      await sql`insert into event_slots (event_id, slot_key, text_value) values (${id}, ${"theme"}, ${data.theme})`;
    }
    if (data.companionEventId) {
      const a = data.companionEventId < id ? data.companionEventId : id;
      const b = data.companionEventId < id ? id : data.companionEventId;
      await sql`insert into event_links (event_id_a, event_id_b) values (${a}, ${b})`;
    }
    await spawnChecklist(sql, m.chapterId, id, data.typeKey, data.startsAt || null);
    return { id };
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      status: z.string().optional(),
      startsAt: z.string().optional(),
      venueOrganizationId: z.string().nullable().optional(),
      venueDetail: z.string().optional(),
      celebrantId: z.string().nullable().optional(),
      summary: z.string().optional(),
      internalNotes: z.string().optional(),
      occasion: z.string().optional(),
      hostParishId: z.string().nullable().optional(),
      homilistId: z.string().nullable().optional(),
      intendedAudience: z.string().optional(),
      theme: z.string().optional(),
      admission: z.enum(["private", "free"]).optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const cur = await sql<{ type_key: string; starts_at: string | null; venue_organization_id: string | null; venue_detail: string | null }>`
      select type_key, starts_at, venue_organization_id, venue_detail from events where id = ${data.id} and chapter_id = ${m.chapterId}
    `;
    if (!cur[0]) throw new Error("Event not found");
    if (data.status === "confirmed" || data.status === "complete") {
      const starts = data.startsAt ?? cur[0].starts_at;
      const venue = data.venueOrganizationId !== undefined ? data.venueOrganizationId : cur[0].venue_organization_id;
      const detail = data.venueDetail !== undefined ? data.venueDetail : cur[0].venue_detail;
      const host = await sql<{ organization_id: string | null }>`
        select organization_id from event_slots where event_id = ${data.id} and slot_key = 'host_parish'
      `;
      const hostId = data.hostParishId !== undefined ? data.hostParishId : host[0]?.organization_id;
      if (!starts) throw new Error("Set a date before confirming.");
      if (!venue && !detail) throw new Error("Set a venue before confirming.");
      if (cur[0].type_key === "gold_mass" && !hostId) throw new Error("Set host parish before confirming.");
    }
    await sql`
      update events set
        title = coalesce(${data.title ?? null}, title),
        status = coalesce(${data.status ?? null}, status),
        admission = coalesce(${data.admission ?? null}, admission),
        starts_at = coalesce(${data.startsAt ?? null}, starts_at),
        venue_organization_id = ${data.venueOrganizationId === undefined ? cur[0].venue_organization_id : data.venueOrganizationId},
        venue_detail = coalesce(${data.venueDetail ?? null}, venue_detail),
        celebrant_id = ${data.celebrantId === undefined ? (await sql<{ celebrant_id: string | null }>`select celebrant_id from events where id = ${data.id}`)[0]?.celebrant_id : data.celebrantId},
        summary = coalesce(${data.summary ?? null}, summary),
        internal_notes = coalesce(${data.internalNotes ?? null}, internal_notes)
      where id = ${data.id} and chapter_id = ${m.chapterId}
    `;
    async function upsertSlot(key: string, text: string | null, person: string | null, org: string | null) {
      await sql`delete from event_slots where event_id = ${data.id} and slot_key = ${key}`;
      if (text || person || org) {
        await sql`
          insert into event_slots (event_id, slot_key, text_value, person_id, organization_id)
          values (${data.id}, ${key}, ${text}, ${person}, ${org})
        `;
      }
    }
    if (data.occasion) await upsertSlot("liturgical_occasion", data.occasion, null, null);
    if (data.hostParishId !== undefined) await upsertSlot("host_parish", null, null, data.hostParishId);
    if (data.homilistId !== undefined) await upsertSlot("homilist", null, data.homilistId, null);
    if (data.intendedAudience !== undefined) await upsertSlot("intended_audience", data.intendedAudience || null, null, null);
    if (data.theme !== undefined) await upsertSlot("theme", data.theme || null, null, null);
    return { ok: true };
  });

export const addProgramPiece = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string(),
      kindKey: z.string(),
      title: z.string().optional(),
      location: z.string().optional(),
      speakerPersonId: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      insert into program_pieces (id, event_id, kind_key, title, location, speaker_person_id, sort_order)
      values (${nid()}, ${data.eventId}, ${data.kindKey}, ${data.title || null}, ${data.location || null}, ${data.speakerPersonId || null}, 10)
    `;
    return { ok: true };
  });

export const addSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string(), title: z.string().min(1), room: z.string().optional() }).parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      insert into event_sessions (id, event_id, title, room, sort_order)
      values (${nid()}, ${data.eventId}, ${data.title}, ${data.room || null}, 10)
    `;
    return { ok: true };
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string(), status: z.enum(["open", "done", "skipped"]) }).parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`update tasks set status = ${data.status} where id = ${data.id} and chapter_id = ${m.chapterId}`;
    return { ok: true };
  });

export const cloneEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const ev = await sql<Record<string, string | null>>`
      select * from events where id = ${data.eventId} and chapter_id = ${m.chapterId}
    `;
    if (!ev[0]) throw new Error("Event not found");
    const src = ev[0];
    const id = nid();
    let title = src.title ?? "Gathering";
    let starts: string | null = src.starts_at;
    let year = new Date().getFullYear() + 1;
    if (starts) {
      const d = new Date(starts);
      d.setFullYear(d.getFullYear() + 1);
      year = d.getFullYear();
      starts = d.toISOString();
    }
    title = title.replace(/20\d{2}/, String(year));
    if (!/20\d{2}/.test(title)) title = `${title}, ${year}`;
    const clash = await sql<{ id: string }>`
      select id from events
      where chapter_id = ${m.chapterId} and lower(title) = ${foldName(title)} and status <> 'cancelled'
    `;
    if (clash[0]) {
      title = `${title} (copy)`;
    }
    await sql`
      insert into events (id, chapter_id, type_key, title, status, admission, starts_at, timezone, venue_organization_id, venue_detail, celebrant_id, cloned_from_id)
      values (
        ${id}, ${m.chapterId}, ${src.type_key}, ${title}, ${"idea"}, ${src.admission === "private" ? "private" : "free"}, ${starts}, ${src.timezone},
        ${src.venue_organization_id}, ${src.venue_detail}, ${src.celebrant_id}, ${data.eventId}
      )
    `;
    const slots = await sql<{ slot_key: string; text_value: string | null; person_id: string | null; organization_id: string | null }>`
      select slot_key, text_value, person_id, organization_id from event_slots where event_id = ${data.eventId}
    `;
    for (const s of slots) {
      await sql`
        insert into event_slots (event_id, slot_key, text_value, person_id, organization_id)
        values (${id}, ${s.slot_key}, ${s.text_value}, ${s.person_id}, ${s.organization_id})
      `;
    }
    const pieces = await sql<{ kind_key: string; title: string | null; location: string | null }>`
      select kind_key, title, location from program_pieces where event_id = ${data.eventId}
    `;
    let i = 0;
    for (const p of pieces) {
      await sql`
        insert into program_pieces (id, event_id, kind_key, title, location, sort_order)
        values (${nid()}, ${id}, ${p.kind_key}, ${p.title}, ${p.location}, ${i++})
      `;
    }
    await spawnChecklist(sql, m.chapterId, id, src.type_key ?? "gold_mass", starts);
    const guests = await sql<{
      party_type: string;
      person_id: string | null;
      organization_id: string | null;
      kind_key: string;
      party_size: number;
    }>`
      select party_type, person_id, organization_id, kind_key, party_size
      from participations
      where event_id = ${data.eventId}
        and (
          (kind_key in ('guest','group_lead') and guest_status in ('attended','attending'))
          or kind_key = 'org_publicity'
        )
    `;
    for (const g of guests) {
      await sql`
        insert into participations (id, chapter_id, event_id, party_type, person_id, organization_id, kind_key, guest_status, publicity_status, party_size, source)
        values (
          ${nid()}, ${m.chapterId}, ${id}, ${g.party_type}, ${g.person_id}, ${g.organization_id}, ${g.kind_key},
          ${g.kind_key === "org_publicity" ? null : "no_response"},
          ${g.kind_key === "org_publicity" ? "asked" : null},
          ${g.party_size}, ${"invite"}
        )
      `;
    }
    return { id, warnedCelebrant: Boolean(src.celebrant_id) };
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((eventId: string) => eventId)
  .handler(async ({ context, data: eventId }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const people = await sql<{
      id: string;
      person_id: string | null;
      display_name: string | null;
      given_name: string | null;
      family_name: string | null;
      middle_name: string | null;
      suffix: string | null;
      honorific: string | null;
      religious_title: string | null;
      academic_title: string | null;
      kind_key: string;
      guest_status: string | null;
      party_size: number;
      org_name: string | null;
      dietary: string | null;
      person_dietary: string | null;
    }>`
      select p.id, p.person_id, pe.display_name, pe.given_name, pe.family_name,
             coalesce(pe.middle_name, pe.middle_initial) as middle_name, pe.suffix,
             pe.honorific, pe.religious_title, pe.academic_title,
             p.kind_key, p.guest_status, p.party_size,
             o.name as org_name, p.dietary_for_this_event as dietary, pe.dietary as person_dietary
      from participations p
      left join persons pe on pe.id = p.person_id
      left join organizations o on o.id = p.organization_id
      where p.event_id = ${eventId} and p.party_type = 'person'
      order by pe.family_name, pe.given_name, pe.display_name
    `;
    const partners = await sql<{
      id: string;
      organization_id: string | null;
      name: string | null;
      type_key: string | null;
      publicity_status: string | null;
    }>`
      select p.id, p.organization_id, o.name, o.type_key, p.publicity_status
      from participations p
      left join organizations o on o.id = p.organization_id
      where p.event_id = ${eventId} and p.party_type = 'organization'
    `;
    return {
      people: people.map((p) => ({
        ...p,
        display_name: p.person_id ? listedName(p) : p.display_name,
      })),
      partners,
    };
  });

export const addInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string(),
      partyType: z.enum(["person", "organization"]),
      personId: z.string().optional(),
      organizationId: z.string().optional(),
      kindKey: z.string().optional(),
      partySize: z.number().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    if (data.personId) {
      const blocked = await sql<{ status: string; dietary: string | null }>`
        select status, dietary from persons where id = ${data.personId} and chapter_id = ${m.chapterId}
      `;
      if (blocked[0]?.status === "do_not_contact") throw new Error("This person is marked do not contact.");
      const already = await sql<{ id: string }>`
        select id from participations
        where event_id = ${data.eventId} and person_id = ${data.personId} and party_type = 'person'
      `;
      if (already[0]) throw new Error("That person is already on the invite list.");
      const kind = data.kindKey || "guest";
      try {
        await sql`
          insert into participations (id, chapter_id, event_id, party_type, person_id, organization_id, kind_key, guest_status, party_size, source, dietary_for_this_event)
          values (
            ${nid()}, ${m.chapterId}, ${data.eventId}, ${"person"}, ${data.personId}, ${data.organizationId ?? null},
            ${kind}, ${"no_response"}, ${data.partySize ?? 1}, ${"invite"}, ${blocked[0]?.dietary ?? null}
          )
        `;
      } catch (err) {
        if (isUniqueViolation(err)) throw new Error("That person is already on the invite list.");
        throw err;
      }
    } else if (data.organizationId) {
      const already = await sql<{ id: string }>`
        select id from participations
        where event_id = ${data.eventId} and organization_id = ${data.organizationId} and party_type = 'organization'
      `;
      if (already[0]) throw new Error("That partner is already on the invite list.");
      await sql`
        insert into participations (id, chapter_id, event_id, party_type, organization_id, kind_key, publicity_status, source)
        values (${nid()}, ${m.chapterId}, ${data.eventId}, ${"organization"}, ${data.organizationId}, ${"org_publicity"}, ${"asked"}, ${"invite"})
      `;
    }
    return { ok: true };
  });

export const updateParticipation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      guestStatus: z.string().optional(),
      publicityStatus: z.string().optional(),
      partySize: z.number().optional(),
      dietaryForThisEvent: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      update participations set
        guest_status = coalesce(${data.guestStatus ?? null}, guest_status),
        publicity_status = coalesce(${data.publicityStatus ?? null}, publicity_status),
        party_size = coalesce(${data.partySize ?? null}, party_size),
        dietary_for_this_event = coalesce(${data.dietaryForThisEvent ?? null}, dietary_for_this_event),
        checked_in_at = case when ${data.guestStatus ?? ""} = 'attended' then now() else checked_in_at end
      where id = ${data.id} and chapter_id = ${m.chapterId}
    `;
    return { ok: true };
  });

export const walkUpCheckIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string(),
      displayName: z.string().min(1),
      email: z.string().optional(),
      dietary: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const email = lowerEmail(data.email);
    const name = data.displayName.trim();
    const parts = splitWalkupName(name);
    let personId: string | null = null;
    if (email) {
      const found = await sql<{ id: string }>`
        select id from persons where chapter_id = ${m.chapterId} and lower(email) = ${email}
      `;
      personId = found[0]?.id ?? null;
    }
    if (!personId) {
      const found = await sql<{ id: string; email: string | null }>`
        select id, email from persons
        where chapter_id = ${m.chapterId}
          and (
            lower(display_name) = ${foldName(name)}
            or (
              lower(coalesce(given_name, '')) = ${foldName(parts.givenName)}
              and lower(coalesce(family_name, '')) = ${foldName(parts.familyName ?? "")}
              and ${parts.familyName}::text is not null
            )
          )
      `;
      if (found.length > 1 && !email) {
        throw new Error(`Several people are named ${name}. Add an email so we can tell them apart.`);
      }
      if (found.length === 1) personId = found[0].id;
    }
    if (!personId) {
      personId = nid();
      await sql`
        insert into persons (id, chapter_id, display_name, given_name, family_name, email, dietary, source, created_by, country)
        values (${personId}, ${m.chapterId}, ${name}, ${parts.givenName || null}, ${parts.familyName}, ${email}, ${data.dietary || null}, ${"walkup"}, ${m.userId}, ${"United States"})
      `;
      await sql`insert into person_roles (person_id, role_key) values (${personId}, ${"friend"})`;
    } else if (data.dietary) {
      await sql`update persons set dietary = coalesce(dietary, ${data.dietary}) where id = ${personId}`;
    }
    const existing = await sql<{ id: string; guest_status: string | null }>`
      select id, guest_status from participations
      where event_id = ${data.eventId} and person_id = ${personId} and party_type = 'person'
    `;
    if (existing[0]) {
      await sql`
        update participations set
          guest_status = 'attended',
          checked_in_at = coalesce(checked_in_at, now()),
          dietary_for_this_event = coalesce(dietary_for_this_event, ${data.dietary || null})
        where id = ${existing[0].id}
      `;
      return { personId, alreadyInvited: true };
    }
    await sql`
      insert into participations (id, chapter_id, event_id, party_type, person_id, kind_key, guest_status, source, dietary_for_this_event, checked_in_at)
      values (${nid()}, ${m.chapterId}, ${data.eventId}, ${"person"}, ${personId}, ${"guest"}, ${"attended"}, ${"walkup"}, ${data.dietary || null}, now())
    `;
    return { personId, alreadyInvited: false };
  });

export const closeDoor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((eventId: string) => eventId)
  .handler(async ({ context, data: eventId }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      update participations set guest_status = 'no_show'
      where event_id = ${eventId} and chapter_id = ${m.chapterId} and guest_status = 'attending'
    `;
    return { ok: true };
  });

export const listMail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const templates = await sql<{
      id: string;
      key: string;
      name: string;
      audience_hint: string;
      subject: string;
      body: string;
      event_type_key: string | null;
    }>`select id, key, name, audience_hint, subject, body, event_type_key from mail_templates where chapter_id = ${m.chapterId} order by name`;
    const mailings = await sql<{
      id: string;
      subject_snapshot: string | null;
      status: string;
      audience_count: number | null;
      created_at: string;
      event_title: string | null;
    }>`
      select m.id, m.subject_snapshot, m.status, m.audience_count, m.created_at, e.title as event_title
      from mailings m
      left join events e on e.id = m.event_id
      where m.chapter_id = ${m.chapterId}
      order by m.created_at desc
      limit 20
    `;
    return { templates, mailings, mailbox: { fromName: m.fromName, fromAddress: m.fromAddress, replyTo: m.replyTo } };
  });

type Recipient = {
  kind: "person" | "org_main";
  personId?: string;
  organizationId?: string;
  address: string;
  displayName: string;
  honorific: string;
  givenName: string;
  familyName: string;
  orgName: string;
  roleAt: string;
};

function mergeFields(
  text: string,
  rec: Recipient,
  event: { title: string; date: string; time: string; venue: string; detail: string },
  chapter: MemberContext,
) {
  const map: Record<string, string> = {
    honorific: rec.honorific,
    given_name: rec.givenName,
    family_name: rec.familyName,
    display_name: rec.displayName,
    org_or_school_name: rec.orgName,
    role_at_institution: rec.roleAt,
    event_title: event.title,
    event_date: event.date,
    event_time: event.time,
    venue_name: event.venue,
    venue_detail: event.detail,
    rsvp_line: "Please reply to this email with attending, regrets, or the number from your school.",
    chapter_name: chapter.chapterName,
    chapter_contact: chapter.contactLine ?? "",
    unsubscribe_url: "(unsubscribe)",
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => map[k] ?? "");
}

async function resolveAudience(
  sql: Awaited<ReturnType<typeof getSql>>,
  m: MemberContext,
  source: string,
  eventId?: string,
): Promise<{ recipients: Recipient[]; skips: { partyType: string; id: string; name: string; reason: string }[] }> {
  const recipients: Recipient[] = [];
  const skips: { partyType: string; id: string; name: string; reason: string }[] = [];
  const seen = new Set<string>();

  const pushPerson = (p: {
    id: string;
    display_name: string;
    honorific: string | null;
    given_name: string | null;
    family_name: string | null;
    email: string | null;
    email_unsubscribed: boolean;
    status: string;
    orgName?: string;
    roleAt?: string;
    organizationId?: string;
  }) => {
    if (seen.has(`p:${p.id}`)) return;
    if (p.status === "do_not_contact" || p.email_unsubscribed) {
      skips.push({ partyType: "person", id: p.id, name: p.display_name, reason: "unsubscribed" });
      return;
    }
    if (!p.email) {
      skips.push({ partyType: "person", id: p.id, name: p.display_name, reason: "no_email" });
      return;
    }
    seen.add(`p:${p.id}`);
    recipients.push({
      kind: "person",
      personId: p.id,
      organizationId: p.organizationId,
      address: p.email,
      displayName: p.display_name,
      honorific: p.honorific ?? "",
      givenName: p.given_name ?? "",
      familyName: p.family_name ?? "",
      orgName: p.orgName ?? "",
      roleAt: p.roleAt ?? "",
    });
  };

  if (source === "school_doors") {
    const schools = eventId
      ? await sql<{ id: string; name: string; main_email: string | null; preferred_door: string | null }>`
          select o.id, o.name, o.main_email, o.preferred_door from organizations o
          join participations p on p.organization_id = o.id and p.event_id = ${eventId} and p.party_type = 'organization'
          where o.chapter_id = ${m.chapterId} and o.type_key in ('high_school', 'university')
        `
      : await sql<{ id: string; name: string; main_email: string | null; preferred_door: string | null }>`
          select id, name, main_email, preferred_door from organizations
          where chapter_id = ${m.chapterId} and status = 'active' and type_key in ('high_school', 'university')
        `;
    for (const s of schools) {
      const doors = await sql<{
        id: string;
        display_name: string;
        honorific: string | null;
        given_name: string | null;
        family_name: string | null;
        email: string | null;
        email_unsubscribed: boolean;
        status: string;
        role_key: string;
      }>`
        select p.id, p.display_name, p.honorific, p.given_name, p.family_name, p.email, p.email_unsubscribed, p.status, a.role_key
        from affiliations a
        join persons p on p.id = a.person_id
        where a.organization_id = ${s.id} and a.is_current
      `;
      const preferred = s.preferred_door || "science_chair";
      const order = [preferred, "science_chair", "campus_minister", "principal"];
      let found = doors.find((d) => d.role_key === order[0] && d.email && !d.email_unsubscribed && d.status !== "do_not_contact");
      if (!found) found = doors.find((d) => order.includes(d.role_key) && d.email && !d.email_unsubscribed);
      if (found) {
        pushPerson({ ...found, orgName: s.name, roleAt: found.role_key.replaceAll("_", " "), organizationId: s.id });
      } else if (s.main_email) {
        recipients.push({
          kind: "org_main",
          organizationId: s.id,
          address: s.main_email,
          displayName: s.name,
          honorific: "",
          givenName: "",
          familyName: "",
          orgName: s.name,
          roleAt: "front office",
        });
      } else {
        skips.push({ partyType: "organization", id: s.id, name: s.name, reason: "no_door" });
      }
    }
  } else if (source === "parish_secretaries") {
    const parishes = await sql<{ id: string; name: string; main_email: string | null }>`
      select id, name, main_email from organizations where chapter_id = ${m.chapterId} and type_key = 'parish'
    `;
    for (const o of parishes) {
      const people = await sql<{
        id: string;
        display_name: string;
        honorific: string | null;
        given_name: string | null;
        family_name: string | null;
        email: string | null;
        email_unsubscribed: boolean;
        status: string;
        role_key: string;
      }>`
        select p.id, p.display_name, p.honorific, p.given_name, p.family_name, p.email, p.email_unsubscribed, p.status, a.role_key
        from affiliations a join persons p on p.id = a.person_id
        where a.organization_id = ${o.id} and a.is_current
      `;
      const found =
        people.find((d) => d.role_key === "parish_secretary" && d.email) ||
        people.find((d) => d.role_key === "pastor" && d.email);
      if (found) pushPerson({ ...found, orgName: o.name, roleAt: found.role_key.replaceAll("_", " "), organizationId: o.id });
      else if (o.main_email) {
        recipients.push({
          kind: "org_main",
          organizationId: o.id,
          address: o.main_email,
          displayName: o.name,
          honorific: "",
          givenName: "",
          familyName: "",
          orgName: o.name,
          roleAt: "front office",
        });
      } else {
        skips.push({ partyType: "organization", id: o.id, name: o.name, reason: "no_bulletin_contact" });
      }
    }
  } else if (source === "event_guests" && eventId) {
    const people = await sql<{
      id: string;
      display_name: string;
      honorific: string | null;
      given_name: string | null;
      family_name: string | null;
      email: string | null;
      email_unsubscribed: boolean;
      status: string;
    }>`
      select pe.id, pe.display_name, pe.honorific, pe.given_name, pe.family_name, pe.email, pe.email_unsubscribed, pe.status
      from participations p join persons pe on pe.id = p.person_id
      where p.event_id = ${eventId} and p.party_type = 'person'
    `;
    for (const p of people) pushPerson(p);
  } else if (source === "members") {
    const people = await sql<{
      id: string;
      display_name: string;
      honorific: string | null;
      given_name: string | null;
      family_name: string | null;
      email: string | null;
      email_unsubscribed: boolean;
      status: string;
    }>`
      select p.id, p.display_name, p.honorific, p.given_name, p.family_name, p.email, p.email_unsubscribed, p.status
      from persons p
      join person_roles r on r.person_id = p.id and r.role_key = 'academic_member'
      where p.chapter_id = ${m.chapterId}
    `;
    for (const p of people) pushPerson(p);
  }
  return { recipients, skips };
}

function eventMetaFrom(ev: { title: string; starts_at: string | null; venue_detail: string | null; venue_name: string | null } | undefined) {
  return {
    title: ev?.title ?? "",
    date: ev?.starts_at ? formatWhen(ev.starts_at, "dateLong") : "",
    time: ev?.starts_at ? formatWhen(ev.starts_at, "time") : "",
    venue: ev?.venue_name ?? "",
    detail: ev?.venue_detail ?? "",
  };
}

export const previewMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      templateId: z.string(),
      eventId: z.string().optional(),
      audienceSource: z.string(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const t = await sql<{ subject: string; body: string; name: string; key: string }>`
      select subject, body, name, key from mail_templates where id = ${data.templateId} and chapter_id = ${m.chapterId}
    `;
    if (!t[0]) throw new Error("Template not found");
    const ev = data.eventId
      ? await sql<{ title: string; starts_at: string | null; venue_detail: string | null; venue_name: string | null }>`
          select e.title, e.starts_at, e.venue_detail, o.name as venue_name
          from events e left join organizations o on o.id = e.venue_organization_id
          where e.id = ${data.eventId}
        `
      : [];
    const eventMeta = eventMetaFrom(ev[0]);
    const { recipients, skips } = await resolveAudience(sql, m, data.audienceSource, data.eventId);
    const sample = recipients[0];
    const subject = sample ? mergeFields(t[0].subject, sample, eventMeta, m) : t[0].subject;
    const body = sample ? mergeFields(t[0].body, sample, eventMeta, m) : t[0].body;
    const frontOffice = recipients.filter((r) => r.kind !== "person").length;
    return {
      templateKey: t[0].key,
      templateName: t[0].name,
      subject,
      body,
      previewAs: sample?.displayName ?? null,
      audienceCount: recipients.length,
      frontOffice,
      skips,
      recipients: recipients.map((r) => ({
        kind: r.kind,
        name: r.displayName,
        address: r.address,
        orgName: r.orgName,
      })),
    };
  });

export const sendMail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      templateId: z.string(),
      eventId: z.string().optional(),
      audienceSource: z.string(),
      typedCount: z.number(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const t = await sql<{ subject: string; body: string; key: string }>`
      select subject, body, key from mail_templates where id = ${data.templateId} and chapter_id = ${m.chapterId}
    `;
    if (!t[0]) throw new Error("Template not found");
    const ev = data.eventId
      ? await sql<{ title: string; starts_at: string | null; venue_detail: string | null; venue_name: string | null }>`
          select e.title, e.starts_at, e.venue_detail, o.name as venue_name
          from events e left join organizations o on o.id = e.venue_organization_id
          where e.id = ${data.eventId}
        `
      : [];
    const eventMeta = eventMetaFrom(ev[0]);
    const { recipients, skips } = await resolveAudience(sql, m, data.audienceSource, data.eventId);
    if (recipients.length < 1) throw new Error("No one to send to. Check skipped partners and add a chair or front-office email.");
    if (data.typedCount !== recipients.length) {
      throw new Error(`Type ${recipients.length} to confirm. That is the exact recipient count.`);
    }
    const mailingId = nid();
    const subjectSnap = mergeFields(t[0].subject, recipients[0], eventMeta, m);
    const bodySnap = mergeFields(t[0].body, recipients[0], eventMeta, m);
    await sql`
      insert into mailings (id, chapter_id, template_id, event_id, subject_snapshot, body_snapshot, audience_source, audience_count, status, created_by, confirmed_by, confirm_typed_count)
      values (
        ${mailingId}, ${m.chapterId}, ${data.templateId}, ${data.eventId ?? null},
        ${subjectSnap}, ${bodySnap}, ${data.audienceSource}, ${recipients.length},
        ${"sent"}, ${m.userId}, ${m.userId}, ${data.typedCount}
      )
    `;
    for (const s of skips) {
      await sql`
        insert into mailing_skips (id, mailing_id, party_type, organization_id, person_id, reason)
        values (
          ${nid()}, ${mailingId}, ${s.partyType},
          ${s.partyType === "organization" ? s.id : null},
          ${s.partyType === "person" ? s.id : null},
          ${s.reason}
        )
      `;
      if (s.reason === "no_door") {
        await sql`
          insert into tasks (id, chapter_id, title, due_on, status, organization_id, hat)
          values (${nid()}, ${m.chapterId}, ${`Add science chair for ${s.name}`}, ${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}, ${"open"}, ${s.id}, ${"secretary"})
        `;
      }
    }
    for (const r of recipients) {
      const touchId = nid();
      await sql`
        insert into touches (id, chapter_id, person_id, organization_id, kind, summary, event_id, mailing_id, author_id)
        values (
          ${touchId}, ${m.chapterId}, ${r.personId ?? null}, ${r.organizationId ?? null},
          ${"email"}, ${subjectSnap}, ${data.eventId ?? null}, ${mailingId}, ${m.userId}
        )
      `;
      await bumpTouch(sql, { personId: r.personId, orgId: r.organizationId });
      await sql`
        insert into mail_messages (id, mailing_id, recipient_kind, person_id, organization_id, address, status, sent_at, touch_id)
        values (
          ${nid()}, ${mailingId}, ${r.kind}, ${r.personId ?? null}, ${r.organizationId ?? null},
          ${r.address}, ${"sent"}, now(), ${touchId}
        )
      `;
    }
    let checklistPrompt = false;
    if (t[0].key === "school_faculty_invite" && data.eventId) {
      const open = await sql<{ id: string }>`
        select id from tasks where event_id = ${data.eventId} and checklist_key = 'notify_schools' and status = 'open'
      `;
      checklistPrompt = Boolean(open[0]);
    }
    return { mailingId, sent: recipients.length, skipped: skips.length, checklistPrompt };
  });

export const getMailing = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ context, data: id }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const rows = await sql<Row>`
      select * from mailings where id = ${id} and chapter_id = ${m.chapterId}
    `;
    if (!rows[0]) throw new Error("Mailing not found");
    const messages = await sql<{
      recipient_kind: string;
      address: string;
      status: string;
      person_name: string | null;
      org_name: string | null;
    }>`
      select mm.recipient_kind, mm.address, mm.status, p.display_name as person_name, o.name as org_name
      from mail_messages mm
      left join persons p on p.id = mm.person_id
      left join organizations o on o.id = mm.organization_id
      where mm.mailing_id = ${id}
    `;
    const skips = await sql<{ reason: string; organization_id: string | null }>`
      select reason, organization_id from mailing_skips where mailing_id = ${id}
    `;
    return { mailing: rows[0], messages, skips };
  });

export const markNotifySchools = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((eventId: string) => eventId)
  .handler(async ({ context, data: eventId }) => {
    const m = await ctx(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      update tasks set status = 'done'
      where event_id = ${eventId} and checklist_key = 'notify_schools' and chapter_id = ${m.chapterId}
    `;
    return { ok: true };
  });

export const updateChapter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().min(1),
      contactLine: z.string().optional(),
      fromName: z.string().optional(),
      fromAddress: z.string().optional(),
      replyTo: z.string().optional(),
      timezone: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    await sql`
      update chapters set
        name = ${data.name.trim()},
        contact_line = ${data.contactLine || null},
        from_name = ${data.fromName || data.name.trim()},
        from_address = ${lowerEmail(data.fromAddress)},
        reply_to = ${lowerEmail(data.replyTo) ?? lowerEmail(data.fromAddress)},
        timezone = ${data.timezone || m.timezone}
      where id = ${m.chapterId}
    `;
    return { ok: true };
  });

export const exportNametags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((eventId: string) => eventId)
  .handler(async ({ context, data: eventId }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      honorific: string | null;
      display_name: string;
      party_size: number;
      kind_key: string;
      guest_status: string | null;
      dietary: string | null;
      person_dietary: string | null;
      org_name: string | null;
    }>`
      select pe.honorific, pe.display_name, p.party_size, p.kind_key, p.guest_status,
             p.dietary_for_this_event as dietary, pe.dietary as person_dietary, o.name as org_name
      from participations p
      join persons pe on pe.id = p.person_id
      left join organizations o on o.id = p.organization_id
      where p.event_id = ${eventId} and p.party_type = 'person'
        and p.guest_status in ('attending', 'attended', 'no_response')
      order by pe.display_name
    `;
    const header = "honorific,display_name,nametag_line,org_or_school_name,party_size,kind,status,dietary";
    const lines = rows.map((r) => {
      const name = r.display_name;
      const dietary = r.dietary || r.person_dietary || "";
      return [r.honorific ?? "", r.display_name, name, r.org_name ?? "", r.party_size, r.kind_key, r.guest_status ?? "", dietary]
        .map((c) => `"${String(c).replaceAll('"', '""')}"`)
        .join(",");
    });
    return { csv: [header, ...lines].join("\n"), filename: "nametags.csv" };
  });

export const listClergy = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; display_name: string; given_name: string | null; family_name: string | null; middle_name: string | null; suffix: string | null; honorific: string | null; religious_title: string | null; academic_title: string | null }>`
      select p.id, p.display_name, p.given_name, p.family_name, coalesce(p.middle_name, p.middle_initial) as middle_name, p.suffix,
             p.honorific, p.religious_title, p.academic_title
      from persons p
      join person_roles r on r.person_id = p.id and r.role_key = 'clergy'
      where p.chapter_id = ${m.chapterId}
      order by p.family_name, p.given_name, p.display_name
    `;
    return rows.map((p) => ({ id: p.id, display_name: listedName(p) }));
  });

const listKeySchema = z.enum(["religious_title", "academic_title", "state", "country"]);

export const listItems = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((key: ListKey) => listKeySchema.parse(key))
  .handler(async ({ context, data: key }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    return sql<{ id: string; value: string; sort_order: number; active: boolean }>`
      select id, value, sort_order, active from list_items
      where chapter_id = ${m.chapterId} and list_key = ${key} and active
      order by sort_order, value
    `;
  });

export const listAllLists = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await ctx(context.userId);
    const sql = await getSql();
    const items = await sql<{ id: string; list_key: string; value: string; sort_order: number }>`
      select id, list_key, value, sort_order from list_items
      where chapter_id = ${m.chapterId} and active
      order by list_key, sort_order, value
    `;
    return LIST_KEYS.map((meta) => ({
      key: meta.key,
      label: meta.label,
      items: items.filter((i) => i.list_key === meta.key),
    }));
  });

export const addListItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ listKey: listKeySchema, value: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    const value = data.value.trim();
    const dup = await sql<{ id: string; active: boolean }>`
      select id, active from list_items
      where chapter_id = ${m.chapterId} and list_key = ${data.listKey} and lower(value) = ${value.toLowerCase()}
    `;
    if (dup[0]) {
      if (dup[0].active) throw new Error(`“${value}” is already on this list.`);
      await sql`update list_items set active = true where id = ${dup[0].id}`;
      return { id: dup[0].id, restored: true };
    }
    const max = await sql<{ n: number }>`
      select coalesce(max(sort_order), -1)::int as n from list_items
      where chapter_id = ${m.chapterId} and list_key = ${data.listKey}
    `;
    const id = nid();
    await sql`
      insert into list_items (id, chapter_id, list_key, value, sort_order)
      values (${id}, ${m.chapterId}, ${data.listKey}, ${value}, ${(max[0]?.n ?? -1) + 1})
    `;
    return { id, restored: false };
  });

export const deleteListItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await ctx(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    await sql`
      update list_items set active = false
      where id = ${data.id} and chapter_id = ${m.chapterId}
    `;
    return { ok: true };
  });

export { OCCASIONS };
