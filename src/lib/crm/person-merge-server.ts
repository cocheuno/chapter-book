import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { todayIn } from "./dates";
import { lowerEmail, nid } from "./ids";
import { composedHonorific } from "./lists";
import { assertEditor, loadMember } from "./member";
import { composePersonName, postNominalsText } from "./names";
import {
  MERGE_FIELDS,
  affiliationPlan,
  defaultPicks,
  differingFields,
  mergeParticipation,
  leftoverEmails,
  mergePersonFields,
  type AffiliationPlan,
  type MergeFieldName,
  type MergedPerson,
} from "./person-merge";
import { SAFE_ENV_FIELDS, readSafeEnvironment, safeEnvToCopy } from "./safe-environment";

const side = z.enum(["keep", "other"]);

const pickShape = {
  religious_title: side,
  academic_title: side,
  given_name: side,
  middle_name: side,
  middle_initial: side,
  family_name: side,
  suffix: side,
  post_nominals: side,
  salutation_override: side,
  email: side,
  phone: side,
  mobile: side,
  street: side,
  street2: side,
  city: side,
  state: side,
  postal_code: side,
  country: side,
  website: side,
  dietary: side,
  status: side,
  deceased_on: side,
} satisfies Record<MergeFieldName, typeof side>;

const mergeInput = z.object({
  keepId: z.string().min(1),
  mergeId: z.string().min(1),
  picks: z.object(pickShape),
  confirm: z.string(),
});

type MoveCounts = {
  participations: number;
  affiliations: number;
  roles: number;
  tasks: number;
  touches: number;
  letters: number;
  registrations: number;
  attendees: number;
  celebrant: number;
  speakerSlots: number;
  otherEmails: number;
};

type AffiliationMove = { id: string; plan: AffiliationPlan };

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

