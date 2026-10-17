import { csvRow } from "./csv.ts";

/** How a table is limited to the signed-in admin's chapter. The only bound parameter is $1. */
export type ExportScope = "chapter" | "self" | { via: string; fk: string };

export type ExportEntry = {
  file: string;
  table: string;
  scope: ExportScope;
};

/**
 * Spreadsheets in the full export, in file order.
 * "chapter" is t.chapter_id = $1. "self" is t.id = $1 (the chapters row).
 * { via, fk } is t.<fk> in (select p.id from <via> p where p.chapter_id = $1).
 */
export const EXPORT_PLAN: readonly ExportEntry[] = [
  { file: "chapter.csv", table: "chapters", scope: "self" },
  { file: "people.csv", table: "persons", scope: "chapter" },
  { file: "person_emails.csv", table: "person_emails", scope: "chapter" },
  { file: "person_roles.csv", table: "person_roles", scope: { via: "persons", fk: "person_id" } },
  {
    file: "person_relationships.csv",
    table: "person_relationships",
    scope: { via: "persons", fk: "person_id" },
  },
  { file: "affiliations.csv", table: "affiliations", scope: "chapter" },
  { file: "partners.csv", table: "organizations", scope: "chapter" },
  { file: "events.csv", table: "events", scope: "chapter" },
  { file: "event_slots.csv", table: "event_slots", scope: { via: "events", fk: "event_id" } },
  { file: "event_sessions.csv", table: "event_sessions", scope: { via: "events", fk: "event_id" } },
  { file: "event_speakers.csv", table: "event_speakers", scope: { via: "events", fk: "event_id" } },
  { file: "program_pieces.csv", table: "program_pieces", scope: { via: "events", fk: "event_id" } },
  { file: "event_links.csv", table: "event_links", scope: { via: "events", fk: "event_id_a" } },
  { file: "participations.csv", table: "participations", scope: "chapter" },
  { file: "touches.csv", table: "touches", scope: "chapter" },
  { file: "tasks.csv", table: "tasks", scope: "chapter" },
  { file: "lists.csv", table: "list_items", scope: "chapter" },
  { file: "mail_templates.csv", table: "mail_templates", scope: "chapter" },
  { file: "mailings.csv", table: "mailings", scope: "chapter" },
  {
    file: "mail_messages.csv",
    table: "mail_messages",
    scope: { via: "mailings", fk: "mailing_id" },
  },
  {
    file: "mailing_skips.csv",
    table: "mailing_skips",
    scope: { via: "mailings", fk: "mailing_id" },
  },
  { file: "website_items.csv", table: "site_items", scope: "chapter" },
  { file: "website_settings.csv", table: "site_settings", scope: "chapter" },
  { file: "registration_pages.csv", table: "registration_pages", scope: "chapter" },
  { file: "event_parts.csv", table: "event_parts", scope: "chapter" },
  { file: "ticket_types.csv", table: "ticket_types", scope: "chapter" },
  {
    file: "ticket_type_parts.csv",
    table: "ticket_type_parts",
    scope: { via: "ticket_types", fk: "ticket_type_id" },
  },
  { file: "promo_codes.csv", table: "promo_codes", scope: "chapter" },
  { file: "consent_texts.csv", table: "consent_texts", scope: "chapter" },
  { file: "registrations.csv", table: "registrations", scope: "chapter" },
  { file: "registration_attendees.csv", table: "registration_attendees", scope: "chapter" },
  {
    file: "attendee_items.csv",
    table: "attendee_items",
    scope: { via: "registration_attendees", fk: "attendee_id" },
  },
  { file: "payments.csv", table: "payments", scope: "chapter" },
  { file: "activity.csv", table: "audit_log", scope: "chapter" },
];

/** Tables that never go into the zip: sign-ins, secrets, the mail queue, pictures, consents. */
export const EXCLUDED_TABLES: readonly string[] = [
  "user",
  "account",
  "session",
  "verification",
  "_migrations",
  "chapter_members",
  "operator_invites",
  "operator_resets",
  "mail_outbox",
  "public_throttle",
  "stripe_events",
  "guardian_consents",
  "site_images",
];

const SECRET_COLUMN = /token|hash|secret|password/i;
const IDENT = /^[a-z_][a-z0-9_]*$/;

function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error("Invalid export name");
  return `"${name}"`;
}

/** Columns kept in a spreadsheet. Secret-shaped names are dropped; order stays. */
export function exportColumns(columns: string[]): string[] {
  return columns.filter((column) => !SECRET_COLUMN.test(column));
}

/** One cell's text before the formula guard in csvRow. */
export function exportValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Uint8Array) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** UTF-8 CSV with a BOM so Excel keeps accents, and CRLF between rows. */
export function csvFile(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [
    csvRow([...columns]),
    ...rows.map((row) => csvRow(row.map((value) => exportValue(value)))),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Plain-text note that sits beside the spreadsheets in the zip. */
export function readmeText(input: {
  chapterName: string;
  exportedAtUtc: string;
  exportedAtLocal: string;
  files: readonly { file: string; rows: number }[];
}): string {
  const fileLines = input.files.map((entry) => `${entry.file}: ${entry.rows} rows`);
  return [
    "Chapter Book export",
    `Chapter: ${input.chapterName}`,
    `Exported (UTC): ${input.exportedAtUtc}`,
    `Exported (chapter time): ${input.exportedAtLocal}`,
    "",
    "Files",
    ...fileLines,
    "",
    "Not included",
    "Sign-in accounts and passwords, invite and reset links, attendees' private manage links, the outgoing mail queue, uploaded pictures, and guardian consents.",
    "",
    "Cells starting with = + - @ get a leading ' so spreadsheets don't run them.",
    "",
    "This file contains personal information. Keep it in the chapter's private storage. Do not email it.",
    "",
  ].join("\n");
}

/** Column names for one plan table. The table name is a fixed identifier, not a bound parameter. */
export function columnListQuery(table: string): string {
  const name = quoteIdent(table).slice(1, -1);
  return (
    "select column_name from information_schema.columns " +
    `where table_schema = 'public' and table_name = '${name}' ` +
    "order by ordinal_position"
  );
}

/** One select of the kept columns, limited to the chapter id in $1. */
export function exportQuery(
  entry: ExportEntry,
  columns: readonly string[],
  hasId: boolean,
): string {
  if (columns.length === 0) throw new Error("No columns to export");
  const table = quoteIdent(entry.table);
  const listed = columns.map((column) => `t.${quoteIdent(column)}`).join(", ");
  let where: string;
  if (entry.scope === "chapter") {
    where = `t.${quoteIdent("chapter_id")} = $1`;
  } else if (entry.scope === "self") {
    where = `t.${quoteIdent("id")} = $1`;
  } else {
    const fk = quoteIdent(entry.scope.fk);
    const parent = quoteIdent(entry.scope.via);
    where =
      `t.${fk} in (select p.${quoteIdent("id")} from ${parent} p ` +
      `where p.${quoteIdent("chapter_id")} = $1)`;
  }
  const order = hasId
    ? `t.${quoteIdent("id")}`
    : columns.map((column) => `t.${quoteIdent(column)}`).join(", ");
  return `select ${listed} from ${table} t where ${where} order by ${order}`;
}
