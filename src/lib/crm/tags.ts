import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "./ids";
import { assertAdmin, assertEditor, loadMember } from "./member";

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "23505") {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|unique index|23505/i.test(msg);
}

const tagName = z.string().trim().min(1).max(100);

export const listTags = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    return sql<{ id: string; name: string }>`
      select id, name from tags
      where chapter_id = ${member.chapterId}
      order by lower(name), name
    `;
  });

export const addPersonTag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ personId: z.string().trim().min(1), name: tagName }).parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const person = await sql<{ id: string }>`
      select id from persons where id = ${data.personId} and chapter_id = ${member.chapterId}
    `;
    if (!person[0]) throw new Error("Person not found");
    const tag = await findOrCreateTag(sql, member.chapterId, data.name);
    await sql`
      insert into person_tags (person_id, tag_id)
      values (${data.personId}, ${tag.id})
      on conflict do nothing
    `;
    return tag;
  });

export const removePersonTag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ personId: z.string().trim().min(1), tagId: z.string().trim().min(1) }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    await sql`
      delete from person_tags pt
      using tags t, persons p
      where pt.tag_id = t.id
        and pt.person_id = p.id
        and pt.person_id = ${data.personId}
        and pt.tag_id = ${data.tagId}
        and t.chapter_id = ${member.chapterId}
        and p.chapter_id = ${member.chapterId}
    `;
    return { ok: true };
  });

export const tagPeople = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      tagId: z.string().trim().min(1),
      personIds: z.array(z.string().trim().min(1)).max(2000),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const tag = await sql<{ id: string }>`
      select id from tags where id = ${data.tagId} and chapter_id = ${member.chapterId}
    `;
    if (!tag[0]) throw new Error("Tag not found");
    if (data.personIds.length > 0) {
      await sql`
        insert into person_tags (person_id, tag_id)
        select p.id, t.id
        from persons p
        join tags t on t.id = ${data.tagId} and t.chapter_id = p.chapter_id
        where p.chapter_id = ${member.chapterId}
          and p.id = any(${data.personIds}::text[])
        on conflict do nothing
      `;
    }
    return { ok: true };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ tagId: z.string().trim().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertAdmin(member.role);
    const sql = await getSql();
    const removed = await sql<{ id: string }>`
      delete from tags where id = ${data.tagId} and chapter_id = ${member.chapterId} returning id
    `;
    if (!removed[0]) throw new Error("Tag not found");
    return { ok: true };
  });

async function findOrCreateTag(sql: Sql, chapterId: string, name: string): Promise<{ id: string; name: string }> {
  const existing = await sql<{ id: string; name: string }>`
    select id, name from tags where chapter_id = ${chapterId} and lower(name) = lower(${name})
  `;
  if (existing[0]) return existing[0];
  const id = nid();
  try {
    await sql`
      insert into tags (id, chapter_id, name) values (${id}, ${chapterId}, ${name})
    `;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  const rows = await sql<{ id: string; name: string }>`
    select id, name from tags where chapter_id = ${chapterId} and lower(name) = lower(${name})
  `;
  if (!rows[0]) throw new Error("Could not save that tag.");
  return rows[0];
}
