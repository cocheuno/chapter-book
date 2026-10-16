import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAPTER_EXPORTS,
  chapterExportFilename,
  csvTable,
  exportSelect,
  zipStore,
} from "./chapter-export.ts";

const here = dirname(fileURLToPath(import.meta.url));

function selectedNames(sql: string): string[] {
  const from = sql.indexOf(" from ");
  assert.ok(from > "select ".length, sql);
  const body = sql.slice("select ".length, from);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(body.slice(start).trim());
  return parts.map((part) => {
    const asAt = part.lastIndexOf(" as ");
    return asAt === -1 ? part : part.slice(asAt + 4);
  });
}

type StoredEntry = {
  name: string;
  data: Uint8Array;
  crc: number;
  method: number;
  time: number;
  date: number;
};

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/** Read a stored zip written by `zipStore`. Sizes come from the local headers. */
function readStoredZip(bytes: Uint8Array): StoredEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: StoredEntry[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && readU32(view, offset) === 0x04034b50) {
    const method = readU16(view, offset + 8);
    const time = readU16(view, offset + 10);
    const date = readU16(view, offset + 12);
    const crc = readU32(view, offset + 14);
    const compressed = readU32(view, offset + 18);
    const uncompressed = readU32(view, offset + 22);
    const nameLength = readU16(view, offset + 26);
    const extraLength = readU16(view, offset + 28);
    const nameAt = offset + 30;
    const dataAt = nameAt + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.subarray(nameAt, nameAt + nameLength));
    const data = bytes.slice(dataAt, dataAt + uncompressed);
    assert.equal(compressed, uncompressed);
    entries.push({ name, data, crc, method, time, date });
    offset = dataAt + compressed;
  }
  assert.equal(readU32(view, offset), 0x02014b50);
  const end = bytes.length - 22;
  assert.equal(readU32(view, end), 0x06054b50);
  assert.equal(readU16(view, end + 8), entries.length);
  assert.equal(readU16(view, end + 10), entries.length);
  assert.equal(readU32(view, end + 16), offset);
  return entries;
}

describe("chapter export tables", () => {
  it("names the six files in the work-package order", () => {
    assert.deepEqual(
      CHAPTER_EXPORTS.map((spec) => spec.file),
      [
        "people.csv",
        "affiliations.csv",
        "partners.csv",
        "events.csv",
        "participations.csv",
        "touches.csv",
      ],
    );
    assert.equal(
      CHAPTER_EXPORTS.find((spec) => spec.file === "partners.csv")?.table,
      "organizations",
    );
  });

  it("selects every listed column for this chapter only, and formats dates in UTC", () => {
    for (const spec of CHAPTER_EXPORTS) {
      const sql = exportSelect(spec);
      assert.deepEqual(selectedNames(sql), [...spec.columns]);
      assert.equal(sql.endsWith(`from ${spec.table} where chapter_id = $1 order by id`), true);
      assert.equal(sql.includes("$2"), false);
      for (const column of spec.timestamps) {
        assert.match(sql, new RegExp(`to_char\\(${column} at time zone 'UTC'`));
      }
      for (const column of spec.dates) {
        assert.match(sql, new RegExp(`to_char\\(${column}, 'YYYY-MM-DD'\\) as ${column}`));
      }
    }
  });

  it("refuses a table name that is not a plain identifier", () => {
    const spec = CHAPTER_EXPORTS[0];
    assert.throws(
      () => exportSelect({ ...spec, table: "persons; drop table persons" }),
      /plain name/,
    );
  });
});

describe("csvTable", () => {
  it("quotes the header and neutralizes a formula cell", () => {
    const csv = csvTable(["email", "notes"], [{ email: "a@b.c", notes: "=1+1" }]);
    assert.equal(csv, '"email","notes"\n"a@b.c","\'=1+1"');
  });

  it("writes an empty cell for a missing value, and keeps false and zero", () => {
    assert.equal(csvTable(["flag", "n"], [{ flag: false, n: 0 }]), '"flag","n"\n"false","0"');
    assert.equal(csvTable(["email"], [{}]), '"email"\n""');
  });
});

describe("chapterExportFilename", () => {
  it("uses the calendar day", () => {
    assert.equal(chapterExportFilename("2026-10-16"), "chapter-export-2026-10-16.zip");
  });

  it("refuses a day that is not YYYY-MM-DD", () => {
    assert.throws(() => chapterExportFilename("today"), /calendar day/);
  });
});

describe("zipStore", () => {
  it("stores each file uncompressed, with the CRC of its bytes", () => {
    const payload = new TextEncoder().encode("123456789");
    const zip = zipStore(
      [{ name: "people.csv", data: payload }],
      new Date(Date.UTC(2026, 9, 16, 12, 0, 0)),
    );
    const [entry] = readStoredZip(zip);
    assert.equal(entry.name, "people.csv");
    assert.equal(entry.method, 0);
    assert.equal(entry.crc, 0xcbf43926);
    assert.deepEqual(entry.data, payload);
    assert.equal(entry.time, 12 << 11);
    assert.equal(entry.date, ((2026 - 1980) << 9) | (10 << 5) | 16);
  });

  it("keeps the six chapter files in order, including an empty one", () => {
    const files = CHAPTER_EXPORTS.map((spec, index) => ({
      name: spec.file,
      data: new TextEncoder().encode(
        index === 0 ? csvTable(["id"], [{ id: "p1" }]) : csvTable(["id"], []),
      ),
    }));
    const entries = readStoredZip(zipStore(files));
    assert.deepEqual(
      entries.map((entry) => entry.name),
      CHAPTER_EXPORTS.map((spec) => spec.file),
    );
    assert.equal(new TextDecoder().decode(entries[0].data).includes("p1"), true);
    assert.equal(new TextDecoder().decode(entries[1].data), '"id"');
  });

  it("refuses a path and a repeated name", () => {
    const data = new Uint8Array();
    assert.throws(() => zipStore([{ name: "../people.csv", data }]), /single file name/);
    assert.throws(
      () =>
        zipStore([
          { name: "people.csv", data },
          { name: "people.csv", data },
        ]),
      /already has/,
    );
  });
});

describe("export chapter wiring", () => {
  it("is admin-only, scoped by the export select, and audited as a full export", () => {
    const server = readFileSync(join(here, "chapter-backup.ts"), "utf8");
    const role = server.indexOf("assertAdmin(member.role)");
    const query = server.indexOf("exportSelect(spec)");
    const audit = server.indexOf('kind: "full"');
    assert.ok(role > 0 && query > role && audit > query);
    assert.equal(server.includes("recordAudit"), true);
    assert.equal(server.includes('action: "export"'), true);
    assert.equal(server.includes('entity: "chapter"'), true);
  });

  it("offers the download on the Chapter page", () => {
    const page = readFileSync(join(here, "../../routes/chapter/index.tsx"), "utf8");
    assert.equal(page.includes("exportChapter("), true);
    assert.equal(page.includes("Download export"), true);
    assert.equal(page.includes("Only an admin can export the chapter."), true);
  });
});
