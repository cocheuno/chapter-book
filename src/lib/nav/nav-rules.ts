export type RecentKind = "person" | "partner" | "event" | "letter";

export type RecentItem = {
  kind: RecentKind;
  id: string;
  label: string;
  href: string;
};

export const KIND_LABEL: Record<RecentKind, string> = {
  person: "Person",
  partner: "Partner",
  event: "Event",
  letter: "Letter",
};

function isKind(value: unknown): value is RecentKind {
  return value === "person" || value === "partner" || value === "event" || value === "letter";
}

/** Newest first. A repeat of the same kind and id replaces the older copy. */
export function addRecent(list: RecentItem[], item: RecentItem, max = 8): RecentItem[] {
  const rest = list.filter((row) => row.kind !== item.kind || row.id !== item.id);
  return [item, ...rest].slice(0, Math.max(0, max));
}

function asRecentItem(value: unknown): RecentItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!isKind(row.kind)) return null;
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  if (typeof row.label !== "string") return null;
  if (typeof row.href !== "string" || !row.href.startsWith("/")) return null;
  return { kind: row.kind, id: row.id, label: row.label, href: row.href };
}

/** Drop bad JSON, wrong shapes, unknown kinds, and hrefs that do not start with "/". */
export function parseRecent(raw: string | null): RecentItem[] {
  if (raw == null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: RecentItem[] = [];
  for (const value of parsed) {
    const item = asRecentItem(value);
    if (item) items.push(item);
  }
  return items;
}
