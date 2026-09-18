import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "./ids";
import { assertEditor, loadMember } from "./member";
import { foldName } from "./names";
import { DEFAULT_SITE, SITE_KINDS, ensureSiteContent, type SiteKind } from "./site-seed";

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
      select id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order
      from site_items
      where chapter_id = ${chapterId} and published
      order by kind, sort_order, title
    `;
  }
  return sql<SiteItemRow>`
    select id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order
    from site_items
    where chapter_id = ${chapterId}
    order by kind, sort_order, title
  `;
}

export const listSite = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const m = await loadMember(context.userId);
    const sql = await getSql();
    await ensureSiteContent(sql, m.chapterId);
    const settings = await readSettings(sql, m.chapterId);
    const items = await readItems(sql, m.chapterId, false);
    return { settings, items, kinds: SITE_KINDS, member: m };
  });

/** Public chapter page. No sign-in — do not attach authMiddleware. */
export const getPublicSite = createServerFn({ method: "GET" }).handler(async () => {
  const empty = { settings: emptySettings, items: [] as SiteItemRow[] };
  try {
    const sql = await getSql();
    const chapters = await sql<{ id: string }>`select id from chapters order by created_at limit 1`;
    if (!chapters[0]) return empty;
    const chapterId = chapters[0].id;
    await ensureSiteContent(sql, chapterId);
    const settings = await readSettings(sql, chapterId);
    const items = await readItems(sql, chapterId, true);
    return { settings, items };
  } catch {
    return empty;
  }
});

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

const itemInput = z.object({
  id: z.string().optional(),
  kind: z.enum(["event", "article", "document", "course"]),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
  location: z.string().optional(),
  whenLabel: z.string().optional(),
  audience: z.string().optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
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
          published = ${published}
        where id = ${data.id} and chapter_id = ${m.chapterId}
      `;
      return { id: data.id };
    }
    const id = nid();
    const max = await sql<{ n: number }>`
      select coalesce(max(sort_order), -1)::int as n
      from site_items where chapter_id = ${m.chapterId} and kind = ${data.kind}
    `;
    try {
      await sql`
        insert into site_items (
          id, chapter_id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order
        )
        values (
          ${id}, ${m.chapterId}, ${data.kind}, ${title}, ${data.subtitle || null}, ${data.summary || null},
          ${data.url || null}, ${data.location || null}, ${data.whenLabel || null}, ${data.audience || null},
          ${featured}, ${published}, ${(max[0]?.n ?? -1) + 1}
        )
      `;
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error(`${title} is already on the site shelf.`);
      throw err;
    }
    return { id };
  });

export const removeSiteItem = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }).parse)
  .handler(async ({ context, data }) => {
    const m = await loadMember(context.userId);
    assertEditor(m.role);
    const sql = await getSql();
    await sql`delete from site_items where id = ${data.id} and chapter_id = ${m.chapterId}`;
    return { ok: true };
  });
