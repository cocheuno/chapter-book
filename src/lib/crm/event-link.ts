/** How an operational event finds its public page, and how an announcement points at it. */

export function matchingEventPage(
  items: { id: string; title: string; kind: string }[],
  eventTitle: string,
  linkedId: string | null,
): string | null {
  if (linkedId && items.some((item) => item.id === linkedId)) return linkedId;
  const title = eventTitle.trim().toLowerCase();
  return items.find((item) => item.kind === "event" && item.title.trim().toLowerCase() === title)?.id ?? null;
}

const EVENT_TITLE_STOP = new Set(["the", "of", "a", "an", "and", "area"]);

/** Shared identity for a Gold Mass or conference title, so two listings can use one page. */
export function samePublicEventKey(title: string): string | null {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !EVENT_TITLE_STOP.has(token));
  if (!tokens.includes("mass") && !tokens.includes("conference")) return null;
  return tokens.slice().sort().join(" ");
}

export type CanonicalPiece = {
  id: string;
  kind: string;
  title: string;
  slug: string | null;
  summary?: string | null;
  body?: string | null;
};

function richness(item: CanonicalPiece): number {
  const summary = item.summary ?? "";
  const body = item.body ?? "";
  let score = summary.length / 2000 + body.length / 1000;
  if (/<\s*[a-z]/i.test(summary) || /<\s*[a-z]/i.test(body)) score += 5;
  if (/<\s*section\b/i.test(summary) || /<\s*section\b/i.test(body)) score += 20;
  return score;
}

/**
 * When an announcement and an event listing are the same gathering, every
 * "Event details" link uses the page that actually holds the details.
 */
export function canonicalDetailPaths(items: CanonicalPiece[]): Map<string, string> {
  const groups = new Map<string, CanonicalPiece[]>();
  for (const item of items) {
    if ((item.kind !== "event" && item.kind !== "announcement") || !item.slug) continue;
    const key = samePublicEventKey(item.title);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const paths = new Map<string, string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const winner = [...list].sort((a, b) => richness(b) - richness(a))[0];
    if (!winner?.slug) continue;
    const path = `/p/${winner.slug}`;
    for (const item of list) paths.set(item.id, path);
  }
  return paths;
}

export function eventPageLink(
  pages: { id: string; slug: string | null; title: string; published?: boolean }[],
  publicItemId: string | null,
): { href: string; title: string } | null {
  if (!publicItemId) return null;
  const page = pages.find((item) => item.id === publicItemId && item.slug && item.published !== false);
  if (!page?.slug) return null;
  return { href: `/p/${page.slug}`, title: page.title };
}
