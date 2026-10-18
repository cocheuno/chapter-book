import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "./ids";
import { assertAdmin, loadMember } from "./member";
import {
  AUDIT_ACTIONS,
  AUDIT_GROUPS,
  actionsInGroup,
  auditHref,
  auditSummary,
  safeDetail,
  type AuditGroup,
} from "./audit-rules";

type Sql = Awaited<ReturnType<typeof getSql>>;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function recordAudit(
  sql: Sql,
  entry: {
    chapterId: string;
    actor: string;
    action: string;
    entity: string;
    entityId: string | null;
    detail: Record<string, unknown>;
  },
): Promise<string> {
  const detail = safeDetail(entry.detail);
  const id = nid();
  await sql`
    insert into audit_log (id, chapter_id, actor, action, entity, entity_id, detail)
    values (
      ${id}, ${entry.chapterId}, ${entry.actor}, ${entry.action}, ${entry.entity}, ${entry.entityId},
      ${JSON.stringify(detail)}::jsonb
    )
  `;
  return id;
}

function asDetail(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export const listActivity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      group: z.enum(AUDIT_GROUPS).optional(),
      from: day.optional(),
      to: day.optional(),
      before: z.object({ at: z.string().min(1), id: z.string().min(1) }).optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const member = await loadMember(context.userId);
    assertAdmin(member.role);
    const sql = await getSql();
    const params: unknown[] = [member.chapterId];
    let where = "a.chapter_id = $1";
    if (data.from) {
      params.push(data.from, member.timezone);
      where += ` and a.at >= ($${params.length - 1}::timestamp at time zone $${params.length})`;
    }
    if (data.to) {
      params.push(data.to, member.timezone);
      where += ` and a.at < (($${params.length - 1}::date + 1)::timestamp at time zone $${params.length})`;
    }
    if (data.group) {
      const actions = actionsInGroup(data.group as AuditGroup);
      const marks = actions.map((action) => {
        params.push(action);
        return `$${params.length}`;
      });
      where += ` and a.action in (${marks.join(", ")})`;
    }
    if (data.before) {
      params.push(data.before.at, data.before.id);
      const at = params.length - 1;
      const id = params.length;
      where += ` and (a.at < $${at}::timestamptz or (a.at = $${at}::timestamptz and a.id < $${id}))`;
    }
    params.push(51);
    const rows = await sql.query<{
      id: string;
      at: string;
      who: string;
      action: string;
      entity: string;
      entity_id: string | null;
      detail: unknown;
    }>(
      `select a.id, a.action, a.entity, a.entity_id, a.detail,
        to_char(a.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
        case
          when a.actor = 'public' then 'Public form'
          when a.actor = 'stripe' then 'Stripe'
          else coalesce(nullif(btrim(u.name), ''), u.email, 'Unknown account')
        end as who
      from audit_log a
      left join "user" u on u.id = a.actor
      where ${where}
      order by a.at desc, a.id desc
      limit $${params.length}`,
      params,
    );
    const page = rows.slice(0, 50).map((row) => {
      const detail = asDetail(row.detail);
      return {
        id: row.id,
        at: row.at,
        who: row.who,
        action: row.action,
        label: AUDIT_ACTIONS[row.action]?.label ?? row.action,
        summary: auditSummary(row.action, detail),
        href: auditHref(row.entity, row.entity_id, detail, row.action),
      };
    });
    return { rows: page, hasMore: rows.length > 50 };
  });
