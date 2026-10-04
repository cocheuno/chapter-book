import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "./ids";
import { founderAllowed } from "./operator-rules";
import { MAIL_TEMPLATE_SEEDS } from "./templates";
import { ensureLists, seedLists } from "./lists";
import { ensureSite } from "./site-seed";

export type ChapterRole = "admin" | "editor" | "viewer";

export class NotOperatorError extends Error {
  readonly status = 403;
  constructor(message = "You are not an operator of this chapter.") {
    super(message);
    this.name = "NotOperatorError";
  }
}

export class OperatorDisabledError extends Error {
  readonly status = 403;
  constructor(message = "This operator sign-in has been disabled.") {
    super(message);
    this.name = "OperatorDisabledError";
  }
}

export type MemberContext = {
  userId: string;
  chapterId: string;
  role: ChapterRole;
  chapterName: string;
  timezone: string;
  contactLine: string | null;
  fromName: string;
  fromAddress: string | null;
  replyTo: string | null;
};

export function assertEditor(role: ChapterRole) {
  if (role === "viewer") {
    throw new Error("Viewers can look, not edit.");
  }
}

export function assertAdmin(role: ChapterRole) {
  if (role !== "admin") {
    throw new Error("Only an admin can do that.");
  }
}

export async function loadMember(userId: string): Promise<MemberContext> {
  const sql = await getSql();
  const existing = await sql<{
    user_id: string;
    chapter_id: string;
    role: ChapterRole;
    disabled_at: string | null;
    name: string;
    timezone: string;
    contact_line: string | null;
    from_name: string;
    from_address: string | null;
    reply_to: string | null;
  }>`
    select m.user_id, m.chapter_id, m.role, m.disabled_at, c.name, c.timezone, c.contact_line,
           c.from_name, c.from_address, c.reply_to
    from chapter_members m
    join chapters c on c.id = m.chapter_id
    where m.user_id = ${userId}
  `;
  if (existing[0]) {
    const r = existing[0];
    if (r.disabled_at) throw new OperatorDisabledError();
    await ensureLists(sql, r.chapter_id);
    return {
      userId,
      chapterId: r.chapter_id,
      role: r.role,
      chapterName: r.name,
      timezone: r.timezone,
      contactLine: r.contact_line,
      fromName: r.from_name,
      fromAddress: r.from_address,
      replyTo: r.reply_to,
    };
  }

  const chapters = await sql<{ id: string }>`select id from chapters limit 1`;
  if (chapters[0]) {
    throw new NotOperatorError();
  }

  const account = await sql<{ email: string | null }>`
    select email from "user" where id = ${userId}
  `;
  if (
    !founderAllowed(account[0]?.email ?? "", {
      founderEmail: serverEnv("FOUNDER_EMAIL"),
      databaseUrl: serverEnv("DATABASE_URL"),
    })
  ) {
    throw new NotOperatorError();
  }

  await bootstrapChapter(userId);
  return loadMember(userId);
}

/**
 * Read a host variable. Not env.server: a client route imports this module,
 * and import protection refuses *.server files there. founderAllowed trims.
 */
function serverEnv(key: string): string | undefined {
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}

async function bootstrapChapter(userId: string) {
  const sql = await getSql();
  const chapterId = nid();
  try {
    await sql`
      insert into chapters (id, name, timezone, contact_line, from_name, from_address, reply_to)
      values (
        ${chapterId},
        ${"SCS Chapter"},
        ${"America/Chicago"},
        ${"chapter@catholicscientists.example"},
        ${"SCS Chapter"},
        ${"chapter@catholicscientists.example"},
        ${"chapter@catholicscientists.example"}
      )
    `;
  } catch (err) {
    if (isUniqueViolation(err)) throw new NotOperatorError();
    throw err;
  }
  await sql`
    insert into chapter_members (user_id, chapter_id, role)
    values (${userId}, ${chapterId}, 'admin')
  `;
  await seedLists(sql, chapterId);

  for (const t of MAIL_TEMPLATE_SEEDS) {
    await sql`
      insert into mail_templates (id, chapter_id, key, name, audience_hint, subject, body, event_type_key)
      values (
        ${nid()}, ${chapterId}, ${t.key}, ${t.name}, ${t.audienceHint},
        ${t.subject}, ${t.body}, ${t.eventTypeKey}
      )
    `;
  }

  await ensureSite(sql, chapterId);
}

export const getSessionContext = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => loadMember(context.userId));
