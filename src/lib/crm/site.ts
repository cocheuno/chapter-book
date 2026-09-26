import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid, slugify } from "./ids";
import { assertEditor, loadMember } from "./member";
import { foldName } from "./names";
import { publicSummaryFields } from "./announcement-html";
import { type SpeakerRecord } from "./conference-page";
import { eventPageLink } from "./event-link";
import { siteImageSrc, sniffSiteImage } from "./site-image";
import { AI_CONFERENCE_SLUG, AI_CONFERENCE_TITLE, DEFAULT_SITE, SITE_KINDS, ensureSiteContent, type SiteKind } from "./site-seed";

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|unique index/i.test(msg);
}

type SettingsRow = {
  public_title: string;
  public_tagline: string | null;
  about: string | null;
  contact_email: string | null;
};

export type SiteItemRow = {
  id: string;
  kind: SiteKind;
  title: string;
  subtitle: string | null;
  summary: string | null;
  url: string | null;
  location: string | null;
  when_label: string | null;
  audience: string | null;
  featured: boolean;
  published: boolean;
  sort_order: number;
  slug: string | null;
  body: string | null;
  layout: string | null;
  conference_id: string | null;
  image_id: string | null;
  gathering_id: string | null;
  eventPage?: { href: string; title: string } | null;
};

const emptySettings: SettingsRow = {
  public_title: DEFAULT_SITE.publicTitle,
  public_tagline: DEFAULT_SITE.publicTagline,
  about: DEFAULT_SITE.about,
  contact_email: DEFAULT_SITE.contactEmail,
};

async function readSettings(sql: Awaited<ReturnType<typeof getSql>>, chapterId: string): Promise<SettingsRow> {
  const rows = await sql<SettingsRow>`
    select public_title, public_tagline, about, contact_email
    from site_settings where chapter_id = ${chapterId}
  `;
  return rows[0] ?? emptySettings;
}

async function readItems(
  sql: Awaited<ReturnType<typeof getSql>>,
  chapterId: string,
  publishedOnly: boolean,
): Promise<SiteItemRow[]> {
  if (publishedOnly) {
    return sql<SiteItemRow>`
      select id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order, slug, body, layout, conference_id, image_id, gathering_id
      from site_items
      where chapter_id = ${chapterId} and published
      order by kind, sort_order, title
    `;
  }
  return sql<SiteItemRow>`
    select id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order, slug, body, layout, conference_id, image_id, gathering_id
    from site_items
    where chapter_id = ${chapterId}
    order by kind, sort_order, title
  `;
}

async function listGatherings(sql: Awaited<ReturnType<typeof getSql>>, chapterId: string) {
  return sql<{ id: string; title: string; public_item_id: string | null }>`
    select id, title, public_item_id from events
    where chapter_id = ${chapterId} and status <> 'cancelled'
    order by starts_at desc nulls last, title
  `;
}

function withEventPages(
  items: SiteItemRow[],
  gatherings: { id: string; public_item_id: string | null }[],
): SiteItemRow[] {
  const pages = items.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    published: item.published,
  }));
  return items.map((item) => ({
    ...item,
    eventPage: eventPageLink(
      pages,
      gatherings.find((gathering) => gathering.id === item.gathering_id)?.public_item_id ?? null,
    ),
  }));
}

export const listSite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await loadMember(context.userId);
    const sql = await getSql();
    await ensureSiteContent(sql, m.chapterId);
    await backfillSlugs(sql, m.chapterId);
    await backfillConference(sql, m.chapterId);
    const settings = await readSettings(sql, m.chapterId);
    const items = await readItems(sql, m.chapterId, false);
    const gatherings = await listGatherings(sql, m.chapterId);
    return { settings, items: withEventPages(items, gatherings), gatherings, kinds: SITE_KINDS, member: m };
  });

/** Public chapter page. No sign-in — do not attach authMiddleware. */
export async function loadPublishedSite() {
  const empty = { settings: emptySettings, items: [] as SiteItemRow[] };
  try {
    const sql = await getSql();
    const chapters = await sql<{ id: string }>`select id from chapters order by created_at limit 1`;
    if (!chapters[0]) return empty;
    const chapterId = chapters[0].id;
    await ensureSiteContent(sql, chapterId);
    await backfillSlugs(sql, chapterId);
    await backfillConference(sql, chapterId);
    const settings = await readSettings(sql, chapterId);
    const items = await readItems(sql, chapterId, true);
    const gatherings = await listGatherings(sql, chapterId);
    return { settings, items: withEventPages(items, gatherings) };
  } catch {
    return empty;
  }
}

