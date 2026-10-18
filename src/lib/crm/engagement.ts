/**
 * A person-party row counts as attended when the guest status is attended,
 * or when a check-in time is stored.
 */
export function countsAsAttended(
  guestStatus: string | null | undefined,
  checkedInAt: Date | string | null | undefined,
): boolean {
  if (guestStatus === "attended") return true;
  if (checkedInAt == null) return false;
  if (checkedInAt instanceof Date) return !Number.isNaN(checkedInAt.getTime());
  return checkedInAt.trim() !== "";
}

/** The person-page line. No date when they have not attended. */
export function attendanceLine(count: number, lastDate: string | null): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (n === 0 || !lastDate) return n === 0 ? "Events attended: 0" : `Events attended: ${n}`;
  return `Events attended: ${n} · last: ${lastDate}`;
}

/** The partner-page line. */
export function houseAttendanceLine(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `People who came through this house: ${n}`;
}
