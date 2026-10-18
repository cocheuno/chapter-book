import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXCLUDED_TABLES,
  EXPORT_PLAN,
  columnListQuery,
  csvFile,
  exportColumns,
  exportQuery,
  exportValue,
  readmeText,
} from "./export-plan.ts";

const EXPECTED: { file: string; table: string; scope: string }[] = [
  ["chapter.csv", "chapters", "self"],
  ["people.csv", "persons", "chapter"],
  ["person_emails.csv", "person_emails", "chapter"],
  ["person_roles.csv", "person_roles", "persons/person_id"],
  ["person_relationships.csv", "person_relationships", "persons/person_id"],
  ["tags.csv", "tags", "chapter"],
  ["person_tags.csv", "person_tags", "persons/person_id"],
  ["segments.csv", "segments", "chapter"],
  ["affiliations.csv", "affiliations", "chapter"],
  ["partners.csv", "organizations", "chapter"],
  ["events.csv", "events", "chapter"],
  ["event_slots.csv", "event_slots", "events/event_id"],
  ["event_sessions.csv", "event_sessions", "events/event_id"],
  ["event_speakers.csv", "event_speakers", "events/event_id"],
  ["program_pieces.csv", "program_pieces", "events/event_id"],
  ["event_links.csv", "event_links", "events/event_id_a"],
  ["participations.csv", "participations", "chapter"],
  ["touches.csv", "touches", "chapter"],
  ["tasks.csv", "tasks", "chapter"],
  ["lists.csv", "list_items", "chapter"],
  ["mail_templates.csv", "mail_templates", "chapter"],
  ["mailings.csv", "mailings", "chapter"],
  ["mail_messages.csv", "mail_messages", "mailings/mailing_id"],
  ["mailing_skips.csv", "mailing_skips", "mailings/mailing_id"],
  ["website_items.csv", "site_items", "chapter"],
  ["website_settings.csv", "site_settings", "chapter"],
  ["registration_pages.csv", "registration_pages", "chapter"],
  ["event_parts.csv", "event_parts", "chapter"],
  ["ticket_types.csv", "ticket_types", "chapter"],
  ["ticket_type_parts.csv", "ticket_type_parts", "ticket_types/ticket_type_id"],
  ["promo_codes.csv", "promo_codes", "chapter"],
  ["consent_texts.csv", "consent_texts", "chapter"],
  ["registrations.csv", "registrations", "chapter"],
  ["registration_attendees.csv", "registration_attendees", "chapter"],
  ["attendee_items.csv", "attendee_items", "registration_attendees/attendee_id"],
  ["payments.csv", "payments", "chapter"],
  ["activity.csv", "audit_log", "chapter"],
].map(([file, table, scope]) => ({ file, table, scope }));

function scopeKey(scope: (typeof EXPORT_PLAN)[number]["scope"]): string {
  if (scope === "chapter" || scope === "self") return scope;
  return `${scope.via}/${scope.fk}`;
}

describe("EXPORT_PLAN", () => {
  it("lists each spreadsheet once, outside the excluded tables", () => {
    assert.deepEqual(
      EXPORT_PLAN.map((entry) => ({
        file: entry.file,
        table: entry.table,
        scope: scopeKey(entry.scope),
      })),
      EXPECTED,
    );
    const files = EXPORT_PLAN.map((entry) => entry.file);
    assert.equal(new Set(files).size, files.length);
    for (const entry of EXPORT_PLAN) {
      assert.equal(entry.file.endsWith(".csv"), true);
      assert.equal(EXCLUDED_TABLES.includes(entry.table), false);
    }
  });
});

describe("exportColumns", () => {
  it("drops secret-shaped names and keeps the rest in order", () => {
    assert.deepEqual(
      exportColumns([
        "id",
        "token_hash",
        "display_name",
        "manage_token_hash",
        "email",
        "consent_token_hash",
        "notes",
        "password",
        "created_at",
      ]),
      ["id", "display_name", "email", "notes", "created_at"],
    );
  });
});

