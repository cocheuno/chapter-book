/** Choosable person fields, in the order the merge table shows them. */
export const MERGE_FIELDS = [
  { field: "religious_title", label: "Religious title" },
  { field: "academic_title", label: "Academic title" },
  { field: "given_name", label: "Given name" },
  { field: "middle_name", label: "Middle name" },
  { field: "middle_initial", label: "Middle initial" },
  { field: "family_name", label: "Family name" },
  { field: "suffix", label: "Suffix" },
  { field: "post_nominals", label: "Post-nominals" },
  { field: "salutation_override", label: "Salutation" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "mobile", label: "Mobile" },
  { field: "street", label: "Street" },
  { field: "street2", label: "Street 2" },
  { field: "city", label: "City" },
  { field: "state", label: "State" },
  { field: "postal_code", label: "Postal code" },
  { field: "country", label: "Country" },
  { field: "website", label: "Website" },
  { field: "dietary", label: "Dietary" },
  { field: "status", label: "Status" },
  { field: "deceased_on", label: "Died on" },
] as const;

export type MergeFieldName = (typeof MERGE_FIELDS)[number]["field"];
export type PickSide = "keep" | "other";
export type FieldPicks = Partial<Record<MergeFieldName, PickSide>>;

const GUEST_STATUS_RANK = [
  "attended",
  "attending",
  "waitlisted",
  "declined",
  "no_show",
  "no_response",
] as const;

export type MergedPerson = Record<MergeFieldName, string | null> & {
  notes: string | null;
  email_unsubscribed: boolean;
  email_bounce_count: number;
  news_consent: "yes" | "no" | "unknown";
  news_consent_at: string | null;
  last_touch_at: string | null;
  created_at: string | null;
  source: string | null;
  created_by: string | null;
};

export type MergedParticipation = {
  guest_status: string | null;
  dietary_for_this_event: string | null;
  publicity_status: string | null;
  registration_attendee_id: string | null;
  notes: string | null;
  checked_in_at: string | null;
  party_size: number;
  coming_to_mass: boolean;
  coming_to_dinner: boolean;
  coming_to_lecture: boolean;
};

export type AffiliationPlan = "move" | "move_as_past" | "drop";

function fieldText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function textOrNull(value: unknown): string | null {
  const text = fieldText(value);
  return text || null;
}

/** Blank and null match. Email is compared lower-case. */
export function differingFields(
  keep: Record<string, unknown>,
  other: Record<string, unknown>,
): MergeFieldName[] {
  return MERGE_FIELDS.filter((field) => {
    const left = fieldText(keep[field.field]);
    const right = fieldText(other[field.field]);
    if (field.field === "email") return left.toLowerCase() !== right.toLowerCase();
    return left !== right;
  }).map((field) => field.field);
}

/**
 * Keep the kept record's value, unless it is blank and the other is not.
 * A deceased record wins both status and died-on. If both are deceased, keep wins.
 */
export function defaultPicks(
  keep: Record<string, unknown>,
  other: Record<string, unknown>,
): Record<MergeFieldName, PickSide> {
  const picks = {} as Record<MergeFieldName, PickSide>;
  for (const field of MERGE_FIELDS) {
    const keepText = fieldText(keep[field.field]);
    const otherText = fieldText(other[field.field]);
    picks[field.field] = !keepText && otherText ? "other" : "keep";
  }
  const keepDeceased = fieldText(keep.status) === "deceased";
  const otherDeceased = fieldText(other.status) === "deceased";
  if (keepDeceased || otherDeceased) {
    const side: PickSide = otherDeceased && !keepDeceased ? "other" : "keep";
    picks.status = side;
    picks.deceased_on = side;
  }
  return picks;
}

function stamp(value: unknown): { ms: number; text: string } | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) return null;
    return { ms, text: value.toISOString() };
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return null;
  return { ms, text };
}

function laterStamp(keep: unknown, other: unknown): string | null {
  const left = stamp(keep);
  const right = stamp(other);
  if (!left) return right?.text ?? null;
  if (!right) return left.text;
  return right.ms > left.ms ? right.text : left.text;
}

function earlierStamp(keep: unknown, other: unknown): string | null {
  const left = stamp(keep);
  const right = stamp(other);
  if (!left) return right?.text ?? null;
  if (!right) return left.text;
  return right.ms < left.ms ? right.text : left.text;
}