function show(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function blankToNull(value: string | null): string | null {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function previewPerson(row: Record<string, unknown>) {
  const person: Record<string, string> = {
    id: typeof row.id === "string" ? row.id : "",
    display_name: show(row.display_name),
    notes: show(row.notes),
  };
  for (const field of MERGE_FIELDS) person[field.field] = show(row[field.field]);
  return person;
}

/** Dates become ISO strings so the audit row can be read back without the driver. */
function removedRow(row: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  const hidden = new Set<string>(SAFE_ENV_FIELDS);
  for (const [key, value] of Object.entries(row)) {
    if (key === "chapter_id" || hidden.has(key)) continue;
    if (value instanceof Date)
      copy[key] = Number.isNaN(value.getTime()) ? null : value.toISOString();
    else if (typeof value === "bigint") copy[key] = Number(value);
    else copy[key] = value;
  }
  return copy;
}

async function countOf(query: Promise<{ n: number }[]>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.n ?? 0);
}

async function loadPair(sql: Sql, chapterId: string, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new Error("Choose two different people.");
  const rows = await sql<Record<string, unknown>>`
    select * from persons
    where chapter_id = ${chapterId} and (id = ${keepId} or id = ${mergeId})
  `;
  const keep = rows.find((row) => row.id === keepId);
  const other = rows.find((row) => row.id === mergeId);
  if (!keep) throw new Error("Person not found.");
  if (!other) throw new Error("That record was already merged.");
  return { keep, other };
}

async function affiliationMoves(
  sql: Sql,
  chapterId: string,
  keepId: string,
  mergeId: string,
): Promise<AffiliationMove[]> {
  const [otherRows, keepRows] = await Promise.all([
    sql<{ id: string; organization_id: string | null; role_key: string; is_current: boolean }>`
      select id, organization_id, role_key, is_current
      from affiliations
      where person_id = ${mergeId} and chapter_id = ${chapterId}
    `,
    sql<{ organization_id: string | null; role_key: string }>`
      select organization_id, role_key
      from affiliations
      where person_id = ${keepId} and chapter_id = ${chapterId} and is_current
    `,
  ]);
  const current = new Map<string, string[]>();
  for (const row of keepRows) {
    const orgId = row.organization_id ?? "";
    const roles = current.get(orgId) ?? [];
    roles.push(row.role_key);
    current.set(orgId, roles);
  }
  return otherRows.map((row) => ({
    id: row.id,
    plan: affiliationPlan(
      {
        organizationId: row.organization_id ?? "",
        roleKey: row.role_key,
        isCurrent: row.is_current === true,
      },
      current,
    ),
  }));
}

async function moveCounts(
  sql: Sql,
  chapterId: string,
  keepId: string,
  mergeId: string,
): Promise<{ counts: MoveCounts; affiliations: AffiliationMove[] }> {
  const [
    participations,
    roles,
    tasks,
    touches,
    letters,
    registrations,
    attendees,
    celebrant,
    speakerSlots,
    otherEmails,
    affiliations,
  ] = await Promise.all([
    countOf(sql<{ n: number }>`
        select count(*)::int as n from participations
        where person_id = ${mergeId} and chapter_id = ${chapterId} and party_type = 'person'
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n from person_roles where person_id = ${mergeId}
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n from tasks
        where person_id = ${mergeId} and chapter_id = ${chapterId}
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n from touches
        where person_id = ${mergeId} and chapter_id = ${chapterId}
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n
        from mail_messages msg
        join mailings m on m.id = msg.mailing_id
        where msg.person_id = ${mergeId} and m.chapter_id = ${chapterId}
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n from registrations
        where purchaser_person_id = ${mergeId} and chapter_id = ${chapterId}
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n from registration_attendees
        where person_id = ${mergeId} and chapter_id = ${chapterId}
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n from events
        where celebrant_id = ${mergeId} and chapter_id = ${chapterId}
      `),
    countOf(sql<{ n: number }>`
        select (
          (select count(*)::int from program_pieces pp
            join events e on e.id = pp.event_id
            where e.chapter_id = ${chapterId} and pp.speaker_person_id = ${mergeId})
          + (select count(*)::int from event_sessions es
            join events e on e.id = es.event_id
            where e.chapter_id = ${chapterId} and es.speaker_person_id = ${mergeId})
          + (select count(*)::int from event_slots sl
            join events e on e.id = sl.event_id
            where e.chapter_id = ${chapterId} and sl.person_id = ${mergeId})
        )::int as n
      `),
    countOf(sql<{ n: number }>`
        select count(*)::int as n from person_emails
        where person_id = ${mergeId} and chapter_id = ${chapterId}
      `),
    affiliationMoves(sql, chapterId, keepId, mergeId),
  ]);
  return {
    affiliations,
    counts: {
      participations,
      affiliations: affiliations.filter((row) => row.plan !== "drop").length,
      roles,
      tasks,
      touches,
      letters,
      registrations,
      attendees,
      celebrant,
      speakerSlots,
      otherEmails,
    },
  };
}

async function storeLeftoverEmails(
  sql: Sql,
  chapterId: string,
  keepId: string,
  actor: string,
  keep: Record<string, unknown>,
  other: Record<string, unknown>,
  chosenEmail: string | null,
  today: string,
) {
  if (chosenEmail) {
    await sql`
      delete from person_emails
      where person_id = ${keepId} and chapter_id = ${chapterId} and lower(email) = ${chosenEmail}
    `;
  }
  for (const address of leftoverEmails(keep, other, chosenEmail)) {
    await sql`
      insert into person_emails (id, chapter_id, person_id, email, label, created_by)
      values (${nid()}, ${chapterId}, ${keepId}, ${address}, ${`merged ${today}`}, ${actor})
      on conflict do nothing
    `;
  }
}

async function mergeRoles(sql: Sql, keepId: string, mergeId: string) {
  await sql`
    insert into person_roles (person_id, role_key)
    select ${keepId}, role_key from person_roles where person_id = ${mergeId}
    on conflict do nothing
  `;
  await sql`delete from person_roles where person_id = ${mergeId}`;
}

async function mergeRelationships(sql: Sql, keepId: string, mergeId: string) {
  await sql`
    insert into person_relationships (person_id, related_person_id, kind, created_at)
    select ${keepId}, related_person_id, kind, created_at
    from person_relationships
    where person_id = ${mergeId} and related_person_id <> ${keepId}
    on conflict do nothing
  `;
  await sql`
    insert into person_relationships (person_id, related_person_id, kind, created_at)
    select person_id, ${keepId}, kind, created_at
    from person_relationships
    where related_person_id = ${mergeId} and person_id <> ${keepId}
    on conflict do nothing
  `;
  await sql`
    delete from person_relationships
    where person_id = ${mergeId} or related_person_id = ${mergeId}
  `;
}

async function mergeAffiliations(
  sql: Sql,
  chapterId: string,
  keepId: string,
  mergeId: string,
  moves: AffiliationMove[],
  today: string,
) {
  for (const move of moves) {
    if (move.plan === "drop") {
      await sql`
        delete from affiliations
        where id = ${move.id} and person_id = ${mergeId} and chapter_id = ${chapterId}
      `;
    } else if (move.plan === "move_as_past") {
      await sql`
        update affiliations
        set person_id = ${keepId}, is_current = false, ended_on = coalesce(ended_on, ${today}::date)
        where id = ${move.id} and person_id = ${mergeId} and chapter_id = ${chapterId}
      `;
    } else {
      await sql`
        update affiliations
        set person_id = ${keepId}
        where id = ${move.id} and person_id = ${mergeId} and chapter_id = ${chapterId}
      `;
    }
  }
}

async function mergeParticipations(sql: Sql, chapterId: string, keepId: string, mergeId: string) {
  const [keepRows, otherRows] = await Promise.all([
    sql<Record<string, unknown>>`
      select * from participations
      where person_id = ${keepId} and chapter_id = ${chapterId} and party_type = 'person'
    `,
    sql<Record<string, unknown>>`
      select * from participations
      where person_id = ${mergeId} and chapter_id = ${chapterId} and party_type = 'person'
    `,
  ]);
  const keepByEvent = new Map<string, Record<string, unknown>>();
  for (const row of keepRows) keepByEvent.set(String(row.event_id), row);
  for (const other of otherRows) {
    const eventId = String(other.event_id);
    const keepRow = keepByEvent.get(eventId);
    if (!keepRow) {
      await sql`
        update participations set person_id = ${keepId}
        where id = ${String(other.id)} and person_id = ${mergeId} and chapter_id = ${chapterId}
      `;
      keepByEvent.set(eventId, { ...other, person_id: keepId });
      continue;
    }
    const merged = mergeParticipation(keepRow, other);
    await sql`
      update participations set
        guest_status = ${merged.guest_status},
        dietary_for_this_event = ${merged.dietary_for_this_event},
        publicity_status = ${merged.publicity_status},
        registration_attendee_id = ${merged.registration_attendee_id},
        notes = ${merged.notes},
        checked_in_at = ${merged.checked_in_at},
        party_size = ${merged.party_size},
        coming_to_mass = ${merged.coming_to_mass},
        coming_to_dinner = ${merged.coming_to_dinner},
        coming_to_lecture = ${merged.coming_to_lecture}
      where id = ${String(keepRow.id)} and person_id = ${keepId} and chapter_id = ${chapterId}
    `;
    await sql`
      update registration_attendees
      set participation_id = ${String(keepRow.id)}
      where participation_id = ${String(other.id)} and chapter_id = ${chapterId}
    `;
    await sql`
      delete from participations
      where id = ${String(other.id)} and person_id = ${mergeId}
        and chapter_id = ${chapterId} and party_type = 'person'
    `;
    keepByEvent.set(eventId, { ...keepRow, ...merged });
  }
}

async function repoint(sql: Sql, chapterId: string, keepId: string, mergeId: string) {
  await sql`
    update touches set person_id = ${keepId}
    where person_id = ${mergeId} and chapter_id = ${chapterId}
  `;
  await sql`
    update tasks set person_id = ${keepId}
    where person_id = ${mergeId} and chapter_id = ${chapterId}
  `;
  await sql`
    update event_slots
    set person_id = ${keepId}
    from events e
    where event_slots.event_id = e.id
      and e.chapter_id = ${chapterId}
      and event_slots.person_id = ${mergeId}
  `;
  await sql`
    update mail_messages
    set person_id = ${keepId}
    from mailings m
    where mail_messages.mailing_id = m.id
      and m.chapter_id = ${chapterId}
      and mail_messages.person_id = ${mergeId}
  `;
  await sql`
    update mailing_skips
    set person_id = ${keepId}
    from mailings m
    where mailing_skips.mailing_id = m.id
      and m.chapter_id = ${chapterId}
      and mailing_skips.person_id = ${mergeId}
  `;
  await sql`
    update mail_outbox set person_id = ${keepId}
    where person_id = ${mergeId} and chapter_id = ${chapterId}
  `;
  await sql`
    update registrations set purchaser_person_id = ${keepId}
    where purchaser_person_id = ${mergeId} and chapter_id = ${chapterId}
  `;
  await sql`
    update registration_attendees set person_id = ${keepId}
    where person_id = ${mergeId} and chapter_id = ${chapterId}
  `;
  await sql`
    update events set celebrant_id = ${keepId}
    where celebrant_id = ${mergeId} and chapter_id = ${chapterId}
  `;
  await sql`
    update program_pieces
    set speaker_person_id = ${keepId}
    from events e
    where program_pieces.event_id = e.id
      and e.chapter_id = ${chapterId}
      and program_pieces.speaker_person_id = ${mergeId}
  `;
  await sql`
    update event_sessions
    set speaker_person_id = ${keepId}
    from events e
    where event_sessions.event_id = e.id
      and e.chapter_id = ${chapterId}
      and event_sessions.speaker_person_id = ${mergeId}
  `;
}

function savedName(merged: MergedPerson) {
  const given = blankToNull(merged.given_name);
  const family = blankToNull(merged.family_name);
  const middleName = blankToNull(merged.middle_name);
  const middleInitial = blankToNull(merged.middle_initial);
  const suffix = blankToNull(merged.suffix);
  const postNominals = postNominalsText(merged.post_nominals) || null;
  const religiousTitle = blankToNull(merged.religious_title);
  const academicTitle = blankToNull(merged.academic_title);
  return {
    given,
    family,
    middleName,
    middleInitial,
    suffix,
    postNominals,
    religiousTitle,
    academicTitle,
    salutationOverride: blankToNull(merged.salutation_override),
    honorific: composedHonorific(religiousTitle, academicTitle),
    displayName: composePersonName({
      religiousTitle,
      academicTitle,
      givenName: given,
      middleName: middleName ?? middleInitial,
      familyName: family,
      suffix,
      postNominals,
    }),
  };
}

async function saveKeptPerson(
  sql: Sql,
  chapterId: string,
  keepId: string,
  keep: Record<string, unknown>,
  merged: MergedPerson,
) {
  const name = savedName(merged);
  const deceased =
    merged.deceased_on && /^\d{4}-\d{2}-\d{2}$/.test(merged.deceased_on)
      ? merged.deceased_on
      : null;
  const keptCreated =
    keep.created_at instanceof Date ? keep.created_at.toISOString() : show(keep.created_at);
  const createdAt = merged.created_at ?? (keptCreated || new Date().toISOString());
  try {
    const saved = await sql<{ id: string }>`
      update persons set
        display_name = ${name.displayName},
        given_name = ${name.given},
        family_name = ${name.family},
        middle_name = ${name.middleName},
        middle_initial = ${name.middleInitial},
        suffix = ${name.suffix},
        honorific = ${name.honorific},
        religious_title = ${name.religiousTitle},
        academic_title = ${name.academicTitle},
        post_nominals = ${name.postNominals},
        salutation_override = ${name.salutationOverride},
        email = ${lowerEmail(merged.email)},
        phone = ${blankToNull(merged.phone)},
        mobile = ${blankToNull(merged.mobile)},
        street = ${blankToNull(merged.street)},
        street2 = ${blankToNull(merged.street2)},
        city = ${blankToNull(merged.city)},
        state = ${blankToNull(merged.state)},
        postal_code = ${blankToNull(merged.postal_code)},
        country = ${blankToNull(merged.country)},
        website = ${blankToNull(merged.website)},
        dietary = ${blankToNull(merged.dietary)},
        status = ${blankToNull(merged.status) ?? "active"},
        deceased_on = ${deceased},
        notes = ${merged.notes},
        email_unsubscribed = ${merged.email_unsubscribed},
        email_bounce_count = ${merged.email_bounce_count},
        news_consent = ${merged.news_consent},
        news_consent_at = ${merged.news_consent_at},
        last_touch_at = ${merged.last_touch_at},
        created_at = ${createdAt}
      where id = ${keepId} and chapter_id = ${chapterId}
      returning id
    `;
    if (!saved[0]) throw new Error("Person not found.");
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Merged, but the name or email could not be saved: ${reason}. Edit the person to fix it.`,
    );
  }
}

export const getMergePreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      keepId: z.string().min(1),
      mergeId: z.string().min(1),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const { keep, other } = await loadPair(sql, member.chapterId, data.keepId, data.mergeId);
    const { counts } = await moveCounts(sql, member.chapterId, data.keepId, data.mergeId);
    return {
      keep: previewPerson(keep),
      other: previewPerson(other),
      differingFields: differingFields(keep, other),
      defaultPicks: defaultPicks(keep, other),
      counts,
      movesSafeEnvironment: safeEnvToCopy(readSafeEnvironment(keep), readSafeEnvironment(other)) !== null,
    };
  });

export const mergePeople = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(mergeInput.parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    if (data.confirm !== "MERGE") throw new Error("Type MERGE to confirm.");
    const sql = await getSql();
    const { keep, other } = await loadPair(sql, member.chapterId, data.keepId, data.mergeId);
    const today = todayIn(member.timezone);
    const { counts, affiliations } = await moveCounts(
      sql,
      member.chapterId,
      data.keepId,
      data.mergeId,
    );
    const merged = mergePersonFields(keep, other, data.picks, today);
    const fromOther = MERGE_FIELDS.map((field) => field.field).filter(
      (field) => data.picks[field] === "other",
    );

    await mergeRoles(sql, data.keepId, data.mergeId);
    await mergeRelationships(sql, data.keepId, data.mergeId);
    await mergeAffiliations(sql, member.chapterId, data.keepId, data.mergeId, affiliations, today);
    await mergeParticipations(sql, member.chapterId, data.keepId, data.mergeId);
    await repoint(sql, member.chapterId, data.keepId, data.mergeId);

    // The removed row is stored before the delete. Each statement stands alone.
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "person_merged",
      entity: "person",
      entityId: data.keepId,
      detail: {
        mergedId: data.mergeId,
        mergedName: show(other.display_name),
        keptName: show(keep.display_name),
        fromOther,
        moved: counts,
        removed: removedRow(other),
      },
    });
    // Move these before the person delete. The foreign key would otherwise remove them.
    await sql`
      update person_emails set person_id = ${data.keepId}
      where person_id = ${data.mergeId} and chapter_id = ${member.chapterId}
    `;
    const safeBlock = safeEnvToCopy(readSafeEnvironment(keep), readSafeEnvironment(other));
    if (safeBlock) {
      const copied = await sql<{ id: string }>`
        update persons set
          works_with_minors = ${safeBlock.works_with_minors},
          safe_env_program = ${safeBlock.safe_env_program},
          safe_env_trained_on = ${safeBlock.safe_env_trained_on},
          safe_env_diocese = ${safeBlock.safe_env_diocese},
          background_check_on = ${safeBlock.background_check_on},
          background_check_expires_on = ${safeBlock.background_check_expires_on},
          suitability_requested_on = ${safeBlock.suitability_requested_on},
          suitability_received_on = ${safeBlock.suitability_received_on},
          suitability_expires_on = ${safeBlock.suitability_expires_on}
        where id = ${data.keepId} and chapter_id = ${member.chapterId}
        returning id
      `;
      if (!copied[0]) throw new Error("Person not found.");
    }
    await sql`
      delete from persons where id = ${data.mergeId} and chapter_id = ${member.chapterId}
    `;
    await saveKeptPerson(sql, member.chapterId, data.keepId, keep, merged);
    await storeLeftoverEmails(
      sql,
      member.chapterId,
      data.keepId,
      member.userId,
      keep,
      other,
      lowerEmail(merged.email),
      today,
    );
    return { id: data.keepId };
  });
