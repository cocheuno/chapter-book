export function nid(): string {
  return crypto.randomUUID();
}

export function lowerEmail(email: string | null | undefined): string | null {
  const t = email?.trim().toLowerCase();
  return t ? t : null;
}

export function partySizeInRange(n: number | undefined): number {
  const v = Math.floor(Number(n ?? 1));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(100, v);
}
