import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import {
  CHAPTER_EXPORTS,
  bytesToBase64,
  chapterExportFilename,
  csvTable,
  exportSelect,
  zipStore,
} from "./chapter-export";
import { todayIn } from "./dates";
import { assertAdmin, loadMember } from "./member";

/** Admin download of this chapter's leadership tables. One audit row, no other writes. */
export const exportChapter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const member = await loadMember(context.userId);
    assertAdmin(member.role);
    const sql = await getSql();
    const encoder = new TextEncoder();
    const files: { name: string; data: Uint8Array }[] = [];
    let rows = 0;
    for (const spec of CHAPTER_EXPORTS) {
      const tableRows = await sql.query<Record<string, unknown>>(exportSelect(spec), [
        member.chapterId,
      ]);
      rows += tableRows.length;
      files.push({ name: spec.file, data: encoder.encode(csvTable(spec.columns, tableRows)) });
    }
    const filename = chapterExportFilename(todayIn(member.timezone));
    const base64 = bytesToBase64(zipStore(files));
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "export",
      entity: "chapter",
      entityId: member.chapterId,
      detail: { kind: "full", rows },
    });
    return { filename, base64, rows };
  });
