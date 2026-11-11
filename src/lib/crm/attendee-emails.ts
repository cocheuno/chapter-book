import { csvRow } from "./csv.ts";

export type Who = "yes" | "came" | "open";

export type AttendeeEmailRow = {
  personId: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  guestStatus: string | null;
  checkedIn: boolean;
  unsubscribed: boolean;
  status: string | null;
  forgotten: boolean;
};

export type AttendeeContact = {
  first: string;
  last: string;
  email: string;
};

export type MissingAttendee = {
  personId: string;
  displayName: string;
};

export type AttendeeEmailList = {
  contacts: AttendeeContact[];
  bcc: string;
  included: number;
  missing: MissingAttendee[];
  optedOut: number;
};

function matchesWho(row: AttendeeEmailRow, who: Who): boolean {
  const status = row.guestStatus ?? "";
  if (who === "yes") return status === "attending" || status === "attended";
  if (who === "came") return status === "attended" || row.checkedIn;
  return status !== "declined";
}

function isOptedOut(row: AttendeeEmailRow): boolean {
  if (row.forgotten || row.unsubscribed) return true;
  return row.status === "do_not_contact" || row.status === "deceased";
}

function contactNames(row: AttendeeEmailRow): { first: string; last: string } {
  const given = (row.givenName ?? "").trim();
  const family = (row.familyName ?? "").trim();
  if (!given && !family) return { first: row.displayName, last: "" };
  return { first: given, last: family };
}

/** Guests for one message: matching rows, with opt-outs and blank addresses left out. */
export function attendeeEmailList(rows: readonly AttendeeEmailRow[], who: Who): AttendeeEmailList {
  let optedOut = 0;
  const missing: MissingAttendee[] = [];
  const contacts: AttendeeContact[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!matchesWho(row, who)) continue;
    if (isOptedOut(row)) {
      optedOut += 1;
      continue;
    }
    const email = (row.email ?? "").trim().toLowerCase();
    if (!email) {
      missing.push({ personId: row.personId, displayName: row.displayName });
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const names = contactNames(row);
    contacts.push({ first: names.first, last: names.last, email });
  }
  missing.sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.personId.localeCompare(b.personId),
  );
  contacts.sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
  return {
    contacts,
    bcc: contacts.map((contact) => contact.email).join("; "),
    included: contacts.length,
    missing,
    optedOut,
  };
}

/** Outlook CSV. The page adds the byte-order mark when it downloads the file. */
export function attendeeEmailCsv(contacts: readonly AttendeeContact[]): string {
  const lines = [
    csvRow(["First Name", "Last Name", "E-mail Address"]),
    ...contacts.map((contact) => csvRow([contact.first, contact.last, contact.email])),
  ];
  return lines.join("\r\n");
}

/** Download name. The title becomes lowercase letters, digits, and hyphens, at most 40 characters. */
export function attendeeEmailFilename(eventTitle: string, who: Who): string {
  const slug = eventTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `attendee-emails-${slug}-${who}.csv`;
}
