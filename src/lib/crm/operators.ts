import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "./ids";
import { assertAdmin, loadMember } from "./member";
import {
  INVITE_DAYS,
  disableBlockedReason,
  hashInviteToken,
  newInviteToken,
  normalizeOperatorEmail,
  roleChangeBlockedReason,
  type OperatorRole,
} from "./operator-rules";

async function enabledAdminCount(
  sql: Awaited<ReturnType<typeof getSql>>,
  chapterId: string,
): Promise<number> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from chapter_members
    where chapter_id = ${chapterId} and role = 'admin' and disabled_at is null
  `;
  return rows[0]?.n ?? 0;
}

/** Empty book: the first sign-up may open it as founder admin. */
export const getLoginState = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sql = await getSql();
    const n = await sql<{ n: number }>`select count(*)::int as n from chapters`;
    return { founder: (n[0]?.n ?? 0) === 0 };
  } catch {
    return { founder: false };
  }
});

/** Public peek of an invite link — email and role only. */
export const peekInvite = createServerFn({ method: "GET" })
  .validator((token: string) => token.trim())
  .handler(async ({ data: token }) => {
    if (!token) return { ok: false as const, reason: "missing" };
    const sql = await getSql();
    const rows = await sql<{ email: string; role: OperatorRole; expires_at: string; accepted_at: string | null }>`
      select email, role, expires_at, accepted_at
      from operator_invites
      where token_hash = ${hashInviteToken(token)}
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, reason: "unknown" };
    if (row.accepted_at) return { ok: false as const, reason: "used" };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const, reason: "expired" };
    return { ok: true as const, email: row.email, role: row.role };
  });

export const listOperators = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await loadMember(context.userId);
    const sql = await getSql();
    const members = await sql<{
      user_id: string;
      role: OperatorRole;
      disabled_at: string | null;
      created_at: string;
      email: string | null;
      name: string | null;
    }>`
      select m.user_id, m.role, m.disabled_at, m.created_at, u.email, u.name
      from chapter_members m
      left join "user" u on u.id = m.user_id
      where m.chapter_id = ${m.chapterId}
      order by m.role, u.email
    `;
    const invites = await sql<{
      id: string;
      email: string;
      role: OperatorRole;
      expires_at: string;
      created_at: string;
    }>`
      select id, email, role, expires_at, created_at
      from operator_invites
      where chapter_id = ${m.chapterId} and accepted_at is null and expires_at > now()
      order by created_at desc
    `;
    const unassigned =
      m.role === "admin"
        ? await sql<{ id: string; email: string; name: string }>`
            select u.id, u.email, u.name
            from "user" u
            where not exists (
              select 1 from chapter_members c where c.user_id = u.id
            )
            order by u.email
          `
        : [];
    return { members, invites, unassigned, selfId: m.userId, role: m.role };
  });

/** Claim the invite for the signed-in user. The token, not the email alone, grants the role. */
export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string().min(1).parse)
  .handler(async ({ context, data }) => {
    const token = data.trim();
    if (!token) throw new Error("That invite link is not valid.");
    const sql = await getSql();
    const users = await sql<{ email: string | null }>`
      select email from "user" where id = ${context.userId}
    `;
    const email = normalizeOperatorEmail(users[0]?.email ?? "");
    const rows = await sql<{
      id: string;
      chapter_id: string;
      email: string;
      role: OperatorRole;
      expires_at: string | Date;
      accepted_at: string | Date | null;
    }>`
      select id, chapter_id, email, role, expires_at, accepted_at
      from operator_invites
      where token_hash = ${hashInviteToken(token)}
    `;
    const invite = rows[0];
    if (!invite) throw new Error("That invite link is not valid.");
    if (invite.accepted_at) throw new Error("That invite was already used.");
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      throw new Error("That invite has expired.");
    }
    if (!email || normalizeOperatorEmail(invite.email) !== email) {
      throw new Error("This invite is for a different email.");
    }
    const claimed = await sql<{ id: string }>`
      update operator_invites set accepted_at = now()
      where id = ${invite.id} and accepted_at is null
      returning id
    `;
    if (!claimed[0]) throw new Error("That invite was already used.");
    const already = await sql<{ user_id: string }>`
      select user_id from chapter_members where user_id = ${context.userId}
    `;
    if (!already[0]) {
      await sql`
        insert into chapter_members (user_id, chapter_id, role)
        values (${context.userId}, ${invite.chapter_id}, ${invite.role})
      `;
    }
    return { ok: true as const };
  });

