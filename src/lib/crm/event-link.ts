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

export function eventPageLink(
  pages: { id: string; slug: string | null; title: string; published?: boolean }[],
  publicItemId: string | null,
): { href: string; title: string } | null {
  if (!publicItemId) return null;
  const page = pages.find((item) => item.id === publicItemId && item.slug && item.published !== false);
  if (!page?.slug) return null;
  return { href: `/p/${page.slug}`, title: page.title };
}