export function publicSiteDto(data: { settings: SettingsRow; items: SiteItemRow[] }) {
  return {
    settings: {
      publicTitle: data.settings.public_title,
      publicTagline: data.settings.public_tagline,
      about: data.settings.about,
      contactEmail: data.settings.contact_email,
    },
    items: data.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      subtitle: i.subtitle,
      ...publicSummaryFields(i.kind, i.summary, i.body),
      url: i.url,
      location: i.location,
      whenLabel: i.when_label,
      audience: i.audience,
      featured: i.featured,
      slug: i.slug,
      layout: i.layout === "conference" ? "conference" : "page",
      imageSrc: siteImageSrc(i.image_id),
      eventPage: i.eventPage ?? null,
      href: i.slug ? `/p/${i.slug}` : i.url,
    })),
  };
}

export const getPublicSite = createServerFn({ method: "POST" }).handler(async () => loadPublishedSite());

export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      publicTitle: z.string().min(1),
      publicTagline: z.string().optional(),
      about: z.string().optional(),
      contactEmail: z.string().optional(),
    }).parse,
  )
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`
      insert into site_settings (chapter_id, public_title, public_tagline, about, contact_email)
      values (
        ${m.chapterId}, ${data.publicTitle.trim()}, ${data.publicTagline || null},
        ${data.about || null}, ${data.contactEmail || null}
      )
      on conflict (chapter_id) do update set
        public_title = excluded.public_title,
        public_tagline = excluded.public_tagline,
        about = excluded.about,
        contact_email = excluded.contact_email,
        updated_at = now()
    `;
    return { ok: true };
  });

async function backfillSlugs(sql: Awaited<ReturnType<typeof getSql>>, chapterId: string) {
  try {
    const missing = await sql<{ id: string; title: string }>`
      select id, title from site_items
      where chapter_id = ${chapterId} and (slug is null or slug = '')
    `;
    for (const row of missing) {
      const slug = await uniqueSlug(sql, chapterId, row.title, undefined, row.id);
      await sql`update site_items set slug = ${slug} where id = ${row.id} and chapter_id = ${chapterId}`;
    }
  } catch {
    // 0012 may not have applied yet.
  }
}

async function backfillConference(sql: Awaited<ReturnType<typeof getSql>>, chapterId: string) {
  try {
    const rows = await sql<{ id: string; slug: string | null; title: string }>`
      select id, slug, title from site_items
      where chapter_id = ${chapterId}
        and kind = 'event'
        and layout is null
        and title = ${AI_CONFERENCE_TITLE}
    `;
    for (const row of rows) {
      const auto = slugify(row.title);
      let slug = row.slug || auto;
      if (!row.slug || row.slug === auto) {
        const taken = await sql<{ id: string }>`
          select id from site_items
          where chapter_id = ${chapterId} and slug = ${AI_CONFERENCE_SLUG} and id <> ${row.id}
        `;
        if (!taken[0]) slug = AI_CONFERENCE_SLUG;
      }
      await sql`
        update site_items
        set layout = 'conference', slug = ${slug}
        where id = ${row.id} and chapter_id = ${chapterId} and layout is null
      `;
    }
  } catch {
    // 0013 may not have applied yet.
  }
}

async function uniqueSlug(
  sql: Awaited<ReturnType<typeof getSql>>,
  chapterId: string,
  title: string,
  requested: string | undefined,
  exceptId: string | undefined,
): Promise<string> {
  const base = slugify(requested?.trim() || title);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await sql<{ id: string }>`
      select id from site_items
      where chapter_id = ${chapterId} and slug = ${candidate}
        and id <> ${exceptId ?? ""}
    `;
    if (!rows[0]) return candidate;
  }
  return `${base}-${nid().slice(0, 8)}`;
}

async function itemImageId(
  sql: Awaited<ReturnType<typeof getSql>>,
  chapterId: string,
  id: string,
): Promise<string | null> {
  const rows = await sql<{ image_id: string | null }>`
    select image_id from site_items where id = ${id} and chapter_id = ${chapterId}
  `;
  return rows[0]?.image_id ?? null;
}

