import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { PERSON_ROLES } from "./constants";
import { todayIn } from "./dates";
import { lowerEmail, nid } from "./ids";
import {
  IMPORT_LIMITS,
  IMPORT_MAX_ROWS,
  classifyRows,
  formatDifference,
  roleKey,
  type ExistingPerson,
  type ImportRow,
} from "./import-rules";
import { composedHonorific } from "./lists";
import { assertEditor, loadMember } from "./member";
import { composePersonName, foldName, postNominalsText } from "./names";
import { findPersonByEmail } from "./person-emails";

function capped(max: number) {
  return z.string().trim().max(max);
}

const rowSchema = z.object({
  given_name: capped(IMPORT_LIMITS.given_name),
  family_name: capped(IMPORT_LIMITS.family_name),
  email: capped(IMPORT_LIMITS.email),
  phone: capped(IMPORT_LIMITS.phone),
  mobile: capped(IMPORT_LIMITS.mobile),
  street: capped(IMPORT_LIMITS.street),
  street2: capped(IMPORT_LIMITS.street2),
  city: capped(IMPORT_LIMITS.city),
  state: capped(IMPORT_LIMITS.state),
  postal_code: capped(IMPORT_LIMITS.postal_code),
  country: capped(IMPORT_LIMITS.country),
  website: capped(IMPORT_LIMITS.website),
  religious_title: capped(IMPORT_LIMITS.religious_title),
  academic_title: capped(IMPORT_LIMITS.academic_title),
  suffix: capped(IMPORT_LIMITS.suffix),
  post_nominals: capped(IMPORT_LIMITS.post_nominals),
  role: capped(IMPORT_LIMITS.role),
  partner: capped(IMPORT_LIMITS.partner),
  notes: capped(IMPORT_LIMITS.notes),
});

const importInput = z.object({
  rows: z.array(rowSchema).max(IMPORT_MAX_ROWS),
});

function isUniqueViolation(err: unknown): boolean {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|unique index|23505/i.test(msg);
}

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function pushUnique(list: string[], value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (list.some((item) => item.toLowerCase() === key)) return;
  list.push(trimmed);
}

