/** iCalendar text for a public event page. Pure: no database and no clock of its own. */

export function calendarHref(page: {
  kind: string;
  slug: string | null;
  starts_on?: string | null;
  published?: boolean;
}): string | null {
  if (page.kind !== "event" || !page.slug || !page.starts_on || page.published === false) return null;
  return `/p/${page.slug}/calendar.ics`;
}

/** Escape a TEXT value for iCalendar. Backslash first, so the escapes themselves stay literal. */
export function icsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\r", "\\n")
    .replaceAll("\n", "\\n");
}

const utf8 = new TextEncoder();
const utf8Text = new TextDecoder();

/** Fold at 75 UTF-8 octets. A continuation is CRLF, a space, then at most 74 octets. */
export function foldLine(line: string): string {
  const bytes = utf8.encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let offset = 0;
  let budget = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + budget, bytes.length);
    while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end <= offset) end = Math.min(offset + 1, bytes.length);
    parts.push(utf8Text.decode(bytes.subarray(offset, end)));
    offset = end;
    budget = 74;
  }
  return parts.join("\r\n ");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function stampUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function dateStamp(iso: string): string {
  return iso.replaceAll("-", "");
}

/** The calendar day after YYYY-MM-DD, as YYYYMMDD. ICS all-day DTEND is exclusive. */
function dayAfter(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return dateStamp(iso);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function filled(value: string | null): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

export function calendarFile(input: {
  uid: string;
  title: string;
  location: string | null;
  description: string | null;
  url: string | null;
  startsOn: string;
  endsOn: string | null;
  timed: { startsAt: string; endsAt: string | null } | null;
  now: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chapter Book//Public pages//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${stampUtc(input.now)}`,
  ];
  if (input.timed) {
    lines.push(`DTSTART:${stampUtc(new Date(input.timed.startsAt))}`);
    const end = input.timed.endsAt;
    if (end && new Date(end).getTime() > new Date(input.timed.startsAt).getTime()) {
      lines.push(`DTEND:${stampUtc(new Date(end))}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(input.startsOn)}`);
    lines.push(`DTEND;VALUE=DATE:${dayAfter(input.endsOn ?? input.startsOn)}`);
  }
  lines.push(`SUMMARY:${icsText(input.title)}`);
  const location = filled(input.location);
  if (location) lines.push(`LOCATION:${icsText(location)}`);
  const description = filled(input.description);
  if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