async function ownedImageId(
  sql: Awaited<ReturnType<typeof getSql>>,
  chapterId: string,
  requested: string | undefined,
): Promise<string | null> {
  const id = requested?.trim() ?? "";
  if (!id) return null;
  if (!siteImageSrc(id)) throw new Error("That picture is not in this book.");
  const rows = await sql<{ id: string }>`
    select id from site_images where id = ${id} and chapter_id = ${chapterId}
  `;
  if (!rows[0]) throw new Error("That picture is not in this book.");
  return rows[0].id;
}

async function releaseSiteImage(
  sql: Awaited<ReturnType<typeof getSql>>,
  chapterId: string,
  imageId: string,
) {
  await sql`
    delete from site_images
    where id = ${imageId} and chapter_id = ${chapterId}
      and not exists (
        select 1 from site_items where image_id = ${imageId} and chapter_id = ${chapterId}
      )
  `;
}

export const uploadSiteImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ data: z.string().min(16).max(2_100_000) }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const bytes = new Uint8Array(Buffer.from(data.data, "base64"));
    const mime = sniffSiteImage(bytes);
    if (!mime) throw new Error("Choose a JPEG, PNG, GIF, or WebP picture, up to 1.5 MB.");
    const sql = await getSql();
    const id = nid();
    await sql`
      insert into site_images (id, chapter_id, mime, bytes)
      values (${id}, ${m.chapterId}, ${mime}, ${bytes})
    `;
    return { id };
  });

const itemInput = z.object({
  id: z.string().optional(),
  kind: z.enum(["announcement", "event", "article", "document", "course"]),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
  location: z.string().optional(),
  whenLabel: z.string().optional(),
  audience: z.string().optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  slug: z.string().optional(),
  body: z.string().optional(),
  layout: z.enum(["page", "conference"]).optional(),
  conferenceId: z.string().optional(),
  imageId: z.string().optional(),
  gatheringId: z.string().optional(),
});

export const saveSiteItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(itemInput.parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const title = data.title.trim();
    const clash = await sql<{ id: string; title: string }>`
      select id, title from site_items
      where chapter_id = ${m.chapterId} and kind = ${data.kind}
        and lower(title) = ${foldName(title)}
        and id <> ${data.id ?? ""}
    `;
    if (clash[0]) throw new Error(`${clash[0].title} is already on the site shelf.`);
    const published = data.published ?? true;
    const featured = data.featured ?? false;
    const slug = await uniqueSlug(sql, m.chapterId, title, data.slug, data.id);
    const body = data.body?.trim() || null;
    const imageId = await ownedImageId(sql, m.chapterId, data.imageId);
    let gatheringId: string | null = null;
    if (data.kind === "announcement" && data.gatheringId?.trim()) {
      const gatherings = await sql<{ id: string }>`
        select id from events where id = ${data.gatheringId.trim()} and chapter_id = ${m.chapterId}
      `;
      if (gatherings[0]) gatheringId = gatherings[0].id;
    }
    const previousImageId = data.id ? await itemImageId(sql, m.chapterId, data.id) : null;
    const layout = data.kind === "event" && data.layout === "conference" ? "conference" : "page";
    let conferenceId: string | null = null;
    if (layout !== "conference" && data.conferenceId?.trim()) {
      const parent = await sql<{ id: string }>`
        select id from site_items
        where id = ${data.conferenceId.trim()}
          and chapter_id = ${m.chapterId}
          and kind = 'event'
          and layout = 'conference'
          and id <> ${data.id ?? ""}
      `;
      if (parent[0]) conferenceId = parent[0].id;
    }
    if (data.id) {
      await sql`
        update site_items set
          kind = ${data.kind},
          title = ${title},
          subtitle = ${data.subtitle || null},
          summary = ${data.summary || null},
          url = ${data.url || null},
          location = ${data.location || null},
          when_label = ${data.whenLabel || null},
          audience = ${data.audience || null},
          featured = ${featured},
          published = ${published},
          slug = ${slug},
          body = ${body},
          layout = ${layout},
          conference_id = ${conferenceId},
          image_id = ${imageId},
          gathering_id = ${gatheringId}
        where id = ${data.id} and chapter_id = ${m.chapterId}
      `;
      if (previousImageId && previousImageId !== imageId) {
        await releaseSiteImage(sql, m.chapterId, previousImageId);
      }
      return { id: data.id, slug };
    }
    const id = nid();
    const max = await sql<{ n: number }>`
      select coalesce(max(sort_order), -1)::int as n
      from site_items where chapter_id = ${m.chapterId} and kind = ${data.kind}
    `;
    try {
      await sql`
        insert into site_items (
          id, chapter_id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order, slug, body, layout, conference_id, image_id, gathering_id
        )
        values (
          ${id}, ${m.chapterId}, ${data.kind}, ${title}, ${data.subtitle || null}, ${data.summary || null},
          ${data.url || null}, ${data.location || null}, ${data.whenLabel || null}, ${data.audience || null},
          ${featured}, ${published}, ${(max[0]?.n ?? -1) + 1}, ${slug}, ${body}, ${layout}, ${conferenceId}, ${imageId}, ${gatheringId}
        )
      `;
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error(`${title} is already on the site shelf.`);
      throw err;
    }
    return { id, slug };
  });

