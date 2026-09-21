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

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return s || "page";
}
