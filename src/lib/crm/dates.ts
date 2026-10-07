export const CHAPTER_TIME_ZONE = "America/Chicago";

/** Today's calendar date in a time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/**
 * Undated items are never past. Events end on ends_on, or starts_on.
 * Announcements and courses end on ends_on ("Show until"). Other kinds are never past.
 */
export function isPastItem(
  item: { kind: string; starts_on?: string | null; ends_on?: string | null },
  today: string,
): boolean {
  const end =
    item.kind === "event"
      ? item.ends_on || item.starts_on || null
      : item.kind === "announcement" || item.kind === "course"
        ? item.ends_on || null
        : null;
  return end != null && end < today;
}

/**
 * Dated events first by starts_on, then undated events in their current order.
 * Each event keeps one of the events' original positions, so non-events never move.
 * With no dated events the result equals the input.
 */
export function orderEvents<T extends { kind: string; starts_on?: string | null }>(items: T[]): T[] {
  const slots: number[] = [];
  const dated: { item: T; index: number }[] = [];
  const undated: T[] = [];
  items.forEach((item, index) => {
    if (item.kind !== "event") return;
    slots.push(index);
    if (item.starts_on) dated.push({ item, index });
    else undated.push(item);
  });
  if (dated.length === 0) return items;
  dated.sort((a, b) => {
    const left = a.item.starts_on ?? "";
    const right = b.item.starts_on ?? "";
    if (left < right) return -1;
    if (left > right) return 1;
    return a.index - b.index;
  });
  const next = items.slice();
  const ordered = [...dated.map((entry) => entry.item), ...undated];
  slots.forEach((slot, index) => {
    next[slot] = ordered[index];
  });
  return next;
}

type DayParts = { weekday: string; month: string; day: string; year: string };

function dayParts(iso: string): DayParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).formatToParts(new Date(`${iso}T00:00:00Z`));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: value("weekday"), month: value("month"), day: value("day"), year: value("year") };
}

/** "When" text from dates, or null. Needs starts_on; ends_on alone (Show until) gives null. */
export function whenLabelFor(startsOn?: string | null, endsOn?: string | null): string | null {
  if (!startsOn) return null;
  const start = dayParts(startsOn);
  if (!endsOn || endsOn === startsOn) {
    return `${start.weekday}, ${start.month} ${start.day}, ${start.year}`;
  }
  const end = dayParts(endsOn);
  if (start.year === end.year && start.month === end.month) {
    return `${start.weekday}–${end.weekday}, ${start.month} ${start.day}–${end.day}, ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.weekday}, ${start.month} ${start.day} – ${end.weekday}, ${end.month} ${end.day}, ${end.year}`;
  }
  return `${start.weekday}, ${start.month} ${start.day}, ${start.year} – ${end.weekday}, ${end.month} ${end.day}, ${end.year}`;
}

/**
 * The item with when_label filled from its dates when when_label is blank.
 * Otherwise the item is returned unchanged; when there are no dates, keep the original value.
 */
export function withWhenText<
  T extends { when_label: string | null; starts_on?: string | null; ends_on?: string | null },
>(item: T): T {
  if (item.when_label?.trim()) return item;
  const label = whenLabelFor(item.starts_on, item.ends_on);
  if (!label) return item;
  return { ...item, when_label: label };
}