/** Add calendar days to YYYY-MM-DD in UTC so the chapter zone cannot shift the date. */
function addCalendarDays(ymd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error("Could not set a due date.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type PersonRow = {
  id: string;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  website: string | null;
  religious_title: string | null;
  academic_title: string | null;
  suffix: string | null;
  post_nominals: string | null;
  notes: string | null;
};

/** People still in the book, with other emails, role keys, and partner names. */
async function loadExisting(sql: Sql, chapterId: string): Promise<ExistingPerson[]> {
  const people = await sql<PersonRow>`
    select id, display_name, given_name, family_name, email,
           phone, mobile, street, street2, city, state, postal_code, country,
           website, religious_title, academic_title, suffix, post_nominals, notes
    from persons
    where chapter_id = ${chapterId} and forgotten_at is null
    order by lower(display_name), display_name, id
  `;
  const extras = await sql<{ person_id: string; email: string }>`
    select e.person_id, e.email
    from person_emails e
    join persons p on p.id = e.person_id and p.chapter_id = e.chapter_id
    where e.chapter_id = ${chapterId} and p.forgotten_at is null
    order by e.person_id, e.email
  `;
  const roles = await sql<{ person_id: string; role_key: string }>`
    select r.person_id, r.role_key
    from person_roles r
    join persons p on p.id = r.person_id
    where p.chapter_id = ${chapterId} and p.forgotten_at is null
    order by r.person_id, r.role_key
  `;
  const partners = await sql<{ person_id: string; name: string }>`
    select a.person_id, o.name
    from affiliations a
    join organizations o on o.id = a.organization_id and o.chapter_id = a.chapter_id
    join persons p on p.id = a.person_id and p.chapter_id = a.chapter_id
    where a.chapter_id = ${chapterId} and p.forgotten_at is null
    order by a.person_id, lower(o.name), o.name
  `;
  const byId = new Map<string, ExistingPerson>();
  for (const person of people) {
    const emails: string[] = [];
    pushUnique(emails, text(person.email));
    byId.set(person.id, {
      id: person.id,
      display_name: text(person.display_name),
      given_name: text(person.given_name),
      family_name: text(person.family_name),
      emails,
      city: text(person.city),
      partnerNames: [],
      phone: text(person.phone),
      mobile: text(person.mobile),
      street: text(person.street),
      street2: text(person.street2),
      state: text(person.state),
      postal_code: text(person.postal_code),
      country: text(person.country),
      website: text(person.website),
      religious_title: text(person.religious_title),
      academic_title: text(person.academic_title),
      suffix: text(person.suffix),
      post_nominals: text(person.post_nominals),
      notes: text(person.notes),
      roles: [],
    });
  }
  for (const extra of extras) {
    const person = byId.get(extra.person_id);
    if (person) pushUnique(person.emails, extra.email);
  }
  for (const role of roles) {
    const person = byId.get(role.person_id);
    if (person?.roles && !person.roles.includes(role.role_key)) person.roles.push(role.role_key);
  }
  for (const partner of partners) {
    const person = byId.get(partner.person_id);
    if (person) pushUnique(person.partnerNames, partner.name);
  }
  return [...byId.values()];
}

async function insertNew(
  sql: Sql,
  chapterId: string,
  userId: string,
  row: ImportRow,
): Promise<boolean> {
  const given = row.given_name.trim();
  const family = row.family_name.trim();
  const suffix = row.suffix.trim() || null;
  const postNominals = postNominalsText(row.post_nominals) || null;
  const religious = row.religious_title.trim();
  const academic = row.academic_title.trim();
  const honorific = composedHonorific(religious, academic);
  const name = composePersonName({
    religiousTitle: religious,
    academicTitle: academic,
    givenName: given,
    familyName: family,
    suffix,
    postNominals,
  });
  const email = lowerEmail(row.email);
  if (email) {
    const dup = await findPersonByEmail(sql, chapterId, email);
    if (dup) return false;
  } else {
    const dup = await sql<{ id: string }>`
      select id from persons
      where chapter_id = ${chapterId}
        and forgotten_at is null
        and (
          lower(display_name) = ${foldName(name)}
          or (
            lower(coalesce(given_name, '')) = ${foldName(given)}
            and lower(coalesce(family_name, '')) = ${foldName(family)}
          )
        )
    `;
    if (dup[0]) return false;
  }
  const id = nid();
  try {
    await sql`
      insert into persons (
        id, chapter_id, display_name, given_name, family_name, middle_name, middle_initial, suffix,
        honorific, religious_title, academic_title, post_nominals, salutation_override,
        email, phone, mobile, street, street2, city, state, postal_code, country, website, dietary, notes,
        source, news_consent, created_by
      )
      values (
        ${id}, ${chapterId}, ${name}, ${given}, ${family}, ${null}, ${null}, ${suffix},
        ${honorific}, ${religious || null}, ${academic || null}, ${postNominals}, ${null},
        ${email}, ${blankToNull(row.phone)}, ${blankToNull(row.mobile)}, ${blankToNull(row.street)},
        ${blankToNull(row.street2)}, ${blankToNull(row.city)}, ${blankToNull(row.state)},
        ${blankToNull(row.postal_code)}, ${row.country.trim() || "United States"}, ${blankToNull(row.website)},
        ${null}, ${blankToNull(row.notes)}, ${"import"}, ${"unknown"}, ${userId}
      )
    `;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
  await sql`
    insert into person_roles (person_id, role_key) values (${id}, ${roleKey(row.role, PERSON_ROLES)})
  `;
  return true;
}

export const checkImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(importInput.parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const existing = await loadExisting(sql, member.chapterId);
    return { rows: classifyRows(data.rows, existing, PERSON_ROLES) };
  });

export const importPeople = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(importInput.parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const existing = await loadExisting(sql, member.chapterId);
    const classified = classifyRows(data.rows, existing, PERSON_ROLES);
    let created = 0;
    let matchRows = 0;
    const drafts = new Map<string, { name: string; lines: string[] }>();
    for (const item of classified) {
      if (item.kind === "new") {
        const ok = await insertNew(sql, member.chapterId, member.userId, item.values);
        if (ok) created += 1;
        continue;
      }
      if (item.kind !== "match" || item.differences.length === 0 || !item.personId) continue;
      matchRows += 1;
      const draft = drafts.get(item.personId) ?? {
        name: item.personName ?? "this person",
        lines: [],
      };
      for (const diff of item.differences) {
        const line = formatDifference(diff);
        if (!draft.lines.includes(line)) draft.lines.push(line);
      }
      drafts.set(item.personId, draft);
    }
    const dueOn = addCalendarDays(todayIn(member.timezone), 7);
    for (const [personId, draft] of drafts) {
      await sql`
        insert into tasks (id, chapter_id, title, due_on, status, person_id, hat, notes)
        values (
          ${nid()}, ${member.chapterId}, ${`Import: check changes for ${draft.name}`}, ${dueOn},
          ${"open"}, ${personId}, ${"secretary"}, ${draft.lines.join("\n")}
        )
      `;
    }
    const tasks = drafts.size;
    const skipped = classified.length - created - matchRows;
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "people_imported",
      entity: "chapter",
      entityId: member.chapterId,
      detail: { created, tasks, skipped },
    });
    return { created, tasks, skipped };
  });
