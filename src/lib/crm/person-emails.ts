import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, withTransaction, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { nid } from "./ids";
import { assertEditor, loadMember } from "./member";

export type EmailHit = { id: string; display_name: string; via: "main" | "other" };

function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "23505") {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|unique index|23505/i.test(msg);
}

/** The person who already has this address, as a main email or another email. */
export async function findPersonByEmail(
  sql: Sql,
  chapterId: string,
  email: string | null | undefined,
): Promise<EmailHit | null> {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  const rows = await sql<{ id: string; display_name: string; via: string }>`
    select id, display_name, via from (
      select id, display_name, 'main'::text as via, 0 as rank
      from persons
      where chapter_id = ${chapterId} and forgotten_at is null and lower(email) = ${normalized}
      union all
      select p.id, p.display_name, 'other'::text as via, 1 as rank
      from person_emails e
      join persons p on p.id = e.person_id and p.chapter_id = e.chapter_id
      where e.chapter_id = ${chapterId} and p.forgotten_at is null and lower(e.email) = ${normalized}
    ) matches
    order by rank
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    display_name: row.display_name,
    via: row.via === "other" ? "other" : "main",
  };
}

/** Set when the address belongs to a different person in this chapter. */
export async function emailOwnerError(
  sql: Sql,
  chapterId: string,
  email: string | null | undefined,
  personId: string,
): Promise<string | null> {
  const owner = await findPersonByEmail(sql, chapterId, email);
  if (!owner || owner.id === personId) return null;
  return `That email already belongs to ${owner.display_name}.`;
}

async function alreadyBelongs(sql: Sql, chapterId: string, email: string): Promise<string> {
  const owner = await findPersonByEmail(sql, chapterId, email);
  if (owner) return `That email already belongs to ${owner.display_name}.`;
  return "That email already belongs to someone.";
}

const addInput = z.object({
  personId: z.string().min(1),
  email: z.string().trim().email().max(200),
  label: z.string().trim().max(40).optional(),
});

const emailIdInput = z.object({
  personId: z.string().min(1),
  emailId: z.string().min(1),
});

export const listPersonEmails = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((personId: string) => z.string().min(1).parse(personId))
  .handler(async ({ context, data: personId }) => {
    const member = await loadMember(context.userId);
    const sql = await getSql();
    const person = await sql<{ id: string }>`
      select id from persons where id = ${personId} and chapter_id = ${member.chapterId}
    `;
    if (!person[0]) throw new Error("Person not found");
    return sql<{ id: string; email: string; label: string | null }>`
      select id, email, label from person_emails
      where person_id = ${personId} and chapter_id = ${member.chapterId}
      order by created_at
    `;
  });

export const addPersonEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(addInput.parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    const label = data.label?.trim() ? data.label.trim() : null;
    const person = await sql<{ id: string; email: string | null }>`
      select id, email from persons where id = ${data.personId} and chapter_id = ${member.chapterId}
    `;
    if (!person[0]) throw new Error("Person not found");
    if ((person[0].email ?? "").trim().toLowerCase() === email) {
      throw new Error("That is already the main email.");
    }
    const owned = await emailOwnerError(sql, member.chapterId, email, data.personId);
    if (owned) throw new Error(owned);
    try {
      await sql`
        insert into person_emails (id, chapter_id, person_id, email, label, created_by)
        values (${nid()}, ${member.chapterId}, ${data.personId}, ${email}, ${label}, ${member.userId})
      `;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw new Error(await alreadyBelongs(sql, member.chapterId, email));
    }
    await recordAudit(sql, {
      chapterId: member.chapterId,
      actor: member.userId,
      action: "email_added",
      entity: "person",
      entityId: data.personId,
      detail: { email, label },
    });
    return { ok: true };
  });

export const removePersonEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(emailIdInput.parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    const sql = await getSql();
    const removed = await sql<{ email: string }>`
      delete from person_emails
      where id = ${data.emailId} and person_id = ${data.personId} and chapter_id = ${member.chapterId}
      returning email
    `;
    if (removed[0]) {
      await recordAudit(sql, {
        chapterId: member.chapterId,
        actor: member.userId,
        action: "email_removed",
        entity: "person",
        entityId: data.personId,
        detail: { email: removed[0].email },
      });
    }
    return { ok: true };
  });

export const makeMainEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(emailIdInput.parse)
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertEditor(member.role);
    let next = "";
    try {
      return await withTransaction(async (tx) => {
        const rows = await tx<{ email: string; main_email: string | null }>`
          select e.email, p.email as main_email
          from person_emails e
          join persons p on p.id = e.person_id and p.chapter_id = e.chapter_id
          where e.id = ${data.emailId} and e.person_id = ${data.personId} and e.chapter_id = ${member.chapterId}
        `;
        const row = rows[0];
        if (!row) throw new Error("That email is no longer on this person.");
        next = row.email.trim().toLowerCase();
        const previous = row.main_email?.trim().toLowerCase() || null;
        const owned = await emailOwnerError(tx, member.chapterId, next, data.personId);
        if (owned) throw new Error(owned);
        await tx`
          delete from person_emails
          where id = ${data.emailId} and person_id = ${data.personId} and chapter_id = ${member.chapterId}
        `;
        const saved = await tx<{ id: string }>`
          update persons set email = ${next}
          where id = ${data.personId} and chapter_id = ${member.chapterId}
          returning id
        `;
        if (!saved[0]) throw new Error("Person not found");
        // The log sits between the main-address change and storing the old address again.
        await recordAudit(tx, {
          chapterId: member.chapterId,
          actor: member.userId,
          action: "email_made_main",
          entity: "person",
          entityId: data.personId,
          detail: { from: previous ?? "", to: next },
        });
        if (previous && previous !== next) {
          await tx`
            insert into person_emails (id, chapter_id, person_id, email, label, created_by)
            values (
              ${nid()}, ${member.chapterId}, ${data.personId}, ${previous}, ${"previous main"}, ${member.userId}
            )
            on conflict do nothing
          `;
        }
        return { ok: true };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const sql = await getSql();
      throw new Error(await alreadyBelongs(sql, member.chapterId, next));
    }
  });