/** Delete a sign-in that never joined the book, so the address can be invited again. */
export const removeUnassignedAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    // Session and account rows reference "user" with on delete cascade.
    // One conditional delete, so a membership cannot appear between statements.
    const removed = await sql<{ id: string }>`
      delete from "user"
      where id = ${data.userId}
        and not exists (
          select 1 from chapter_members where user_id = ${data.userId}
        )
      returning id
    `;
    if (removed[0]) return { ok: true as const };
    const still = await sql<{ id: string }>`
      select id from "user" where id = ${data.userId}
    `;
    if (still[0]) throw new Error("That account has access to the book.");
    throw new Error("That account was not found.");
  });

export const inviteOperator = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      email: z.string().email(),
      role: z.enum(["admin", "editor", "viewer"]),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    const email = normalizeOperatorEmail(data.email);
    const existing = await sql<{ user_id: string; disabled_at: string | null }>`
      select m.user_id, m.disabled_at
      from chapter_members m
      join "user" u on u.id = m.user_id
      where m.chapter_id = ${m.chapterId} and lower(u.email) = ${email}
    `;
    if (existing[0] && !existing[0].disabled_at) {
      throw new Error("That person is already an operator. Change their role instead.");
    }
    if (existing[0]?.disabled_at) {
      throw new Error("That operator is disabled. Restore them instead of inviting again.");
    }
    await sql`
      delete from operator_invites
      where chapter_id = ${m.chapterId} and email = ${email} and accepted_at is null
    `;
    const token = newInviteToken();
    const expires = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
    await sql`
      insert into operator_invites (id, chapter_id, email, role, token_hash, created_by, expires_at)
      values (
        ${nid()}, ${m.chapterId}, ${email}, ${data.role}, ${hashInviteToken(token)},
        ${m.userId}, ${expires}
      )
    `;
    return { token, email, role: data.role, expiresAt: expires };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    await sql`
      delete from operator_invites
      where id = ${data.id} and chapter_id = ${m.chapterId} and accepted_at is null
    `;
    return { ok: true };
  });

export const setOperatorRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string(), role: z.enum(["admin", "editor", "viewer"]) }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    const rows = await sql<{ role: OperatorRole; disabled_at: string | null }>`
      select role, disabled_at from chapter_members
      where user_id = ${data.userId} and chapter_id = ${m.chapterId}
    `;
    if (!rows[0]) throw new Error("Operator not found.");
    if (rows[0].disabled_at) throw new Error("Restore this operator before changing their role.");
    const blocked = roleChangeBlockedReason({
      targetRole: rows[0].role,
      nextRole: data.role,
      enabledAdminCount: await enabledAdminCount(sql, m.chapterId),
    });
    if (blocked) throw new Error(blocked);
    await sql`
      update chapter_members set role = ${data.role}
      where user_id = ${data.userId} and chapter_id = ${m.chapterId}
    `;
    return { ok: true };
  });

export const setOperatorDisabled = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string(), disabled: z.boolean() }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    const rows = await sql<{ role: OperatorRole; disabled_at: string | null }>`
      select role, disabled_at from chapter_members
      where user_id = ${data.userId} and chapter_id = ${m.chapterId}
    `;
    if (!rows[0]) throw new Error("Operator not found.");
    if (data.disabled) {
      const blocked = disableBlockedReason({
        targetUserId: data.userId,
        actorUserId: m.userId,
        targetRole: rows[0].role,
        enabledAdminCount: await enabledAdminCount(sql, m.chapterId),
        alreadyDisabled: Boolean(rows[0].disabled_at),
      });
      if (blocked) throw new Error(blocked);
      await sql`
        update chapter_members set disabled_at = now()
        where user_id = ${data.userId} and chapter_id = ${m.chapterId}
      `;
    } else {
      await sql`
        update chapter_members set disabled_at = null
        where user_id = ${data.userId} and chapter_id = ${m.chapterId}
      `;
    }
    return { ok: true };
  });
