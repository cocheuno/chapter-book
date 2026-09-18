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
  isOperatorRole,
  newInviteToken,
  normalizeOperatorEmail,
  roleChangeBlockedReason,
  type OperatorRole,
} from "./operator-rules";

export { INVITE_DAYS, isOperatorRole, type OperatorRole };

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
    return { founder: true };
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
    return { members, invites, selfId: m.userId, role: m.role };
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
