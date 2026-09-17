import { barePersonName, foldName } from "./names";

export { foldName };

export type PersonHit = { id: string; name: string; email: string | null; reason: "email" | "name" };

export function matchPerson(
  people: {
    id: string;
    display_name: string;
    email: string | null;
    given_name?: string | null;
    family_name?: string | null;
  }[],
  name: string,
  email: string,
  exceptId?: string,
): { hard: PersonHit | null; soft: PersonHit | null } {
  const em = email.trim().toLowerCase();
  const n = foldName(name);
  const pool = exceptId ? people.filter((p) => p.id !== exceptId) : people;
  if (em) {
    const byEmail = pool.find((p) => (p.email ?? "").toLowerCase() === em);
    if (byEmail) {
      return {
        hard: { id: byEmail.id, name: byEmail.display_name, email: byEmail.email, reason: "email" },
        soft: null,
      };
    }
  }
  if (n.length < 2) return { hard: null, soft: null };
  const byName = pool.find((p) => {
    const listed = foldName(p.display_name);
    const bare = barePersonName(p);
    return listed === n || (bare.length >= 2 && bare === n);
  });
  if (!byName) return { hard: null, soft: null };
  const hit: PersonHit = { id: byName.id, name: byName.display_name, email: byName.email, reason: "name" };
  if (!em) return { hard: hit, soft: null };
  return { hard: null, soft: hit };
}

export function matchPartner(
  orgs: { id: string; name: string; city: string | null }[],
  name: string,
  city: string,
  exceptId?: string,
): {
  hard: { id: string; name: string; city: string | null } | null;
  soft: { id: string; name: string; city: string | null } | null;
} {
  const n = foldName(name);
  const c = city.trim().toLowerCase();
  const pool = exceptId ? orgs.filter((o) => o.id !== exceptId) : orgs;
  if (n.length < 2) return { hard: null, soft: null };
  const hard = pool.find((o) => foldName(o.name) === n && (o.city ?? "").toLowerCase() === c);
  if (hard) return { hard, soft: null };
  const soft = pool.find((o) => foldName(o.name) === n);
  return { hard: null, soft: soft ?? null };
}

export function matchEventTitle(
  events: { id: string; title: string; status?: string }[],
  title: string,
): { id: string; title: string } | null {
  const n = foldName(title);
  if (n.length < 2) return null;
  const hit = events.find((e) => e.status !== "cancelled" && foldName(e.title) === n);
  return hit ? { id: hit.id, title: hit.title } : null;
}
