import { getSql } from "../db";
import { nid } from "../crm/ids";
import { hashInviteToken } from "../crm/operator-rules";

const pending = new Map<string, string>();

/** Keep a hash of the token, and the token itself only until this request reads it. */
export async function storeResetToken(userId: string, token: string): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ chapter_id: string }>`
    select chapter_id from chapter_members where user_id = ${userId}
  `;
  if (!rows[0]) return;
  await sql`
    insert into operator_resets (id, chapter_id, user_id, token_hash)
    values (${nid()}, ${rows[0].chapter_id}, ${userId}, ${hashInviteToken(token)})
  `;
  pending.set(userId, token);
}

/** Return the token stored for this request, once. */
export function takeResetToken(userId: string): string | null {
  const token = pending.get(userId);
  pending.delete(userId);
  return token ?? null;
}

/** Mark every open reset used, and drop Better Auth's plain reset rows. */
export async function markResetsUsed(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`
    update operator_resets set used_at = now()
    where user_id = ${userId} and used_at is null
  `;
  await sql`
    delete from verification
    where identifier like 'reset-password:%' and value = ${userId}
  `;
}
