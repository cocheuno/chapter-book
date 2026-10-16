import { csvRow } from "./csv.ts";

/**
 * One CSV per leadership table, in table order. Partners are `organizations`.
 * Timestamps are UTC text. Dates are YYYY-MM-DD. These are the columns as of
 * migration 0026; a new column on one of these tables belongs in this list.
 */
export type ChapterExportTable = {
  file: string;
  table: string;
  columns: readonly string[];
  timestamps: readonly string[];
  dates: readonly string[];
};

export const CHAPTER_EXPORTS: readonly ChapterExportTable[] = [
  {
    file: "people.csv",
    table: "persons",
    columns: [
      "id",
      "chapter_id",
      "display_name",
      "given_name",
      "family_name",
      "honorific",
      "email",
      "phone",
      "city",
      "status",
      "dietary",
      "email_unsubscribed",
      "email_bounce_count",
      "last_touch_at",
      "notes",
      "source",
      "created_at",
      "created_by",
      "religious_title",
      "academic_title",
      "state",
      "country",
      "middle_initial",
      "suffix",
      "middle_name",
      "street",
      "postal_code",
      "mobile",
      "website",
      "street2",
      "post_nominals",
      "salutation_override",
      "deceased_on",
      "news_consent",
      "news_consent_at",
    ],
    timestamps: ["last_touch_at", "created_at", "news_consent_at"],
    dates: ["deceased_on"],
  },
  {
    file: "affiliations.csv",
    table: "affiliations",
    columns: [
      "id",
      "chapter_id",
      "person_id",
      "target_type",
      "organization_id",
      "role_key",
      "is_primary",
      "is_current",
      "started_on",
      "ended_on",
    ],
    timestamps: [],
    dates: ["started_on", "ended_on"],
  },
  {
    file: "partners.csv",
    table: "organizations",
    columns: [
      "id",
      "chapter_id",
      "name",
      "type_key",
      "parent_id",
      "city",
      "street",
      "main_phone",
      "main_email",
      "website",
      "is_venue",
      "is_invitation_partner",
      "status",
      "last_touch_at",
      "capacity_church",
      "capacity_hall",
      "typical_mass_times",
      "liturgical_notes",
      "parking_notes",
      "hall_notes",
      "bulletin_deadline",
      "chancery_city",
      "created_at",
      "state",
      "country",
      "preferred_door",
      "science_dept_notes",
      "can_bus_students",
      "academic_calendar_notes",
      "enrollment",
      "grades_served",
      "notes",
      "street2",
      "postal_code",
    ],
    timestamps: ["last_touch_at", "created_at"],
    dates: [],
  },
  {
    file: "events.csv",
    table: "events",
    columns: [
      "id",
      "chapter_id",
      "type_key",
      "title",
      "status",
      "starts_at",
      "ends_at",
      "timezone",
      "venue_organization_id",
      "venue_detail",
      "capacity",
      "summary",
      "internal_notes",
      "celebrant_id",
      "cloned_from_id",
      "created_at",
      "admission",
      "public_item_id",
    ],
    timestamps: ["starts_at", "ends_at", "created_at"],
    dates: [],
  },
  {
    file: "participations.csv",
    table: "participations",
    columns: [
      "id",
      "chapter_id",
      "event_id",
      "party_type",
      "person_id",
      "organization_id",
      "kind_key",
      "guest_status",
      "publicity_status",
      "party_size",
      "dietary_for_this_event",
      "source",
      "notes",
      "checked_in_at",
      "guest_name",
      "coming_to_mass",
      "coming_to_dinner",
      "coming_to_lecture",
      "registration_attendee_id",
    ],
    timestamps: ["checked_in_at"],
    dates: [],
  },
  {
    file: "touches.csv",
    table: "touches",
    columns: [
      "id",
      "chapter_id",
      "person_id",
      "organization_id",
      "kind",
      "happened_at",
      "summary",
      "event_id",
      "mailing_id",
      "author_id",
    ],
    timestamps: ["happened_at"],
    dates: [],
  },
];

