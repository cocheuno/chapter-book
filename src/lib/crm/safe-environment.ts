/** Columns on persons. Order is the audit `changed` order and the migration order. */
export const SAFE_ENV_FIELDS = [
  "works_with_minors",
  "safe_env_program",
  "safe_env_trained_on",
  "safe_env_diocese",
  "background_check_on",
  "background_check_expires_on",
  "suitability_requested_on",
  "suitability_received_on",
  "suitability_expires_on",
] as const;

export type SafeEnvField = (typeof SAFE_ENV_FIELDS)[number];

export type Clearance = "not_needed" | "cleared" | "expired" | "missing";

export type SafeEnvPerson = {
  works_with_minors: boolean;
  safe_env_program: string | null;
  safe_env_trained_on: string | null;
  safe_env_diocese: string | null;
  background_check_on: string | null;
  background_check_expires_on: string | null;
  suitability_requested_on: string | null;
  suitability_received_on: string | null;
  suitability_expires_on: string | null;
};

export type SafeEnvView = SafeEnvPerson & {
  clearance: Clearance;
  soonestExpiry: string | null;
};

export type SafeEnvListRow = {
  display_name: string;
  clearance: Clearance;
  soonestExpiry: string | null;
};

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

/** A real calendar date, or false for blanks and impossible days such as 2026-02-31. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function dateValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return isIsoDate(text) ? text : null;
}

export function readSafeEnvironment(row: object): SafeEnvPerson {
  const record = row as Record<string, unknown>;
  return {
    works_with_minors: record.works_with_minors === true,
    safe_env_program: textValue(record.safe_env_program),
    safe_env_trained_on: dateValue(record.safe_env_trained_on),
    safe_env_diocese: textValue(record.safe_env_diocese),
    background_check_on: dateValue(record.background_check_on),
    background_check_expires_on: dateValue(record.background_check_expires_on),
    suitability_requested_on: dateValue(record.suitability_requested_on),
    suitability_received_on: dateValue(record.suitability_received_on),
    suitability_expires_on: dateValue(record.suitability_expires_on),
  };
}

/** Copy with the nine columns removed. Other person fields stay. */
export function withoutSafeEnvironment<T extends object>(row: T): Omit<T, SafeEnvField> {
  const copy = { ...row } as Record<string, unknown>;
  for (const field of SAFE_ENV_FIELDS) delete copy[field];
  return copy as Omit<T, SafeEnvField>;
}

/**
 * 1. Not working with minors → not needed.
 * 2. A background-check expiry before today, or a requested suitability whose expiry
 *    is before today → expired. A date equal to today is still current.
 * 3. Missing training, missing background-check date, or a requested suitability
 *    with no received date → missing.
 * 4. Otherwise cleared. Expired wins over missing.
 */
export function clearance(person: SafeEnvPerson, today: string): Clearance {
  if (!person.works_with_minors) return "not_needed";
  const backgroundExpires = dateValue(person.background_check_expires_on);
  const suitabilityRequested = dateValue(person.suitability_requested_on);
  const suitabilityExpires = dateValue(person.suitability_expires_on);
  if (
    (backgroundExpires != null && backgroundExpires < today) ||
    (suitabilityRequested != null && suitabilityExpires != null && suitabilityExpires < today)
  ) {
    return "expired";
  }
  if (
    dateValue(person.safe_env_trained_on) == null ||
    dateValue(person.background_check_on) == null ||
    (suitabilityRequested != null && dateValue(person.suitability_received_on) == null)
  ) {
    return "missing";
  }
  return "cleared";
}

/** Earlier of the two expiry dates that are set, or null when neither is. */
export function soonestExpiry(person: SafeEnvPerson): string | null {
  const dates = [
    dateValue(person.background_check_expires_on),
    dateValue(person.suitability_expires_on),
  ].filter((value): value is string => value != null);
  if (dates.length === 0) return null;
  dates.sort();
  return dates[0] ?? null;
}

export function clearanceLabel(status: Clearance): string {
  switch (status) {
    case "not_needed":
      return "Not needed";
    case "cleared":
      return "Cleared";
    case "expired":
      return "Not cleared — expired";
    case "missing":
      return "Not cleared — missing";
  }
}

/** Editors and admins see the nine fields. Every other role gets null. */
export function safeEnvironmentView(
  role: string,
  person: SafeEnvPerson,
  today: string,
): SafeEnvView | null {
  if (role !== "admin" && role !== "editor") return null;
  const clean = readSafeEnvironment(person);
  return {
    ...clean,
    clearance: clearance(clean, today),
    soonestExpiry: soonestExpiry(clean),
  };
}

export function changedSafeEnvFields(before: SafeEnvPerson, after: SafeEnvPerson): SafeEnvField[] {
  const left = readSafeEnvironment(before);
  const right = readSafeEnvironment(after);
  return SAFE_ENV_FIELDS.filter((field) => left[field] !== right[field]);
}

function safeEnvBlank(person: SafeEnvPerson): boolean {
  const clean = readSafeEnvironment(person);
  if (clean.works_with_minors) return false;
  return SAFE_ENV_FIELDS.slice(1).every((field) => clean[field] == null);
}

function safeEnvAny(person: SafeEnvPerson): boolean {
  const clean = readSafeEnvironment(person);
  if (clean.works_with_minors) return true;
  return SAFE_ENV_FIELDS.slice(1).some((field) => clean[field] != null);
}

/**
 * The other person's nine fields, as one block, or null when the kept record
 * should stay as it is. Never a mix of the two records.
 */
export function safeEnvToCopy(kept: SafeEnvPerson, other: SafeEnvPerson): SafeEnvPerson | null {
  if (!safeEnvBlank(kept) || !safeEnvAny(other)) return null;
  return readSafeEnvironment(other);
}

/** Not cleared first, then the earliest expiry (empty last), then the name. */
export function sortSafeEnvironment<T extends SafeEnvListRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const rank = (row: SafeEnvListRow) => (row.clearance === "cleared" ? 1 : 0);
    const byStatus = rank(a) - rank(b);
    if (byStatus !== 0) return byStatus;
    const left = a.soonestExpiry ?? "\uffff";
    const right = b.soonestExpiry ?? "\uffff";
    if (left !== right) return left < right ? -1 : 1;
    return a.display_name.localeCompare(b.display_name, "en", { sensitivity: "base" });
  });
}
