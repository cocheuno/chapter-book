import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { siteImageBytes, siteImageSrc } from "@/lib/crm/site-image";

export const Route = createFileRoute("/api/site-image/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!siteImageSrc(id)) return new Response(null, { status: 404 });
        try {
          const sql = await getSql();
          const rows = await sql<{ mime: string; bytes: unknown }>`
            select mime, bytes from site_images where id = ${id}
          `;
          const row = rows[0];
          const bytes = row ? siteImageBytes(row.bytes) : null;
          if (!row || !bytes || !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(row.mime)) {
            return new Response(null, { status: 404 });
          }
          return new Response(Buffer.from(bytes), {
            headers: {
              "Content-Type": row.mime,
              "Cache-Control": "public, max-age=86400",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response(null, { status: 404 });
        }
      },
    },
  },
});
