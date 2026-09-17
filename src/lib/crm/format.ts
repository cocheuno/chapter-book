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
