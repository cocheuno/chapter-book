/** Order of the six blocks on a conference web page. A null database value means this order. */

export const CONFERENCE_SECTIONS = [
  { key: "program", label: "Program (agenda)" },
  { key: "speakers", label: "Speakers" },
  { key: "workshops", label: "Workshops" },
  { key: "notes", label: "Practical notes" },
  { key: "about", label: "The gathering" },
  { key: "visit", label: "When and where" },
] as const;

export type ConferenceSectionKey = (typeof CONFERENCE_SECTIONS)[number]["key"];

const DEFAULT_ORDER: readonly ConferenceSectionKey[] = CONFERENCE_SECTIONS.map(
  (section) => section.key,
);

const KNOWN = new Set<string>(DEFAULT_ORDER);

export function sectionLabel(key: ConferenceSectionKey): string {
  for (const section of CONFERENCE_SECTIONS) {
    if (section.key === key) return section.label;
  }
  return key;
}

/** Split a saved list, drop unknown and repeated keys, then append anything missing. */
export function parseSectionOrder(text: string | null | undefined): ConferenceSectionKey[] {
  const seen = new Set<ConferenceSectionKey>();
  const ordered: ConferenceSectionKey[] = [];
  if (text && text.trim()) {
    for (const part of text.split(",")) {
      const key = part.trim().toLowerCase();
      if (!KNOWN.has(key) || seen.has(key as ConferenceSectionKey)) continue;
      const typed = key as ConferenceSectionKey;
      seen.add(typed);
      ordered.push(typed);
    }
  }
  for (const key of DEFAULT_ORDER) {
    if (!seen.has(key)) ordered.push(key);
  }
  return ordered;
}

/** Null means "the default order" and is what the database stores when nothing custom is chosen. */
export function serializeSectionOrder(keys: readonly string[]): string | null {
  if (
    keys.length === DEFAULT_ORDER.length &&
    keys.every((key, index) => key === DEFAULT_ORDER[index])
  ) {
    return null;
  }
  return keys.join(",");
}

/** A new list. Moving the first section up, or the last down, leaves the order as it was. */
export function moveSection(
  keys: readonly ConferenceSectionKey[],
  key: ConferenceSectionKey,
  direction: "up" | "down",
): ConferenceSectionKey[] {
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
