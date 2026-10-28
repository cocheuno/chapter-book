import { personTitles, storedDietary, TITLES } from "./registration-details.ts";

/** Person columns a registration may fill or hold for review. Names stay out of this list. */
export const SYNC_FIELDS = [
  "religious_title",
  "academic_title",
  "city",
  "state",
  "phone",
  "dietary",
] as const;

export type SyncField = (typeof SYNC_FIELDS)[number];

/** Columns an editor may copy from a registration onto a person, names included. */
export const REVIEW_FIELDS = ["given_name", "family_name", ...SYNC_FIELDS] as const;

export type ReviewField = (typeof REVIEW_FIELDS)[number];

const FIELD_LABELS: Record<ReviewField, string> = {
  given_name: "Given name",
  family_name: "Family name",
  religious_title: "Religious title",
  academic_title: "Academic title",
  city: "City",
  state: "State",
  phone: "Phone",
  dietary: "Dietary",
};

export const CHANGES_TASK_PREFIX = "Web registration: check changes for ";

export function changesTaskTitle(displayName: string): string {
  return `${CHANGES_TASK_PREFIX}${displayName}`;
}

export type SyncStored = Partial<Record<SyncField, string | null | undefined>>;

export type SyncTyped = {
  title?: string | null;
  city?: string | null;
  state?: string | null;
  /** Purchaser only. Blank for an attendee. */
  phone?: string | null;
  dietaryTags?: readonly string[];
  dietaryText?: string | null;
};

export type SyncDiffer = { field: SyncField; stored: string; typed: string };

export type SyncPlan = {
  fill: Partial<Record<SyncField, string>>;
  differ: SyncDiffer[];
};

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function canonicalTitle(value: string | null | undefined): string {
  const text = trimmed(value);
  if (!text) return "";
  const match = TITLES.find((title) => title.toLowerCase() === text.toLowerCase());
  return match ?? text;
}

/** Blank stored fields to write, and conflicts to hold. Comparison ignores case and surrounding space. */
export function syncPlan(stored: SyncStored, typed: SyncTyped): SyncPlan {
  const titles = personTitles(canonicalTitle(typed.title));
  const dietary = storedDietary(typed.dietaryTags ?? [], typed.dietaryText);
  const typedValues = new Map<SyncField, string>();
  typedValues.set("city", trimmed(typed.city));
  typedValues.set("state", trimmed(typed.state));
  typedValues.set("phone", trimmed(typed.phone));
  typedValues.set("dietary", trimmed(dietary));
  if (titles.religiousTitle) typedValues.set("religious_title", titles.religiousTitle);
  if (titles.academicTitle) typedValues.set("academic_title", titles.academicTitle);

  const fill: Partial<Record<SyncField, string>> = {};
  const differ: SyncDiffer[] = [];
  for (const field of SYNC_FIELDS) {
    if (!typedValues.has(field)) continue;
    const typedText = typedValues.get(field) ?? "";
    const storedText = trimmed(stored[field]);
    if (!typedText) continue;
    if (!storedText) fill[field] = typedText;
    else if (storedText.toLowerCase() !== typedText.toLowerCase()) {
      differ.push({ field, stored: storedText, typed: typedText });
    }
  }
  return { fill, differ };
}

type ReviewEntry = { book: string | null; typed: string };

/**
 * Name differences from reviewChanges, plus field conflicts.
 * Dietary comes only from the sync plan, so a blank dietary is filled rather than reviewed.
 */
export function reviewRecord(
  nameReview: Readonly<Record<string, { book?: string | null; typed?: string | null }>> | null,
  differ: readonly { field: string; stored: string; typed: string }[],
): Record<string, ReviewEntry> | null {
  const changes: Record<string, ReviewEntry> = {};
  for (const field of ["given_name", "family_name"] as const) {
    const entry = nameReview?.[field];
    const typedText = trimmed(entry?.typed);
    if (!typedText) continue;
    const book = trimmed(entry?.book);
    changes[field] = { book: book || null, typed: typedText };
  }
  for (const row of differ) {
    if (!SYNC_FIELDS.includes(row.field as SyncField)) continue;
    const typedText = trimmed(row.typed);
    if (!typedText) continue;
    const book = trimmed(row.stored);
    changes[row.field] = { book: book || null, typed: typedText };
  }
  return Object.keys(changes).length ? changes : null;
}

export type ReviewLine = {
  field: ReviewField;
  label: string;
  stored: string;
  typed: string;
};

export function reviewLineText(line: Pick<ReviewLine, "label" | "stored" | "typed">): string {
  return `${line.label}: ${line.stored} → ${line.typed}`;
}

function readReview(value: unknown): Partial<Record<ReviewField, { stored: string; typed: string }>> {
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const entries: Partial<Record<ReviewField, { stored: string; typed: string }>> = {};
  for (const field of REVIEW_FIELDS) {
    const item = source[field];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as { book?: unknown; stored?: unknown; typed?: unknown };
    const typedText = typeof row.typed === "string" ? row.typed.trim() : "";
    if (!typedText) continue;
    const storedSource = row.stored ?? row.book;
    const storedText = storedSource == null ? "" : String(storedSource).trim();
    entries[field] = { stored: storedText, typed: typedText };
  }
  return entries;
}

/** One line per pending field, in review order. */
export function reviewLines(value: unknown): ReviewLine[] {
  const entries = readReview(value);
  return REVIEW_FIELDS.filter((field) => entries[field]).map((field) => {
    const entry = entries[field]!;
    return {
      field,
      label: FIELD_LABELS[field],
      stored: entry.stored,
      typed: entry.typed,
    };
  });
}

/** Values an editor apply may write. Unknown keys and blank typed values are dropped. */
export function reviewUpdates(value: unknown): { field: ReviewField; typed: string }[] {
  const entries = readReview(value);
  return REVIEW_FIELDS.filter((field) => entries[field]).map((field) => ({
    field,
    typed: entries[field]!.typed,
  }));
}

export function canApplyRegistrationChanges(role: string): boolean {
  return role === "admin" || role === "editor";
}

export function canDismissRegistrationChanges(role: string): boolean {
  return canApplyRegistrationChanges(role);
}

/** Viewers learn that a review is waiting. They do not receive the typed values. */
export function reviewForDesk(role: string, value: unknown): { lines: ReviewLine[]; waiting: boolean } {
  const lines = reviewLines(value);
  if (!lines.length) return { lines: [], waiting: false };
  if (!canApplyRegistrationChanges(role)) return { lines: [], waiting: true };
  return { lines, waiting: false };
}
