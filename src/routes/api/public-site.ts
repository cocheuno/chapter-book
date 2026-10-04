import { createFileRoute } from "@tanstack/react-router";
import { publicSiteCorsHeaders } from "@/lib/crm/public-cors";
import { loadPublishedSite, publicSiteDto } from "@/lib/crm/site";

function json(
  data: unknown,
  request: Request,
  status = 200,
  cache: "feed" | "no-store" = "no-store",
) {
  const headers = publicSiteCorsHeaders(request, cache);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

export const Route = createFileRoute("/api/public-site")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => new Response(null, { status: 204, headers: publicSiteCorsHeaders(request) }),
      GET: async ({ request }) => {
        try {
          const data = await loadPublishedSite();
          return json(publicSiteDto(data), request, 200, "feed");
        } catch (err) {
          console.error(
            "[public-site] unavailable:",
            err instanceof Error ? err.message : String(err),
          );
          return json({ error: "unavailable" }, request, 503, "no-store");
        }
      },
    },
  },
});
