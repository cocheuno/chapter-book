export const IMPORT_MAX_ROWS = 2000;

export const IMPORT_FIELDS = [
  { key: "given_name", label: "Given name" },
  { key: "family_name", label: "Family name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "mobile", label: "Mobile" },
  { key: "street", label: "Street" },
  { key: "street2", label: "Street 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postal_code", label: "Postal code" },
  { key: "country", label: "Country" },
  { key: "website", label: "Website" },
  { key: "religious_title", label: "Religious title" },
  { key: "academic_title", label: "Academic title" },
  { key: "suffix", label: "Suffix" },
  { key: "post_nominals", label: "Post-nominals" },
  { key: "role", label: "Role" },
  { key: "partner", label: "Partner" },
  { key: "notes", label: "Notes" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

export type MappingChoice = ImportField | "ignore";

export type ImportRow = Record<ImportField, string>;

/** Names 100, email 200, notes 2000, every other field 200. */
export const IMPORT_LIMITS: Record<ImportField, number> = {
  given_name: 100,
  family_name: 100,
  email: 200,
  phone: 200,
  mobile: 200,
  street: 200,
  street2: 200,
  city: 200,
  state: 200,
  postal_code: 200,
  country: 200,
  website: 200,
  religious_title: 200,
  academic_title: 200,
  suffix: 200,
  post_nominals: 200,
  role: 200,
  partner: 200,
  notes: 2000,
};

export type ImportRole = { key: string; label: string };

export type ExistingPerson = {
  id: string;
  display_name: string;
  given_name: string;
  family_name: string;
  emails: string[];
  city: string;
  partnerNames: string[];
  phone?: string;
  mobile?: string;
  street?: string;
  street2?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  website?: string;
  religious_title?: string;
  academic_title?: string;
  suffix?: string;
  post_nominals?: string;
  notes?: string;
  roles?: string[];
};

export type ImportKind = "invalid" | "duplicate_in_file" | "match" | "possible_duplicate" | "new";

export type FieldDiff = {
  field: ImportField;
  label: string;
  stored: string;
  file: string;
};

export type ClassifiedRow = {
  index: number;
  kind: ImportKind;
  reason: string;
  personId: string | null;
  personName: string | null;
  differences: FieldDiff[];
  values: ImportRow;
};

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_FIELDS: Record<string, ImportField> = {
  given: "given_name",
  first: "given_name",
  firstname: "given_name",
  "first name": "given_name",
  last: "family_name",
  lastname: "family_name",
  "last name": "family_name",
  surname: "family_name",
  family: "family_name",
  "e mail": "email",
  "e mail address": "email",
  "email address": "email",
  telephone: "phone",
  tel: "phone",
  "phone number": "phone",
  cell: "mobile",
  "cell phone": "mobile",
  "mobile phone": "mobile",
  address: "street",
  "street address": "street",
  "address 1": "street",
  "address line 1": "street",
  "street 1": "street",
  street2: "street2",
  address2: "street2",
  "address 2": "street2",
  "address line 2": "street2",
  apt: "street2",
  apartment: "street2",
  town: "city",
  province: "state",
  "state province": "state",
  zip: "postal_code",
  zipcode: "postal_code",
  "zip code": "postal_code",
  postal: "postal_code",
  postcode: "postal_code",
  "post code": "postal_code",
  url: "website",
  "web site": "website",
  title: "religious_title",
  degree: "academic_title",
  postnominals: "post_nominals",
  credentials: "post_nominals",
  parish: "partner",
  organization: "partner",
  organisation: "partner",
  school: "partner",
  note: "notes",
  comment: "notes",
  comments: "notes",
};

for (const field of IMPORT_FIELDS) {
  const key = normalizeHeader(field.key);
  const label = normalizeHeader(field.label);
  if (!HEADER_FIELDS[key]) HEADER_FIELDS[key] = field.key;
  if (!HEADER_FIELDS[label]) HEADER_FIELDS[label] = field.key;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Trim, lowercase, turn _ and - into spaces, drop other punctuation, collapse spaces. */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyRow(): ImportRow {
  const row = {} as ImportRow;
  for (const field of IMPORT_FIELDS) row[field.key] = "";
  return row;
}

/**
 * RFC-style CSV. A trailing newline does not add a row. Cell text is kept as written.
 * An empty string is no rows.
 */
export function parseCsv(text: string): string[][] {
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  if (source === "") return [];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let touched = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      touched = true;
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cell += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      touched = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      touched = false;
      continue;
    }
    if (char === "\r" || char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      touched = false;
      if (char === "\r" && source[i + 1] === "\n") i++;
      continue;
    }
    cell += char;
    touched = true;
  }
  if (touched || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** One field, or "ignore", for each header. The same field may be chosen twice. */
export function guessMapping(headers: readonly string[]): MappingChoice[] {
  return headers.map((header) => HEADER_FIELDS[normalizeHeader(header)] ?? "ignore");
}

/**
 * `table[0]` is the header row. The first non-blank cell wins when two columns
 * map to the same field. Cells are trimmed. Missing fields are "".
 */
export function mapRows(
  table: readonly (readonly string[])[],
  mapping: readonly MappingChoice[],
): ImportRow[] {
  const out: ImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r] ?? [];
    const row = emptyRow();
    for (let c = 0; c < mapping.length; c++) {
      const field = mapping[c];
      if (!field || field === "ignore") continue;
      const value = (cells[c] ?? "").trim();
      if (!value || row[field]) continue;
      row[field] = value;
    }
    out.push(row);
  }
  return out;
}

/** A PERSON_ROLES key when the text matches a key or label, otherwise "friend". */
export function roleKey(value: string, roles: readonly ImportRole[]): string {
  const text = norm(value);
  if (!text) return "friend";
  const hit = roles.find((role) => norm(role.key) === text || norm(role.label) === text);
  return hit ? hit.key : "friend";
}

export function formatDifference(diff: FieldDiff): string {
  return `${diff.label}: ${diff.stored} → ${diff.file}`;
}

function invalidReason(row: ImportRow): string {
  if (!norm(row.given_name) || !norm(row.family_name)) return "Missing a first or last name.";
  const email = row.email.trim();
  if (email && !EMAIL_ADDRESS.test(email)) return "Email is not an address.";
  return "";
}

function nameCityKey(row: ImportRow): string {
  return `${norm(row.given_name)}\n${norm(row.family_name)}\n${norm(row.city)}`;
}

function plainStored(person: ExistingPerson, field: ImportField): string {
  switch (field) {
    case "given_name":
      return person.given_name ?? "";
    case "family_name":
      return person.family_name ?? "";
    case "phone":
      return person.phone ?? "";
    case "mobile":
      return person.mobile ?? "";
    case "street":
      return person.street ?? "";
    case "street2":
      return person.street2 ?? "";
    case "city":
      return person.city ?? "";
    case "state":
      return person.state ?? "";
    case "postal_code":
      return person.postal_code ?? "";
    case "country":
      return person.country ?? "";
    case "website":
      return person.website ?? "";
    case "religious_title":
      return person.religious_title ?? "";
    case "academic_title":
      return person.academic_title ?? "";
    case "suffix":
      return person.suffix ?? "";
    case "post_nominals":
      return person.post_nominals ?? "";
    case "notes":
      return person.notes ?? "";
    default:
      return "";
  }
}

function roleStored(person: ExistingPerson, roles: readonly ImportRole[]): string {
  return (person.roles ?? [])
    .map((key) => roles.find((role) => role.key === key)?.label ?? key)
    .join(", ");
}

function partnerStored(person: ExistingPerson): string {
  return (person.partnerNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
}

function roleMatches(
  fileRole: string,
  person: ExistingPerson,
  roles: readonly ImportRole[],
): boolean {
  const text = norm(fileRole);
  const stored = (person.roles ?? []).map((key) => norm(key));
  if (roles.length === 0) return stored.includes(text);
  const hit = roles.find((role) => norm(role.key) === text || norm(role.label) === text);
  if (!hit) return false;
  return stored.includes(norm(hit.key));
}

function differences(
  row: ImportRow,
  person: ExistingPerson,
  roles: readonly ImportRole[],
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of IMPORT_FIELDS) {
    if (field.key === "email") continue;
    const file = row[field.key].trim();
    if (!file) continue;
    if (field.key === "role") {
      if (roleMatches(file, person, roles)) continue;
      diffs.push({ field: field.key, label: field.label, stored: roleStored(person, roles), file });
      continue;
    }
    if (field.key === "partner") {
      const names = person.partnerNames ?? [];
      if (names.some((name) => norm(name) === norm(file))) continue;
      diffs.push({ field: field.key, label: field.label, stored: partnerStored(person), file });
      continue;
    }
    const stored = plainStored(person, field.key).trim();
    if (norm(stored) === norm(file)) continue;
    diffs.push({ field: field.key, label: field.label, stored, file });
  }
  return diffs;
}

function blankClassified(
  index: number,
  row: ImportRow,
  kind: ImportKind,
  reason: string,
): ClassifiedRow {
  return {
    index,
    kind,
    reason,
    personId: null,
    personName: null,
    differences: [],
    values: row,
  };
}

function findByEmail(
  row: ImportRow,
  existing: readonly ExistingPerson[],
): ExistingPerson | undefined {
  const email = norm(row.email);
  if (!email) return undefined;
  return existing.find((person) => person.emails.some((item) => norm(item) === email));
}

function findPossible(
  row: ImportRow,
  existing: readonly ExistingPerson[],
): ExistingPerson | undefined {
  const given = norm(row.given_name);
  const family = norm(row.family_name);
  const city = norm(row.city);
  const partner = norm(row.partner);
  return existing.find((person) => {
    if (norm(person.given_name) !== given || norm(person.family_name) !== family) return false;
    if (norm(person.city) === city) return true;
    if (!partner) return false;
    return (person.partnerNames ?? []).some((name) => norm(name) === partner);
  });
}

/**
 * One class per row, in order: invalid, duplicate_in_file, match, possible_duplicate, new.
 * Duplicate checks look at earlier rows that were not invalid. Blank emails do not match
 * each other. Both-blank cities count as the same city.
 */
export function classifyRows(
  rows: readonly ImportRow[],
  existing: readonly ExistingPerson[],
  roles: readonly ImportRole[] = [],
): ClassifiedRow[] {
  const seenEmails = new Set<string>();
  const seenNameCity = new Set<string>();
  const out: ClassifiedRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const invalid = invalidReason(row);
    if (invalid) {
      out.push(blankClassified(index, row, "invalid", invalid));
      continue;
    }
    const email = norm(row.email);
    const nameCity = nameCityKey(row);
    if ((email && seenEmails.has(email)) || seenNameCity.has(nameCity)) {
      const reason =
        email && seenEmails.has(email)
          ? "Same email as an earlier row."
          : "Same name and city as an earlier row.";
      out.push(blankClassified(index, row, "duplicate_in_file", reason));
      if (email) seenEmails.add(email);
      seenNameCity.add(nameCity);
      continue;
    }
    const match = findByEmail(row, existing);
    if (match) {
      const item = blankClassified(index, row, "match", "");
      item.personId = match.id;
      item.personName = match.display_name;
      item.differences = differences(row, match, roles);
      out.push(item);
      if (email) seenEmails.add(email);
      seenNameCity.add(nameCity);
      continue;
    }
    const similar = findPossible(row, existing);
    if (similar) {
      const item = blankClassified(index, row, "possible_duplicate", "");
      item.personId = similar.id;
      item.personName = similar.display_name;
      out.push(item);
      if (email) seenEmails.add(email);
      seenNameCity.add(nameCity);
      continue;
    }
    out.push(blankClassified(index, row, "new", ""));
    if (email) seenEmails.add(email);
    seenNameCity.add(nameCity);
  }
  return out;
}
