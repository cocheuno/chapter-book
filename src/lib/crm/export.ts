import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { todayIn } from "./dates";
import {
  EXPORT_PLAN,
  columnListQuery,
  csvFile,
  exportColumns,
  exportQuery,
  readmeText,
  type ExportEntry,
} from "./export-plan";
import { assertAdmin, loadMember } from "./member";

type Sql = Awaited<ReturnType<typeof getSql>>;

function chapterLocal(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = pick("hour") === "24" ? "00" : pick("hour");
  const zone = pick("timeZoneName");
  const stamp = `${pick("year")}-${pick("month")}-${pick("day")} ${hour}:${pick("minute")}:${pick("second")}`;
  return zone ? `${stamp} ${zone}` : stamp;
}

async function readTable(sql: Sql, entry: ExportEntry, chapterId: string) {
  const listed = await sql.query<{ column_name: string }>(columnListQuery(entry.table));
  if (listed.length === 0) throw new Error(`Export table not found: ${entry.table}`);
  const names = listed.map((row) => row.column_name);
  const columns = exportColumns(names);
  if (columns.length === 0) throw new Error(`Export table has no columns: ${entry.table}`);
  const tableRows = await sql.query<Record<string, unknown>>(
    exportQuery(entry, columns, names.includes("id")),
    [chapterId],
  );
  return {
    file: entry.file,
    csv: csvFile(
      columns,
      tableRows.map((row) => columns.map((column) => row[column])),
    ),
    rows: tableRows.length,
  };
}

/** Admin download of this chapter's tables. The only write is one audit row. */
export const exportEverything = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const member = await loadMember(context.userId);
    assertAdmin(member.role);
    const sql = await getSql();
    const now = new Date();
    const built = [];
    for (const entry of EXPORT_PLAN) {
      built.push(await readTable(sql, entry, member.chapterId));
    }
    const files = built.map((entry) => ({ file: entry.file, csv: entry.csv }));
    const rows = built.reduce((sum, entry) => sum + entry.rows, 0);
    const exportedOn = todayIn(member.timezone, now);
    const readme = readmeText({
      chapterName: member.chapterName,
      exportedAtUtc: now.toISOString(),
      exportedAtLocal: chapterLocal(member.timezone, now),
      files: built.map((entry) => ({ file: entry.file, rows: entry.rows })),
    });
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "export",
      entity: "chapter",
      entityId: member.chapterId,
      detail: { kind: "full", files: files.length, rows },
    });
    return { files, readme, exportedOn };
  });
