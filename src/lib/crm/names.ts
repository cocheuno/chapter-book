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
  postNominals?: string | null;
};

export function titleKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[.\s]/g, "");
}

export function postNominalsText(raw: string | null | undefined): string {
  return (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

const DOCTORATES = ["phd", "md", "scd", "dsc", "dphil", "edd", "do", "pharmd", "psyd", "std", "jcd", "thd", "dmin"];

export function hasDoctorate(postNominals: string | null | undefined): boolean {
  return (postNominals ?? "")
    .split(",")
    .map((part) => titleKey(part))
    .some((key) => DOCTORATES.includes(key));
}

export function isDegreeTitle(title: string | null | undefined): boolean {
  return ["phd", "md", "scd", "msc", "ma", "bs"].includes(titleKey(title));
}

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
  let honorific = composedHonorific(p.religiousTitle, p.academicTitle) || p.honorific?.trim() || "";
  const given = (p.givenName ?? "").trim();
  const middle = formatMiddle(p.middleName ?? p.middleInitial ?? "");
  const family = (p.familyName ?? "").trim();
  const suffix = (p.suffix ?? "").trim();
  const core = attachSuffix([given, middle, family].filter(Boolean).join(" "), suffix);
  const posts = postNominalsText(p.postNominals);
  if (
    posts &&
    core &&
    !(p.religiousTitle ?? "").trim() &&
    titleKey(p.academicTitle) === "dr" &&
    hasDoctorate(p.postNominals)
  ) {
    honorific = "";
  }
  let result: string;
  if (!core) result = honorific;
  else if (!honorific) result = core;
  else if (foldName(core).startsWith(foldName(honorific))) result = core;
  else result = `${honorific} ${core}`;
  if (posts && core) return `${result}, ${posts}`;
  return result;
}

export function salutation(p: {
  religiousTitle?: string | null;
  academicTitle?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  postNominals?: string | null;
  salutationOverride?: string | null;
}): string {
  const override = p.salutationOverride ?? "";
  if (override.trim()) return override;
  const given = (p.givenName ?? "").trim();
  const family = (p.familyName ?? "").trim();
  const last = family || given;
  const first = given || family;
  const religious = titleKey(p.religiousTitle);
  if (religious === "pope") return "Your Holiness";
  if (religious === "cardinal") return "Your Eminence";
  if (religious === "mostrev" || religious === "bishop") return `Dear Bishop ${last}`.trim();
  if (religious === "abbot") return "Dear Father Abbot";
  if (religious === "msgr") return `Dear Monsignor ${last}`.trim();
  if (religious === "rev" || religious === "fr" || religious === "veryrev" || religious === "revdr") {
    return `Dear Father ${last}`.trim();
  }
  if (religious === "deacon" || religious === "dcn") return `Dear Deacon ${last}`.trim();
  if (religious === "sr") return `Dear Sister ${first}`.trim();
  if (religious === "mother") return `Dear Mother ${first}`.trim();
  if (religious === "br") return `Dear Brother ${first}`.trim();
  const academic = titleKey(p.academicTitle);
  if (academic === "dr" || academic === "phd" || academic === "md" || academic === "scd") {
    return `Dear Dr. ${last}`.trim();
  }
  if (academic === "prof" || academic === "profdr") return `Dear Professor ${last}`.trim();
  if (hasDoctorate(p.postNominals)) return `Dear Dr. ${last}`.trim();
  const plain = [given, family].filter(Boolean).join(" ");
  return plain ? `Dear ${plain}` : "Dear Friend";
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
    post_nominals?: string | null;
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
    postNominals: p.postNominals ?? p.post_nominals,
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
