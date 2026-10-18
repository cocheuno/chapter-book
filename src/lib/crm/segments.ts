import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { nid } from "./ids";
import { assertEditor, loadMember } from "./member";
import { listedName } from "./names";
import { parseSegmentFilter, segmentWhere } from "./segment-rules";

const NAME_TAKEN = "A saved list with that name exists.";

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "23505") {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|unique index|23505/i.test(msg);
}

const saveInput = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  filter: z.unknown(),
});

type PreviewRow = {
  id: string;
  display_name: string;
  email: string | null;
  given_name: string | null;
  family_name: string | null;
  middle_name: string | null;
  suffix: string | null;
  honorific: string | null;
  religious_title: string | null;
  academic_title: string | null;
  post_nominals: string | null;
};

export const listSegments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; name: string; filter: unknown }>`
      select id, name, filter from segments
      where chapter_id = ${member.chapterId}
      order by lower(name), name
    `;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      filter: parseSegmentFilter(row.filter),
    }));
  });

export const previewSegment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ filter: z.unknown() }).parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    const filter = parseSegmentFilter(data.filter);
    const where = segmentWhere(filter, 1);
    const params = [member.chapterId, ...where.params];
    const counted = await sql.query<{ count: number }>(
      `select count(*)::int as count from persons p ${where.sql}`,
      params,
    );
    const rows = await sql.query<PreviewRow>(
      `select p.id, p.display_name, p.email, p.given_name, p.family_name,
              coalesce(p.middle_name, p.middle_initial) as middle_name, p.suffix,
              p.honorific, p.religious_title, p.academic_title, p.post_nominals
       from persons p
       ${where.sql}
       order by coalesce(p.family_name, p.display_name), p.given_name, p.display_name
       limit 200`,
      params,
    );
    return {
      count: Number(counted[0]?.count ?? 0),
      people: rows.map((row) => ({
        id: row.id,
        display_name: listedName(row) || row.display_name,
        email: row.email,
      })),
    };
  });

export const saveSegment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveInput.parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const filter = parseSegmentFilter(data.filter);
    const name = data.name.trim();
    if (await nameTaken(sql, member.chapterId, name, data.id)) {
      throw new Error(NAME_TAKEN);
    }
    const stored = JSON.stringify(filter);
    let id = data.id;
    if (id) {
      let saved: { id: string }[];
      try {
        saved = await sql<{ id: string }>`
          update segments
          set name = ${name}, filter = ${stored}::jsonb, updated_at = now()
          where id = ${id} and chapter_id = ${member.chapterId}
          returning id
        `;
      } catch (err) {
        if (isUniqueViolation(err)) throw new Error(NAME_TAKEN);
        throw err;
      }
      if (!saved[0]) throw new Error("Saved list not found.");
    } else {
      id = nid();
      try {
        await sql`
          insert into segments (id, chapter_id, name, filter, created_by)
          values (${id}, ${member.chapterId}, ${name}, ${stored}::jsonb, ${member.userId})
        `;
      } catch (err) {
        if (isUniqueViolation(err)) throw new Error(NAME_TAKEN);
        throw err;
      }
    }
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "segment_saved",
      entity: "segment",
      entityId: id,
      detail: { name },
    });
    return { id };
  });

export const deleteSegment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().trim().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const removed = await sql<{ name: string }>`
      delete from segments
      where id = ${data.id} and chapter_id = ${member.chapterId}
      returning name
    `;
    if (!removed[0]) throw new Error("Saved list not found.");
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "segment_deleted",
      entity: "segment",
      entityId: data.id,
      detail: { name: removed[0].name },
    });
    return { ok: true };
  });

async function nameTaken(sql: Sql, chapterId: string, name: string, exceptId?: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    select id from segments
    where chapter_id = ${chapterId}
      and lower(name) = lower(${name})
      and (${exceptId ?? null}::text is null or id <> ${exceptId ?? ""})
  `;
  return Boolean(rows[0]);
}
