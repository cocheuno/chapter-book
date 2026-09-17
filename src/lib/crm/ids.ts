export function nid(): string {
  return crypto.randomUUID();
}

export function lowerEmail(email: string | null | undefined): string | null {
  const t = email?.trim().toLowerCase();
  return t ? t : null;
}
