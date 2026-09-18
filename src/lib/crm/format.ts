export const DEFAULT_TZ = "America/Denver";

export function formatWhen(
  iso: string | null | undefined,
  style: "full" | "short" | "date" | "dateLong" | "time" = "full",
  tz = DEFAULT_TZ,
): string {
  if (!iso) return "Date TBA";
  const d = new Date(iso);
  const z: Intl.DateTimeFormatOptions = { timeZone: tz };
  if (style === "time") {
    return d.toLocaleTimeString("en-US", { ...z, hour: "numeric", minute: "2-digit" });
  }
  if (style === "date") {
    return d.toLocaleDateString("en-US", { ...z, month: "short", day: "numeric", year: "numeric" });
  }
  if (style === "dateLong") {
    return d.toLocaleDateString("en-US", {
      ...z,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (style === "short") {
    return d.toLocaleString("en-US", {
      ...z,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleString("en-US", {
    ...z,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function toDatetimeLocal(iso: string, tz = DEFAULT_TZ): string {
  const s = new Date(iso).toLocaleString("sv-SE", { timeZone: tz });
  return s.slice(0, 16).replace(" ", "T");
}

/** Most recent 1 August — school-year start used by Home “quiet schools”. */
export function schoolYearStartIso(now = new Date()): string {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-08-01`;
}

/** Next calendar occurrence of month/day (1-indexed month) as datetime-local. */
export function nextOccasionLocal(
  month: number,
  day: number,
  hour = 17,
  minute = 30,
  now = new Date(),
): string {
  let y = now.getFullYear();
  const candidate = new Date(y, month - 1, day, hour, minute);
  if (candidate.getTime() < now.getTime()) y += 1;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  return `${y}-${mm}-${dd}T${hh}:${mi}`;
}

export function fromDatetimeLocal(local: string, tz = DEFAULT_TZ): string {
  if (!local) return "";
  const [date, timeRaw] = local.split("T");
  const time = (timeRaw ?? "00:00").slice(0, 5);
  const probe = new Date(`${date}T${time}:00Z`);
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/([+-]\d{2}:\d{2})/);
  return `${date}T${time}:00${m?.[1] ?? "-07:00"}`;
}
