import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertEditor, loadMember } from "./member";
import { assigneeChoices } from "./task-assign-rules";

/** Enabled operators in this chapter. Any role may look. */
export const listAssignees = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    const rows = await sql<{ user_id: string; name: string | null; email: string | null }>`
      select m.user_id, u.name, u.email
      from chapter_members m
      join "user" u on u.id = m.user_id
      where m.chapter_id = ${member.chapterId} and m.disabled_at is null
    `;
    return assigneeChoices(rows.map((row) => ({ userId: row.user_id, name: row.name, email: row.email })));
  });

/** Editors assign an open task to an enabled member of this chapter, or clear it. No audit row. */
export const setTaskAssignee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      taskId: z.string().min(1),
      userId: z
        .string()
        .nullable()
        .transform((value) => {
          const trimmed = value?.trim() ?? "";
          return trimmed ? trimmed : null;
        }),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    if (data.userId) {
      const members = await sql<{ user_id: string }>`
        select user_id from chapter_members
        where user_id = ${data.userId} and chapter_id = ${member.chapterId} and disabled_at is null
      `;
      if (!members[0]) throw new Error("Choose someone in this chapter.");
    }
    await sql`
      update tasks set assignee_user_id = ${data.userId}
      where id = ${data.taskId} and chapter_id = ${member.chapterId}
    `;
    return { ok: true as const };
  });
