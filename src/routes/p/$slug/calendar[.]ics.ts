import { createFileRoute } from "@tanstack/react-router";
import { calendarFile } from "@/lib/crm/calendar-file";
import { plainDescription, publicOrigin } from "@/lib/crm/page-head";
import { readCalendarEvent } from "@/lib/crm/site";

export const Route = createFileRoute("/p/$slug/calendar.ics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const found = await readCalendarEvent(params.slug);
          if (!found) {
            return new Response("Not found", {
              status: 404,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
          const { item, timed } = found;
          const origin = publicOrigin({
            PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
            BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
          });
          const url = origin ? `${origin}/p/${item.slug}` : null;
          const description = [plainDescription(item.summary, 500), url].filter(Boolean).join("\n\n") || null;
          const body = calendarFile({
            uid: `${item.id}@chapter-book`,
            title: item.title,
            location: item.location,
            description,
            url,
            startsOn: item.starts_on,
            endsOn: item.ends_on,
            timed,
            now: new Date(),
          });
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "Content-Disposition": `attachment; filename="${item.slug.replace(/[^a-z0-9-]/gi, "")}.ics"`,
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (err) {
          console.error(err instanceof Error ? err.message : "Unavailable");
          return new Response("Unavailable", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }
      },
    },
  },
});
