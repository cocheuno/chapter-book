import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertAdmin, loadMember } from "./member";

type Sql = Awaited<ReturnType<typeof getSql>>;

/** People, partners, gatherings, RSVPs, tasks, mailings. Not operators, lists, or website copy. */
export async function wipeOperationalBook(sql: Sql, chapterId: string) {
  await sql`delete from mailing_skips where mailing_id in (select id from mailings where chapter_id = ${chapterId})`;
  await sql`delete from mail_messages where mailing_id in (select id from mailings where chapter_id = ${chapterId})`;
  await sql`delete from mailings where chapter_id = ${chapterId}`;
  await sql`delete from participations where chapter_id = ${chapterId}`;
  await sql`delete from program_pieces where event_id in (select id from events where chapter_id = ${chapterId})`;
  await sql`delete from event_slots where event_id in (select id from events where chapter_id = ${chapterId})`;
  await sql`delete from event_sessions where event_id in (select id from events where chapter_id = ${chapterId})`;
  await sql`delete from event_links where event_id_a in (select id from events where chapter_id = ${chapterId})
    or event_id_b in (select id from events where chapter_id = ${chapterId})`;
  await sql`delete from tasks where chapter_id = ${chapterId}`;
  await sql`delete from touches where chapter_id = ${chapterId}`;
  await sql`delete from affiliations where chapter_id = ${chapterId}`;
  await sql`delete from person_roles where person_id in (select id from persons where chapter_id = ${chapterId})`;
  await sql`update events set celebrant_id = null, venue_organization_id = null, cloned_from_id = null where chapter_id = ${chapterId}`;
  const events = await sql<{ n: number }>`select count(*)::int as n from events where chapter_id = ${chapterId}`;
  const people = await sql<{ n: number }>`select count(*)::int as n from persons where chapter_id = ${chapterId}`;
  const partners = await sql<{ n: number }>`select count(*)::int as n from organizations where chapter_id = ${chapterId}`;
  await sql`delete from events where chapter_id = ${chapterId}`;
  await sql`delete from persons where chapter_id = ${chapterId}`;
  await sql`update organizations set parent_id = null where chapter_id = ${chapterId}`;
  await sql`delete from organizations where chapter_id = ${chapterId}`;
  return {
    events: events[0]?.n ?? 0,
    people: people[0]?.n ?? 0,
    partners: partners[0]?.n ?? 0,
  };
}

export const clearOperationalBook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await loadMember(context.userId);
    assertAdmin(m.role);
    const sql = await getSql();
    return wipeOperationalBook(sql, m.chapterId);
  });