function asCount(value: unknown): number {
  const n =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * Append the other note as its own paragraph. A second pass does not append
 * again when that paragraph is already present, so a stopped merge can be repeated.
 */
function combineNotes(keep: unknown, other: unknown): string | null {
  const a = fieldText(keep);
  const b = fieldText(other);
  if (!b || a === b) return a || null;
  if (a.endsWith(`\n\n${b}`) || a.includes(`\n\n${b}\n`)) return a;
  return a ? `${a}\n\n${b}` : b;
}

function withOtherEmail(
  notes: string | null,
  otherEmail: unknown,
  chosenEmail: string | null,
  today: string,
): string | null {
  const email = fieldText(otherEmail);
  if (!email) return notes;
  if (email.toLowerCase() === fieldText(chosenEmail).toLowerCase()) return notes;
  const line = `Other email (merged ${today}): ${email}`;
  if (!notes) return line;
  if (notes === line || notes.endsWith(`\n${line}`)) return notes;
  return `${notes}\n${line}`;
}

function newsConsent(keep: unknown, other: unknown): "yes" | "no" | "unknown" {
  const values = [fieldText(keep).toLowerCase(), fieldText(other).toLowerCase()];
  if (values.includes("no")) return "no";
  if (values.includes("yes")) return "yes";
  return "unknown";
}

/** The kept record's new values. `today` is YYYY-MM-DD in the chapter's time zone. */
export function mergePersonFields(
  keep: Record<string, unknown>,
  other: Record<string, unknown>,
  picks: FieldPicks,
  today: string,
): MergedPerson {
  const fields = {} as Record<MergeFieldName, string | null>;
  for (const field of MERGE_FIELDS) {
    const raw = picks[field.field] === "other" ? other[field.field] : keep[field.field];
    fields[field.field] = textOrNull(raw);
  }
  const notes = withOtherEmail(
    combineNotes(keep.notes, other.notes),
    other.email,
    fields.email,
    today,
  );
  return {
    ...fields,
    notes,
    email_unsubscribed: keep.email_unsubscribed === true || other.email_unsubscribed === true,
    email_bounce_count: Math.max(
      asCount(keep.email_bounce_count),
      asCount(other.email_bounce_count),
    ),
    news_consent: newsConsent(keep.news_consent, other.news_consent),
    news_consent_at: laterStamp(keep.news_consent_at, other.news_consent_at),
    last_touch_at: laterStamp(keep.last_touch_at, other.last_touch_at),
    created_at: earlierStamp(keep.created_at, other.created_at),
    source: textOrNull(keep.source),
    created_by: textOrNull(keep.created_by),
  };
}

function guestRank(status: string): number {
  const index = GUEST_STATUS_RANK.indexOf(status as (typeof GUEST_STATUS_RANK)[number]);
  return index === -1 ? GUEST_STATUS_RANK.length : index;
}

function preferText(keep: unknown, other: unknown): string | null {
  return textOrNull(keep) ?? textOrNull(other);
}

/** Same gathering: the stronger guest status wins; blanks lose to every known status. */
export function mergeParticipation(
  keepRow: Record<string, unknown>,
  otherRow: Record<string, unknown>,
): MergedParticipation {
  const keepStatus = fieldText(keepRow.guest_status);
  const otherStatus = fieldText(otherRow.guest_status);
  const guest = guestRank(otherStatus) < guestRank(keepStatus) ? otherStatus : keepStatus;
  return {
    guest_status: guest || null,
    dietary_for_this_event: preferText(
      keepRow.dietary_for_this_event,
      otherRow.dietary_for_this_event,
    ),
    publicity_status: preferText(keepRow.publicity_status, otherRow.publicity_status),
    registration_attendee_id: preferText(
      keepRow.registration_attendee_id,
      otherRow.registration_attendee_id,
    ),
    notes: combineNotes(keepRow.notes, otherRow.notes),
    checked_in_at: earlierStamp(keepRow.checked_in_at, otherRow.checked_in_at),
    party_size: Math.max(asCount(keepRow.party_size), asCount(otherRow.party_size)),
    coming_to_mass: keepRow.coming_to_mass === true || otherRow.coming_to_mass === true,
    coming_to_dinner: keepRow.coming_to_dinner === true || otherRow.coming_to_dinner === true,
    coming_to_lecture: keepRow.coming_to_lecture === true || otherRow.coming_to_lecture === true,
  };
}

/**
 * A current office the kept person already holds is a duplicate.
 * A different current office at that organization is kept as past.
 */
export function affiliationPlan(
  otherAffiliation: { organizationId: string; roleKey: string; isCurrent: boolean },
  keepCurrentByOrg: Map<string, string[]>,
): AffiliationPlan {
  if (!otherAffiliation.isCurrent) return "move";
  const roles = keepCurrentByOrg.get(otherAffiliation.organizationId) ?? [];
  if (roles.length === 0) return "move";
  if (roles.includes(otherAffiliation.roleKey)) return "drop";
  return "move_as_past";
}
