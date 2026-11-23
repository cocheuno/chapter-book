import type { Sql } from "@/lib/db";

/**
 * Deletes one site_images row only when this chapter has no remaining use.
 * Migrations name image_id on site_items, event_sessions, and event_speakers only.
 */
export async function releaseUnusedImage(sql: Sql, chapterId: string, imageId: string | null) {
  if (!imageId) return;
  await sql`
    delete from site_images
    where id = ${imageId} and chapter_id = ${chapterId}
      and not exists (
        select 1 from site_items
        where image_id = ${imageId} and chapter_id = ${chapterId}
      )
      and not exists (
        select 1 from event_sessions s
        join events e on e.id = s.event_id
        where s.image_id = ${imageId} and e.chapter_id = ${chapterId}
      )
      and not exists (
        select 1 from event_speakers sp
        join events e on e.id = sp.event_id
        where sp.image_id = ${imageId} and e.chapter_id = ${chapterId}
      )
  `;
}