/** Public detail page. No sign-in. */
export const getPublicPage = createServerFn({ method: "POST" })
  .validator((slug: string) => slug.trim())
  .handler(async ({ data: slug }) => {
    if (!slug) return null;
    try {
      const sql = await getSql();
      const chapters = await sql<{ id: string }>`select id from chapters order by created_at limit 1`;
      if (!chapters[0]) return null;
      await ensureSiteContent(sql, chapters[0].id);
      await backfillSlugs(sql, chapters[0].id);
      await backfillConference(sql, chapters[0].id);
      const rows = await sql<SiteItemRow & { public_title: string | null; contact_email: string | null }>`
        select i.id, i.kind, i.title, i.subtitle, i.summary, i.url, i.location, i.when_label, i.audience,
               i.featured, i.published, i.sort_order, i.slug, i.body, i.layout, i.conference_id, i.image_id, i.gathering_id,
               s.public_title, s.contact_email
        from site_items i
        left join site_settings s on s.chapter_id = i.chapter_id
        where i.chapter_id = ${chapters[0].id} and i.slug = ${slug} and i.published
      `;
      const page = rows[0];
      if (!page) return null;
      const chapterId = chapters[0].id;
      const gatherings = await listGatherings(sql, chapterId);
      const shelf = await sql<{ id: string; slug: string | null; title: string; published: boolean }>`
        select id, slug, title, published from site_items where chapter_id = ${chapterId}
      `;
      const eventPage = eventPageLink(
        shelf,
        gatherings.find((gathering) => gathering.id === page.gathering_id)?.public_item_id ?? null,
      );
      if (page.layout !== "conference") return { ...page, program: [] as SiteItemRow[], eventPage, speakerLineup: [] as SpeakerRecord[] };
      const program = await sql<SiteItemRow>`
        select id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order, slug, body, layout, conference_id, image_id, gathering_id
        from site_items
        where chapter_id = ${chapterId} and conference_id = ${page.id} and published
        order by kind, sort_order, title
      `;
      const people = await sql<{
        id: string;
        name: string;
        role: string | null;
        body: string | null;
        image_id: string | null;
      }>`
        select sp.id, sp.name, sp.role, sp.body, sp.image_id
        from event_speakers sp
        join events e on e.id = sp.event_id
        where e.public_item_id = ${page.id} and e.chapter_id = ${chapterId}
        order by sp.sort_order, sp.name
      `;
      const links = await sql<{ speaker_id: string | null; site_item_id: string | null }>`
        select s.speaker_id, s.site_item_id
        from event_sessions s
        join events e on e.id = s.event_id
        where e.public_item_id = ${page.id} and e.chapter_id = ${chapterId}
      `;
      const speakerLineup: SpeakerRecord[] = people.map((person) => ({
        name: person.name,
        role: person.role,
        body: person.body,
        imageId: person.image_id,
        talkIds: links
          .filter((link) => link.speaker_id === person.id && link.site_item_id)
          .map((link) => link.site_item_id as string),
      }));
      return { ...page, program, eventPage, speakerLineup };
    } catch {
      return null;
    }
  });

export const removeSiteItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    const imageId = await itemImageId(sql, m.chapterId, data.id);
    try {
      await sql`
        update site_items set conference_id = null
        where conference_id = ${data.id} and chapter_id = ${m.chapterId}
      `;
    } catch {
      // 0013 may not have applied yet.
    }
    await sql`delete from site_items where id = ${data.id} and chapter_id = ${m.chapterId}`;
    if (imageId) await releaseSiteImage(sql, m.chapterId, imageId);
    return { ok: true };
  });
