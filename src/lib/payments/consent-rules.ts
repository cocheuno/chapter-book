export const GUARDIAN_NAME_MAX = 200;
export const GUARDIAN_PHONE_MAX = 40;
export const GUARDIAN_EMAIL_MAX = 200;
export const RELATIONSHIP_MAX = 100;
export const EMERGENCY_NAME_MAX = 200;
export const EMERGENCY_PHONE_MAX = 40;
export const MEDICAL_NOTES_MAX = 2000;
export const SIGNATURE_MAX = 200;

/** Days after the event's last day before medical and emergency details can be deleted. */
export const CONSENT_PURGE_DAYS = 30;

export type GuardianConsentInput = {
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  relationship: string;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes?: string;
  photoRelease: boolean;
  agreed: boolean;
  signature: string;
};

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function tooLong(label: string, value: string, max: number): string | null {
  if (value.length <= max) return null;
  return `${label} must be ${max} characters or fewer.`;
}

/** Reasons a guardian signature cannot be stored. Empty when the form is complete. */
export function guardianConsentErrors(input: GuardianConsentInput): string[] {
  const errors: string[] = [];
  const name = trimmed(input.guardianName);
  const phone = trimmed(input.guardianPhone);
  const email = trimmed(input.guardianEmail);
  const relationship = trimmed(input.relationship);
  const emergencyName = trimmed(input.emergencyName);
  const emergencyPhone = trimmed(input.emergencyPhone);
  const medical = trimmed(input.medicalNotes);
  const signature = trimmed(input.signature);

  if (!name) errors.push("Enter the guardian's name.");
  else {
    const message = tooLong("Guardian name", name, GUARDIAN_NAME_MAX);
    if (message) errors.push(message);
  }

  if (!phone) errors.push("Enter the guardian's phone.");
  else {
    const message = tooLong("Guardian phone", phone, GUARDIAN_PHONE_MAX);
    if (message) errors.push(message);
  }

  if (!email) errors.push("Enter the guardian's email.");
  else {
    const message = tooLong("Guardian email", email, GUARDIAN_EMAIL_MAX);
    if (message) errors.push(message);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Enter a valid guardian email.");
    }
  }

  if (!relationship) errors.push("Enter the guardian's relationship to the student.");
  else {
    const message = tooLong("Relationship", relationship, RELATIONSHIP_MAX);
    if (message) errors.push(message);
  }

  if (!emergencyName) errors.push("Enter an emergency contact name.");
  else {
    const message = tooLong("Emergency contact name", emergencyName, EMERGENCY_NAME_MAX);
    if (message) errors.push(message);
  }

  if (!emergencyPhone) errors.push("Enter an emergency contact phone.");
  else {
    const message = tooLong("Emergency contact phone", emergencyPhone, EMERGENCY_PHONE_MAX);
    if (message) errors.push(message);
  }

  const medicalMessage = tooLong("Medical notes", medical, MEDICAL_NOTES_MAX);
  if (medicalMessage) errors.push(medicalMessage);

  if (input.agreed !== true) errors.push("Tick the box to agree.");

  if (!signature) errors.push("Type the guardian's full name to sign.");
  else {
    const message = tooLong("Signature", signature, SIGNATURE_MAX);
    if (message) errors.push(message);
    else if (name && signature.toLowerCase() !== name.toLowerCase()) {
      errors.push("Type the guardian's full name to sign.");
    }
  }

  return errors;
}

/** Paper consent records a name and phone. The rest of the form is not on the paper path. */
export function paperConsentErrors(input: { guardianName: string; guardianPhone: string }): string[] {
  const errors: string[] = [];
  const name = trimmed(input.guardianName);
  const phone = trimmed(input.guardianPhone);
  if (!name) errors.push("Enter the guardian's name.");
  else {
    const message = tooLong("Guardian name", name, GUARDIAN_NAME_MAX);
    if (message) errors.push(message);
  }
  if (!phone) errors.push("Enter the guardian's phone.");
  else {
    const message = tooLong("Guardian phone", phone, GUARDIAN_PHONE_MAX);
    if (message) errors.push(message);
  }
  return errors;
}

/** First name and last initial, for a page a parent opens from a forwarded link. */
export function studentPublicName(givenName: string, familyName: string): string {
  const given = trimmed(givenName);
  const family = trimmed(familyName);
  const initial = family ? `${family.charAt(0).toUpperCase()}.` : "";
  return [given, initial].filter(Boolean).join(" ");
}

function plusDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The event's last calendar day in its time zone.
 * `ends_at` wins. With no end, the start is the last day. Missing both stays closed.
 */
export function eventLastDay(
  startsAt: Date | string | null | undefined,
  endsAt: Date | string | null | undefined,
  timeZone: string,
): string | null {
  const raw = endsAt ?? startsAt;
  if (raw == null || raw === "") return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone.trim() || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/** True on the day that is `CONSENT_PURGE_DAYS` after `lastDay`, and every day after that. */
export function consentDetailsPurgeOpen(lastDay: string | null, today: string): boolean {
  if (!lastDay || !/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return today >= plusDays(lastDay, CONSENT_PURGE_DAYS);
}