const IDENT = /^[a-z][a-z0-9_]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function plainName(name: string, label: string): string {
  if (!IDENT.test(name)) throw new Error(`${label} is not a plain name.`);
  return name;
}

/** Parameterized select for one export file. The only bind is chapter id. */
export function exportSelect(spec: ChapterExportTable): string {
  const table = plainName(spec.table, "Export table");
  const timestamps = new Set(spec.timestamps);
  const dates = new Set(spec.dates);
  const columns = spec.columns.map((column) => {
    const name = plainName(column, "Export column");
    if (timestamps.has(name)) {
      return `to_char(${name} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ${name}`;
    }
    if (dates.has(name)) return `to_char(${name}, 'YYYY-MM-DD') as ${name}`;
    return name;
  });
  return `select ${columns.join(", ")} from ${table} where chapter_id = $1 order by id`;
}

/** Header plus one row per record. Every cell goes through `csvCell`. */
export function csvTable(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [csvRow([...columns])];
  for (const row of rows) lines.push(csvRow(columns.map((column) => row[column])));
  return lines.join("\n");
}

export function chapterExportFilename(day: string): string {
  if (!DAY.test(day)) throw new Error("Export date is not a calendar day.");
  return `chapter-export-${day}.zip`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosStamp(modified: Date): { time: number; date: number } {
  const year = modified.getUTCFullYear();
  if (year < 1980 || year > 2107) throw new Error("Zip date is out of range.");
  return {
    time:
      (modified.getUTCHours() << 11) |
      (modified.getUTCMinutes() << 5) |
      (modified.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((modified.getUTCMonth() + 1) << 5) | modified.getUTCDate(),
  };
}

function entryName(name: string): Uint8Array {
  if (name.length === 0 || name.length > 200)
    throw new Error("Zip entry name is empty or too long.");
  if (
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name === "." ||
    name === ".."
  ) {
    throw new Error("Zip entry name must be a single file name.");
  }
  const bytes = new TextEncoder().encode(name);
  if (bytes.length !== name.length) throw new Error("Zip entry name must be ASCII.");
  return bytes;
}

/**
 * A stored (uncompressed) zip. CSV text does not need a compression library,
 * and Explorer, macOS, and `tar` open this form.
 */
export function zipStore(
  entries: readonly { name: string; data: Uint8Array }[],
  modified = new Date(Date.UTC(1980, 0, 1)),
): Uint8Array {
  const stamp = dosStamp(modified);
  const seen = new Set<string>();
  const prepared = entries.map((entry) => {
    if (seen.has(entry.name)) throw new Error(`Zip already has ${entry.name}.`);
    seen.add(entry.name);
    if (entry.data.length > 0xffffffff) throw new Error("Zip entry is too large.");
    return { name: entryName(entry.name), data: entry.data, crc: crc32(entry.data) };
  });
  let size = 22;
  for (const entry of prepared)
    size += 30 + entry.name.length + entry.data.length + 46 + entry.name.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  const locals: number[] = [];

  function u16(value: number) {
    view.setUint16(offset, value, true);
    offset += 2;
  }
  function u32(value: number) {
    view.setUint32(offset, value, true);
    offset += 4;
  }

  for (const entry of prepared) {
    locals.push(offset);
    u32(ZIP_LOCAL);
    u16(20);
    u16(0);
    u16(0);
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0);
    out.set(entry.name, offset);
    offset += entry.name.length;
    out.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralAt = offset;
  prepared.forEach((entry, index) => {
    u32(ZIP_CENTRAL);
    u16(20);
    u16(20);
    u16(0);
    u16(0);
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(locals[index]);
    out.set(entry.name, offset);
    offset += entry.name.length;
  });
  const centralSize = offset - centralAt;
  u32(ZIP_END);
  u16(0);
  u16(0);
  u16(prepared.length);
  u16(prepared.length);
  u32(centralSize);
  u32(centralAt);
  u16(0);
  if (offset !== out.length) throw new Error("Zip size did not match its entries.");
  return out;
}
