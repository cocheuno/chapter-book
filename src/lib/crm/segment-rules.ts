import { z } from "zod";

const text = z.string().trim().max(100);
const list = z.array(text).max(50).default([]);

const filterSchema = z.object({
  roles: list,
  tagIds: list,
  partnerTypes: list,
  city: text.default(""),
  state: text.default(""),
  attendedEventId: text.default(""),
  excludeUnsubscribed: z.boolean().default(true),
  excludeDoNotContact: z.boolean().default(true),
  excludeDeceased: z.boolean().default(true),
});

export type SegmentFilter = z.infer<typeof filterSchema>;

function filled(values: string[]): string[] {
  return values.filter((value) => value.length > 0);
}

/** Defaults: empty lists and strings, and the three excludes on. */
export function parseSegmentFilter(input: unknown): SegmentFilter {
  let value = input;
  if (typeof value === "string") value = JSON.parse(value);
  const parsed = filterSchema.parse(value ?? {});
  return {
    ...parsed,
    roles: filled(parsed.roles),
    tagIds: filled(parsed.tagIds),
    partnerTypes: filled(parsed.partnerTypes),
  };
}

function slot(n: number): string {
  return "$" + String(n);
}

function chapterSlot(chapterParam: number): number {
  if (Number.isInteger(chapterParam) && chapterParam >= 1 && chapterParam < 100) return chapterParam;
  return 1;
}

/**
 * WHERE over persons p. Only fixed fragments are concatenated.
 * $chapterParam is the chapter id, supplied by the caller. Later placeholders
 * are the values in params, in order.
 * Attendance matches countsAsAttended: guest_status attended, or a check-in time.
 */
export function segmentWhere(
  filter: SegmentFilter,
  chapterParam = 1,
): { sql: string; params: unknown[] } {
  const chapter = chapterSlot(chapterParam);
  const params: unknown[] = [];
  let next = chapter + 1;
  const parts = ["p.chapter_id = " + slot(chapter)];

  if (filter.roles.length > 0) {
    params.push(filter.roles);
    parts.push(
      "exists (select 1 from person_roles r where r.person_id = p.id and r.role_key = any(" +
        slot(next) +
        "::text[]))",
    );
    next += 1;
  }
  if (filter.tagIds.length > 0) {
    params.push(filter.tagIds);
    parts.push(
      "exists (select 1 from person_tags pt " +
        "join tags tg on tg.id = pt.tag_id and tg.chapter_id = p.chapter_id " +
        "where pt.person_id = p.id and pt.tag_id = any(" +
        slot(next) +
        "::text[]))",
    );
    next += 1;
  }
  if (filter.partnerTypes.length > 0) {
    params.push(filter.partnerTypes);
    parts.push(
      "exists (select 1 from affiliations a " +
        "join organizations o on o.id = a.organization_id and o.chapter_id = a.chapter_id " +
        "where a.person_id = p.id and a.chapter_id = p.chapter_id and o.type_key = any(" +
        slot(next) +
        "::text[]))",
    );
    next += 1;
  }
  if (filter.city) {
    params.push(filter.city);
    parts.push("lower(p.city) = lower(" + slot(next) + ")");
    next += 1;
  }
  if (filter.state) {
    params.push(filter.state);
    parts.push("lower(p.state) = lower(" + slot(next) + ")");
    next += 1;
  }
  if (filter.attendedEventId) {
    params.push(filter.attendedEventId);
    parts.push(
      "exists (select 1 from participations part " +
        "join events e on e.id = part.event_id and e.chapter_id = part.chapter_id " +
        "where part.person_id = p.id and part.chapter_id = p.chapter_id " +
        "and part.event_id = " +
        slot(next) +
        " and part.party_type = 'person' " +
        "and (part.guest_status = 'attended' or part.checked_in_at is not null))",
    );
    next += 1;
  }
  if (filter.excludeUnsubscribed) parts.push("p.email_unsubscribed = false");
  if (filter.excludeDoNotContact) parts.push("p.status <> 'do_not_contact'");
  if (filter.excludeDeceased) parts.push("p.status <> 'deceased'");

  return { sql: "where " + parts.join(" and "), params };
}
