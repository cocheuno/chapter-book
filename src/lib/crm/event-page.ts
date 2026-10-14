import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { recordAudit } from "./audit";
import { nid, slugify } from "./ids";
import { matchingEventPage } from "./event-link";
import { assertEditor, loadMember } from "./member";

type Sql = Awaited<ReturnType<typeof getSql>>;

async function uniqueSlug(sql: Sql, chapterId: string, title: string) {
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await sql<{ id: string }>`
      select id from site_items
      where chapter_id = ${chapterId} and slug = ${candidate}
    `;
    if (!rows[0]) return candidate;
  }
  return `${base}-${nid().slice(0, 8)}`;
}

/** Create or republish the website page for an event. Returns the site item id. */
export async function ensureEventWebPage(sql: Sql, chapterId: string, eventId: string): Promise<string> {
  const events = await sql<{ id: string; title: string; type_key: string; public_item_id: string | null }>`
    select id, title, type_key, public_item_id from events
    where id = ${eventId} and chapter_id = ${chapterId}
  `;
  const event = events[0];
  if (!event) throw new Error("Event not found");
  const shelf = await sql<{ id: string; title: string; kind: string }>`
    select id, title, kind from site_items where chapter_id = ${chapterId}
  `;
  let itemId = matchingEventPage(shelf, event.title, event.public_item_id);
  const layout = event.type_key === "conference" ? "conference" : "page";
  if (!itemId) {
    itemId = nid();
    const slug = await uniqueSlug(sql, chapterId, event.title);
    await sql`
      insert into site_items (
        id, chapter_id, kind, title, featured, published, sort_order, slug, layout
      ) values (
        ${itemId}, ${chapterId}, ${"event"}, ${event.title}, ${false}, ${true}, ${0}, ${slug}, ${layout}
      )
    `;
  } else {
    await sql`
      update site_items set published = ${true}
      where id = ${itemId} and chapter_id = ${chapterId}
    `;
  }
  await sql`
    update events set public_item_id = ${itemId}
    where id = ${event.id} and chapter_id = ${chapterId}
  `;
  return itemId;
}

export async function hideEventWebPage(sql: Sql, chapterId: string, eventId: string) {
  const events = await sql<{ public_item_id: string | null }>`
    select public_item_id from events where id = ${eventId} and chapter_id = ${chapterId}
  `;
  const itemId = events[0]?.public_item_id;
  if (!itemId) return;
  await sql`
    update site_items set published = ${false}
    where id = ${itemId} and chapter_id = ${chapterId}
  `;
}

export const getEventWebPage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((eventId: string) => eventId)
  .handler(async ({ context, data: eventId }) => {
    const m = await loadMember(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; slug: string | null; published: boolean }>`
      select s.id, s.slug, s.published
      from events e
      join site_items s on s.id = e.public_item_id and s.chapter_id = e.chapter_id
      where e.id = ${eventId} and e.chapter_id = ${m.chapterId}
    `;
    return rows[0] ?? null;
  });

export const setEventWebPage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string(), enabled: z.boolean() }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const beforeRows = await sql<{ title: string; public_item_id: string | null; published: boolean | null }>`
      select e.title, e.public_item_id, s.published
      from events e
      left join site_items s on s.id = e.public_item_id and s.chapter_id = e.chapter_id
      where e.id = ${data.eventId} and e.chapter_id = ${m.chapterId}
    `;
    const before = beforeRows[0];
    if (data.enabled) {
      const id = await ensureEventWebPage(sql, m.chapterId, data.eventId);
      const alreadyOn = before?.public_item_id === id && before.published === true;
      if (before && !alreadyOn) {
        await recordAudit(sql, {
          chapterId: m.chapterId,
          actor: m.userId,
          action: "event_web_page_set",
          entity: "event",
          entityId: data.eventId,
          detail: { what: "web page", name: before.title, itemId: id, enabled: true },
        });
      }
      return { id, enabled: true };
    }
    await hideEventWebPage(sql, m.chapterId, data.eventId);
    if (before?.public_item_id && before.published === true) {
      await recordAudit(sql, {
        chapterId: m.chapterId,
        actor: m.userId,
        action: "event_web_page_set",
        entity: "event",
        entityId: data.eventId,
        detail: { what: "web page", name: before.title, itemId: before.public_item_id, enabled: false },
      });
    }
    return { id: null, enabled: false };
  });
