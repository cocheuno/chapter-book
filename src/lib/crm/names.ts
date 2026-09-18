import { composedHonorific } from "./lists.ts";

export function foldName(value: string): string {
  return value
    .trim()
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export type NameParts = {
  religiousTitle?: string | null;
  academicTitle?: string | null;
  honorific?: string | null;
  givenName?: string | null;
  middleName?: string | null;
  middleInitial?: string | null;
  familyName?: string | null;
  suffix?: string | null;
  displayName?: string | null;
};

function formatMiddle(raw: string): string {
  const t = raw.trim().replace(/\.$/, "");
  if (!t) return "";
  return t.length === 1 ? `${t}.` : t;
}

export function splitMiddle(raw: string | null | undefined): {
  middleName: string | null;
  middleInitial: string | null;
} {
  const t = (raw ?? "").trim().replace(/\.$/, "");
  if (!t) return { middleName: null, middleInitial: null };
  return { middleName: t, middleInitial: t[0].toUpperCase() };
}

function attachSuffix(core: string, suffix: string): string {
  if (!suffix) return core;
  if (/^[IVXLC]+$/i.test(suffix)) return `${core} ${suffix}`;
  return `${core}, ${suffix}`;
}

export function composePersonName(p: NameParts): string {
  const honorific = composedHonorific(p.religiousTitle, p.academicTitle) || p.honorific?.trim() || "";
  const given = (p.givenName ?? "").trim();
  const middle = formatMiddle(p.middleName ?? p.middleInitial ?? "");
  const family = (p.familyName ?? "").trim();
  const suffix = (p.suffix ?? "").trim();
  const core = attachSuffix([given, middle, family].filter(Boolean).join(" "), suffix);
  if (!core) return honorific;
  if (!honorific) return core;
  if (foldName(core).startsWith(foldName(honorific))) return core;
  return `${honorific} ${core}`;
}

/** Name as it should appear in lists, even if display_name was saved without a title. */
export function listedName(
  p: NameParts & {
    display_name?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    middle_name?: string | null;
    middle_initial?: string | null;
    religious_title?: string | null;
    academic_title?: string | null;
  },
): string {
  const parts: NameParts = {
    religiousTitle: p.religiousTitle ?? p.religious_title,
    academicTitle: p.academicTitle ?? p.academic_title,
    honorific: p.honorific,
    givenName: p.givenName ?? p.given_name,
    middleName: p.middleName ?? p.middle_name ?? p.middleInitial ?? p.middle_initial,
    familyName: p.familyName ?? p.family_name,
    suffix: p.suffix,
    displayName: p.displayName ?? p.display_name,
  };
  if (parts.givenName || parts.familyName) return composePersonName(parts);
  const stored = (parts.displayName ?? "").trim();
  const honorific = composedHonorific(parts.religiousTitle, parts.academicTitle) || parts.honorific?.trim() || "";
  if (honorific && stored && !foldName(stored).startsWith(foldName(honorific))) return `${honorific} ${stored}`;
  return stored || honorific;
}

export function splitWalkupName(raw: string): { givenName: string; familyName: string | null } {
  const parts = raw.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) return { givenName: "", familyName: null };
  if (parts.length === 1) return { givenName: parts[0], familyName: null };
  return { givenName: parts[0], familyName: parts.slice(1).join(" ") };
}

export function barePersonName(p: {
  given_name?: string | null;
  family_name?: string | null;
  display_name?: string | null;
}): string {
  const g = (p.given_name ?? "").trim();
  const f = (p.family_name ?? "").trim();
  if (g || f) return foldName(`${g} ${f}`);
  return foldName(p.display_name ?? "");
}
