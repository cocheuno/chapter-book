export const PERSON_STATUSES = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "moved", label: "Moved away" },
  { key: "deceased", label: "Deceased" },
  { key: "do_not_contact", label: "Do not contact" },
] as const;

export type PersonStatus = (typeof PERSON_STATUSES)[number]["key"];

export function isPersonStatus(value: string): value is PersonStatus {
  return PERSON_STATUSES.some((status) => status.key === value);
}

/** Why a person is left out of an audience, or null when they can be mailed. */
export function audienceSkipReason(p: {
  status?: string | null;
  email_unsubscribed?: boolean | null;
  email?: string | null;
}): "deceased" | "unsubscribed" | "no_email" | null {
  if (p.status === "deceased") return "deceased";
  if (p.status === "do_not_contact" || p.email_unsubscribed) return "unsubscribed";
  if (!p.email) return "no_email";
  return null;
}

export function isContactable(p: {
  status?: string | null;
  email_unsubscribed?: boolean | null;
  email?: string | null;
}): boolean {
  return audienceSkipReason(p) === null;
}

/** A dagger after a deceased person's name. Other statuses add nothing. */
export function deceasedMark(status: string | null | undefined): string {
  return status === "deceased" ? " †" : "";
}

export const CLERGY_CHECK_TITLE = "Check clergy assignments (most change July 1)";

/** True in June. Clergy assignments usually change on July 1. */
export function clergyReminderDue(today: string): boolean {
  return today.slice(5, 7) === "06";
}
