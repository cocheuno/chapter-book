import { CONFERENCE_CHECKLIST, GOLD_MASS_CHECKLIST } from "./constants.ts";

export function checklistFor(typeKey: string) {
  return typeKey === "conference" ? CONFERENCE_CHECKLIST : GOLD_MASS_CHECKLIST;
}

export function checklistDueOn(startDate: string, offsetDays: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function checklistPlan(typeKey: string, startDate: string): {
  key: string;
  title: string;
  hat: string;
  skippable: boolean;
  dueOn: string;
}[] {
  return checklistFor(typeKey).map((item) => ({
    key: item.key,
    title: item.title,
    hat: item.hat,
    skippable: item.skippable,
    dueOn: checklistDueOn(startDate, item.offsetDays),
  }));
}

export function missingChecklistItems(
  typeKey: string,
  startDate: string,
  existingKeys: Iterable<string | null>,
): { key: string; title: string; hat: string; skippable: boolean; dueOn: string }[] {
  const have = new Set(existingKeys);
  return checklistPlan(typeKey, startDate).filter((item) => !have.has(item.key));
}
