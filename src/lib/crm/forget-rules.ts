/** A unique stand-in name. The first eight id characters keep the no-email name index from clashing. */
export function forgottenLabel(personId: string): string {
  return "Removed person " + personId.slice(0, 8);
}

/** Trimmed, case-insensitive equality. */
export function nameMatches(typed: string, displayName: string): boolean {
  return typed.trim().toLowerCase() === displayName.trim().toLowerCase();
}
