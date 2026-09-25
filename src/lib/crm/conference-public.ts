/**
 * The Events desk is where a conference is filled in.
 * Those fields are copied onto the public website shelf. People in the book are not.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid, slugify } from "./ids";
import { assertEditor, loadMember } from "./member";
import { chooseConferenceItem } from "./conference-page";
import { siteImageSrc } from "./site-image";

type ShelfItem = {
  id: string;
  title: string;
  kind: string;
  layout: string | null;
};

type Sql = Awaited<ReturnType<typeof getSql>>;

async function uniqueSlug(sql: Sql, chapterId: string, title: string, exceptId?: string) {
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await sql<{ id: string }>`
      select id from site_items
      where chapter_id = ${chapterId} and slug = ${candidate} and id <> ${exceptId ?? ""}
    `;
    if (!rows[0]) return candidate;
  }
  return `${base}-${nid().slice(0, 8)}`;
}

async function ownedImage(sql: Sql, chapterId: string, imageId: string | undefined): Promise<string | null> {
  const id = imageId?.trim() ?? "";
  if (!id) return null;
  if (!siteImageSrc(id)) throw new Error("That picture is not in this book.");
  const rows = await sql<{ id: string }>`
    select id from site_images where id = ${id} and chapter_id = ${chapterId}
  `;
  if (!rows[0]) throw new Error("That picture is not in this book.");
  return rows[0].id;
}

async function releaseImage(sql: Sql, chapterId: string, imageId: string | null) {
  if (!imageId) return;
  await sql`
    delete from site_images
    where id = ${imageId} and chapter_id = ${chapterId}
      and not exists (
        select 1 from site_items where image_id = ${imageId} and chapter_id = ${chapterId}
      )
      and not exists (
        select 1 from event_sessions s
        join events e on e.id = s.event_id
        where s.image_id = ${imageId} and e.chapter_id = ${chapterId}
      )
  `;
}

async function requireConference(sql: Sql, chapterId: string, eventId: string) {
  const rows = await sql<{
    id: string;
    title: string;
    type_key: string;
    starts_at: string | null;
    timezone: string;
    venue_detail: string | null;
    public_item_id: string | null;
    venue_name: string | null;
  }>`
    select e.id, e.title, e.type_key, e.starts_at, e.timezone, e.venue_detail, e.public_item_id, o.name as venue_name
    from events e
    left join organizations o on o.id = e.venue_organization_id
    where e.id = ${eventId} and e.chapter_id = ${chapterId}
  `;
  const event = rows[0];
  if (!event) throw new Error("Event not found");
  if (event.type_key !== "conference") throw new Error("Sessions and the public page are for a conference.");
  return event;
}

async function ensurePublicItem(sql: Sql, chapterId: string, eventId: string) {
  const event = await requireConference(sql, chapterId, eventId);
  const shelf = await sql<ShelfItem>`
    select id, title, kind, layout from site_items where chapter_id = ${chapterId}
  `;
  let itemId = chooseConferenceItem(shelf, event.title, event.public_item_id);
  if (!itemId) {
    itemId = nid();
    const where = [event.venue_name, event.venue_detail].filter(Boolean).join(", ");
    const slug = await uniqueSlug(sql, chapterId, event.title);
    await sql`
      insert into site_items (
        id, chapter_id, kind, title, summary, location, when_label, featured, published, sort_order, slug, layout
      ) values (
        ${itemId}, ${chapterId}, ${"event"}, ${event.title}, ${null}, ${where || null}, ${null},
        ${false}, ${true}, ${0}, ${slug}, ${"conference"}
      )
    `;
  }
  if (event.public_item_id !== itemId) {
    await sql`update events set public_item_id = ${itemId} where id = ${event.id} and chapter_id = ${chapterId}`;
  }
  return itemId;
}

const pageShape = z.object({
  eventId: z.string(),
  title: z.string().min(1),
  headline: z.string().optional(),
  summary: z.string().optional(),
  whenLabel: z.string().optional(),
  location: z.string().optional(),
  registerUrl: z.string().optional(),
  body: z.string().optional(),
  imageId: z.string().optional(),
});

export const getConferenceDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((eventId: string) => eventId)
  .handler(async ({ context, data: eventId }) => {
    const m = await loadMember(context.userId);
    const sql = await getSql();
    const itemId = await ensurePublicItem(sql, m.chapterId, eventId);
    const pages = await sql<{
      id: string;
      title: string;
      subtitle: string | null;
      summary: string | null;
      when_label: string | null;
      location: string | null;
      url: string | null;
      body: string | null;
      image_id: string | null;
      slug: string | null;
    }>`
      select id, title, subtitle, summary, when_label, location, url, body, image_id, slug
      from site_items where id = ${itemId} and chapter_id = ${m.chapterId}
    `;
    const page = pages[0];
    if (!page) throw new Error("The public page could not be opened.");
    const sessions = await sql<{
      id: string;
      title: string;
      room: string | null;
      when_label: string | null;
      track: string | null;
      public_speaker: string | null;
      summary: string | null;
      body: string | null;
      article_url: string | null;
      image_id: string | null;
      featured: boolean;
    }>`
      select id, title, room, when_label, track, public_speaker, summary, body, article_url, image_id, featured
      from event_sessions where event_id = ${eventId}
      order by sort_order, title
    `;
    return { page, sessions };
  });

export const saveConferencePage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(pageShape.parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const itemId = await ensurePublicItem(sql, m.chapterId, data.eventId);
    const imageId = await ownedImage(sql, m.chapterId, data.imageId);
    const previous = await sql<{ image_id: string | null }>`
      select image_id from site_items where id = ${itemId} and chapter_id = ${m.chapterId}
    `;
    await sql`
      update site_items set
        title = ${data.title.trim()},
        subtitle = ${data.headline?.trim() || null},
        summary = ${data.summary?.trim() || null},
        when_label = ${data.whenLabel?.trim() || null},
        location = ${data.location?.trim() || null},
        url = ${data.registerUrl?.trim() || null},
        body = ${data.body?.trim() || null},
        image_id = ${imageId},
        layout = ${"conference"},
        published = ${true}
      where id = ${itemId} and chapter_id = ${m.chapterId}
    `;
    const old = previous[0]?.image_id ?? null;
    if (old && old !== imageId) await releaseImage(sql, m.chapterId, old);
    return { ok: true };
  });

const sessionShape = z.object({
  eventId: z.string(),
  sessionId: z.string(),
  title: z.string().min(1),
  room: z.string().optional(),
  whenLabel: z.string().optional(),
  track: z.string().optional(),
  speaker: z.string().optional(),
  summary: z.string().optional(),
  body: z.string().optional(),
  articleUrl: z.string().optional(),
  imageId: z.string().optional(),
  featured: z.boolean().optional(),
});

async function writeTalk(
  sql: Sql,
  chapterId: string,
  conferenceId: string,
  sessionId: string,
  data: z.infer<typeof sessionShape>,
  imageId: string | null,
) {
  const existing = await sql<{ site_item_id: string | null }>`
    select site_item_id from event_sessions where id = ${sessionId} and event_id = ${data.eventId}
  `;
  let talkId = existing[0]?.site_item_id ?? null;
  const title = data.title.trim();
  const speaker = data.speaker?.trim() || null;
  const summary = data.summary?.trim() || null;
  const body = data.body?.trim() || null;
  const whenLabel = data.whenLabel?.trim() || null;
  const track = data.track?.trim() || null;
  const articleUrl = data.articleUrl?.trim() || null;
  const featured = data.featured ?? false;
  if (talkId) {
    await sql`
      update site_items set
        title = ${title},
        subtitle = ${speaker},
        summary = ${summary},
        body = ${body},
        when_label = ${whenLabel},
        audience = ${track},
        url = ${articleUrl},
        image_id = ${imageId},
        featured = ${featured},
        published = ${true},
        conference_id = ${conferenceId},
        kind = ${"article"}
      where id = ${talkId} and chapter_id = ${chapterId}
    `;
  } else {
    talkId = nid();
    const slug = await uniqueSlug(sql, chapterId, title);
    await sql`
      insert into site_items (
        id, chapter_id, kind, title, subtitle, summary, url, when_label, audience, featured, published,
        sort_order, slug, body, layout, conference_id, image_id
      ) values (
        ${talkId}, ${chapterId}, ${"article"}, ${title}, ${speaker}, ${summary}, ${articleUrl}, ${whenLabel},
        ${track}, ${featured}, ${true}, ${10}, ${slug}, ${body}, ${"page"}, ${conferenceId}, ${imageId}
      )
    `;
  }
  await sql`
    update event_sessions set
      title = ${title},
      room = ${data.room?.trim() || null},
      when_label = ${whenLabel},
      track = ${track},
      public_speaker = ${speaker},
      summary = ${summary},
      body = ${body},
      article_url = ${articleUrl},
      image_id = ${imageId},
      featured = ${featured},
      site_item_id = ${talkId}
    where id = ${sessionId} and event_id = ${data.eventId}
  `;
}

export const saveConferenceSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(sessionShape.parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const conferenceId = await ensurePublicItem(sql, m.chapterId, data.eventId);
    const imageId = await ownedImage(sql, m.chapterId, data.imageId);
    const previous = await sql<{ image_id: string | null }>`
      select image_id from event_sessions where id = ${data.sessionId} and event_id = ${data.eventId}
    `;
    await writeTalk(sql, m.chapterId, conferenceId, data.sessionId, data, imageId);
    const old = previous[0]?.image_id ?? null;
    if (old && old !== imageId) await releaseImage(sql, m.chapterId, old);
    return { ok: true };
  });

export const addConferenceSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string(), title: z.string().min(1) }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await requireConference(sql, m.chapterId, data.eventId);
    const conferenceId = await ensurePublicItem(sql, m.chapterId, data.eventId);
    const max = await sql<{ n: number }>`
      select coalesce(max(sort_order), 0)::int as n from event_sessions where event_id = ${data.eventId}
    `;
    const sessionId = nid();
    await sql`
      insert into event_sessions (id, event_id, title, sort_order)
      values (${sessionId}, ${data.eventId}, ${data.title.trim()}, ${(max[0]?.n ?? 0) + 1})
    `;
    await writeTalk(
      sql,
      m.chapterId,
      conferenceId,
      sessionId,
      {
        eventId: data.eventId,
        sessionId,
        title: data.title.trim(),
      },
      null,
    );
    return { id: sessionId };
  });

export const removeConferenceSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string(), sessionId: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await requireConference(sql, m.chapterId, data.eventId);
    const rows = await sql<{ site_item_id: string | null; image_id: string | null }>`
      select site_item_id, image_id from event_sessions where id = ${data.sessionId} and event_id = ${data.eventId}
    `;
    const row = rows[0];
    if (!row) return { ok: true };
    await sql`delete from event_sessions where id = ${data.sessionId} and event_id = ${data.eventId}`;
    if (row.site_item_id) {
      await sql`delete from site_items where id = ${row.site_item_id} and chapter_id = ${m.chapterId}`;
    }
    if (row.image_id) await releaseImage(sql, m.chapterId, row.image_id);
    return { ok: true };
  });