describe("exportValue", () => {
  it("renders each stored type as text", () => {
    assert.equal(exportValue(null), "");
    assert.equal(exportValue(undefined), "");
    assert.equal(exportValue(new Date("2020-01-02T03:04:05.000Z")), "2020-01-02T03:04:05.000Z");
    assert.equal(exportValue(true), "true");
    assert.equal(exportValue(false), "false");
    assert.equal(exportValue(new Uint8Array([1, 2, 3])), "");
    assert.equal(exportValue(Buffer.from("abc")), "");
    assert.equal(exportValue({ a: 1 }), '{"a":1}');
    assert.equal(exportValue([1, "b"]), '[1,"b"]');
    assert.equal(exportValue(12), "12");
    assert.equal(exportValue("Ada"), "Ada");
  });
});

describe("csvFile", () => {
  it("starts with a BOM, uses CRLF, and guards a formula", () => {
    const csv = csvFile(["name", "note"], [["Ada", "=1+1"]]);
    assert.equal(csv.startsWith("\uFEFF"), true);
    const body = csv.slice(1);
    assert.equal(body.endsWith("\r\n"), true);
    assert.equal(body.replaceAll("\r\n", "").includes("\n"), false);
    assert.equal(body.includes('"\'=1+1"'), true);
    assert.equal(csv.split("\r\n").filter((line) => line.length > 0).length, 2);
  });
});

describe("readmeText", () => {
  it("lists every file and the privacy line", () => {
    const text = readmeText({
      chapterName: "Wisconsin",
      exportedAtUtc: "2026-10-16T15:04:05.000Z",
      exportedAtLocal: "2026-10-16 10:04:05 CDT",
      files: EXPORT_PLAN.map((entry, index) => ({ file: entry.file, rows: index })),
    });
    for (const entry of EXPORT_PLAN) assert.equal(text.includes(entry.file), true);
    assert.equal(text.includes("Sign-in accounts and passwords"), true);
    assert.equal(text.includes("invite and reset links"), true);
    assert.equal(text.includes("attendees' private manage links"), true);
    assert.equal(text.includes("outgoing mail queue"), true);
    assert.equal(text.includes("uploaded pictures"), true);
    assert.equal(text.includes("guardian consents"), true);
    assert.equal(
      text.includes("Cells starting with = + - @ get a leading ' so spreadsheets don't run them."),
      true,
    );
    assert.equal(
      text.includes(
        "This file contains personal information. Keep it in the chapter's private storage. Do not email it.",
      ),
      true,
    );
  });
});

describe("export queries", () => {
  it("binds only the chapter id and quotes identifiers", () => {
    const people = EXPORT_PLAN.find((entry) => entry.file === "people.csv");
    const chapter = EXPORT_PLAN.find((entry) => entry.file === "chapter.csv");
    const roles = EXPORT_PLAN.find((entry) => entry.file === "person_roles.csv");
    const links = EXPORT_PLAN.find((entry) => entry.file === "event_links.csv");
    assert.ok(people && chapter && roles && links);
    assert.equal(
      exportQuery(people, ["id", "display_name"], true),
      'select t."id", t."display_name" from "persons" t where t."chapter_id" = $1 order by t."id"',
    );
    assert.equal(
      exportQuery(chapter, ["id", "name"], true),
      'select t."id", t."name" from "chapters" t where t."id" = $1 order by t."id"',
    );
    assert.equal(
      exportQuery(roles, ["person_id", "role_key"], false),
      'select t."person_id", t."role_key" from "person_roles" t where t."person_id" in (select p."id" from "persons" p where p."chapter_id" = $1) order by t."person_id", t."role_key"',
    );
    const linkSql = exportQuery(links, ["event_id_a", "event_id_b"], false);
    assert.equal(linkSql.includes('t."event_id_a" in (select p."id" from "events" p'), true);
    assert.equal(linkSql.includes("$2"), false);
    const registrations = EXPORT_PLAN.find((entry) => entry.file === "registrations.csv");
    assert.ok(registrations);
    const kept = exportColumns(["id", "manage_token_hash", "status", "chapter_id"]);
    const registrationSql = exportQuery(registrations, kept, true);
    assert.equal(registrationSql.includes("manage_token_hash"), false);
    assert.equal(registrationSql.includes("$2"), false);
    assert.equal(
      columnListQuery("persons"),
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'persons' order by ordinal_position",
    );
    assert.equal(columnListQuery("persons").includes("$"), false);
    assert.throws(() => columnListQuery("persons;drop"), /Invalid export name/);
    assert.throws(() => exportQuery(people, ["id;"], true), /Invalid export name/);
    assert.throws(() => exportQuery(people, [], true), /No columns to export/);
  });
});
