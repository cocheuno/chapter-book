import { isPastItem } from "./dates.ts";

/** Homepage blocks in the order /site uses when no custom order is saved. */
export const HOME_SECTIONS = [
  { key: "event", label: "Upcoming Events" },
  { key: "announcement", label: "Announcements" },
  { key: "article", label: "Articles" },
  { key: "document", label: "Documents" },
  { key: "course", label: "Courses" },
] as const;

export type HomeSectionKey = (typeof HOME_SECTIONS)[number]["key"];

const DEFAULT_ORDER: readonly HomeSectionKey[] = HOME_SECTIONS.map((section) => section.key);

const KNOWN = new Set<string>(DEFAULT_ORDER);

export function homeSectionLabel(key: string): string {
  for (const section of HOME_SECTIONS) {
    if (section.key === key) return section.label;
  }
  return key;
}

/** Drop unknown and repeated keys, then append any block that is missing. Blank means today's order. */
export function parseHomeSections(text: string | null | undefined): HomeSectionKey[] {
  const seen = new Set<HomeSectionKey>();
  const ordered: HomeSectionKey[] = [];
  if (text && text.trim()) {
    for (const part of text.split(",")) {
      const key = part.trim().toLowerCase();
      if (!KNOWN.has(key) || seen.has(key as HomeSectionKey)) continue;
      const typed = key as HomeSectionKey;
      seen.add(typed);
      ordered.push(typed);
    }
  }
  for (const key of DEFAULT_ORDER) {
    if (!seen.has(key)) ordered.push(key);
  }
  return ordered;
}

export function serializeHomeSections(keys: readonly string[]): string {
  return keys.join(",");
}

/** A new list. Moving the first key up, or the last down, leaves the order as it was. */
export function moveKey<T extends string>(keys: readonly T[], key: T, direction: "up" | "down"): T[] {
  const next = [...keys];
  const index = next.indexOf(key);
  const target = direction === "up" ? index - 1 : index + 1;
  const current = next[index];
  const neighbor = next[target];
  if (current === undefined || neighbor === undefined) return next;
  next[index] = neighbor;
  next[target] = current;
  return next;
}

type TopItem = {
  id: string;
  kind: string;
  title: string;
  featured?: boolean | null;
  sort_order?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

/**
 * The item at the top of the public page.
 * topAuto: the featured event with the earliest starts_on that is not past.
 * Ties break by sort_order, then title. A chosen id is used only when it is
 * still in the shelf and not past. No setting means nothing at the top.
 */
export function pickTopItem<T extends TopItem>(
  items: readonly T[],
  settings: { topItemId?: string | null; topAuto?: boolean | null },
  today: string,
): T | null {
  if (settings.topAuto) {
    const ranked = items
      .filter(
        (item) =>
          item.kind === "event" && item.featured === true && Boolean(item.starts_on) && !isPastItem(item, today),
      )
      .slice()
      .sort((a, b) => {
        const left = a.starts_on ?? "";
        const right = b.starts_on ?? "";
        if (left < right) return -1;
        if (left > right) return 1;
        const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (order !== 0) return order;
        if (a.title < b.title) return -1;
        if (a.title > b.title) return 1;
        return 0;
      });
    return ranked[0] ?? null;
  }
  if (settings.topItemId) {
    const item = items.find((row) => row.id === settings.topItemId);
    if (!item || isPastItem(item, today)) return null;
    return item;
  }
  return null;
}

/** A new id list. Moving the first id up, or the last down, leaves the order as it was. */
export function moveItem(ids: readonly string[], id: string, direction: "up" | "down"): string[] {
  return moveKey(ids, id, direction);
}

type BadgeItem = {
  kind: string;
  published?: boolean | null;
  starts_on?: string | null;
  on_shelf?: boolean | null;
};

/** Desk badges. A published event with no start date, and an item kept off the homepage lists. */
export function homeBadges(item: BadgeItem, _today: string): string[] {
  const badges: string[] = [];
  if (item.kind === "event" && item.published === true && !item.starts_on) badges.push("No date");
  if (item.on_shelf === false) badges.push("Not on homepage");
  return badges;
}
