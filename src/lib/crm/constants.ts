export const PERSON_ROLES = [
  { key: "academic_member", label: "Academic member" },
  { key: "educator", label: "Science educator" },
  { key: "student", label: "Student" },
  { key: "clergy", label: "Clergy" },
  { key: "religious", label: "Religious" },
  { key: "friend", label: "Friend" },
  { key: "speaker", label: "Speaker" },
  { key: "volunteer", label: "Volunteer" },
  { key: "donor", label: "Donor" },
  { key: "other", label: "Other" },
] as const;

export const ORG_TYPES = [
  { key: "parish", label: "Parish" },
  { key: "high_school", label: "Catholic high school" },
  { key: "diocese", label: "Diocese" },
  { key: "university", label: "University / campus" },
  { key: "other", label: "Other partner" },
] as const;

export const ORG_AFFIL_ROLES = [
  { key: "pastor", label: "Pastor" },
  { key: "parochial_vicar", label: "Parochial vicar" },
  { key: "deacon", label: "Deacon" },
  { key: "bishop", label: "Bishop" },
  { key: "auxiliary_bishop", label: "Auxiliary bishop" },
  { key: "vicar_general", label: "Vicar general" },
  { key: "chaplain", label: "Chaplain" },
  { key: "campus_minister", label: "Campus minister" },
  { key: "religious_in_residence", label: "Religious in residence" },
  { key: "parish_secretary", label: "Secretary" },
  { key: "faith_formation", label: "Head of faith formation" },
  { key: "liturgy_coordinator", label: "Liturgy coordinator" },
  { key: "chancellor", label: "Chancellor" },
  { key: "chancery_contact", label: "Chancery staff" },
  { key: "communications", label: "Communications" },
  { key: "office_of_worship", label: "Office of worship" },
  { key: "staff", label: "Staff" },
  { key: "science_chair", label: "Science chair" },
  { key: "principal", label: "Principal" },
  { key: "front_office", label: "Front office" },
  { key: "faculty", label: "Faculty" },
  { key: "chapel_contact", label: "Chapel contact" },
  { key: "other", label: "Other" },
] as const;

export const RELIGIOUS_OFFICE_KEYS = [
  "pastor",
  "parochial_vicar",
  "deacon",
  "bishop",
  "auxiliary_bishop",
  "vicar_general",
  "chaplain",
  "campus_minister",
  "religious_in_residence",
] as const;

export const CONTACT_DESK: Record<string, { religious: string[]; laity: string[] }> = {
  parish: {
    religious: ["pastor", "parochial_vicar", "deacon"],
    laity: ["parish_secretary", "faith_formation", "liturgy_coordinator"],
  },
  diocese: {
    religious: ["bishop", "auxiliary_bishop", "vicar_general"],
    laity: ["chancellor", "communications", "office_of_worship", "staff"],
  },
  high_school: {
    religious: ["chaplain", "campus_minister"],
    laity: ["principal", "science_chair", "front_office"],
  },
  university: {
    religious: ["chaplain", "campus_minister"],
    laity: ["science_chair", "faculty", "front_office"],
  },
  other: {
    religious: ["chaplain", "religious_in_residence"],
    laity: ["staff", "front_office"],
  },
};

export type DeskKind = "religious" | "laity";

function officeMeta(key: string) {
  return ORG_AFFIL_ROLES.find((r) => r.key === key) ?? { key, label: key.replaceAll("_", " ") };
}

export function officesForType(typeKey: string, kind: DeskKind) {
  const desk = CONTACT_DESK[typeKey] ?? CONTACT_DESK.other;
  return desk[kind].map(officeMeta);
}

export function addableOffices(typeKey: string, kind: DeskKind) {
  const suggested = officesForType(typeKey, kind);
  const seen = new Set(suggested.map((s) => s.key));
  const religious = new Set<string>(RELIGIOUS_OFFICE_KEYS);
  const rest = ORG_AFFIL_ROLES.filter((r) => {
    if (seen.has(r.key) || r.key === "other") return false;
    const isRel = religious.has(r.key);
    return kind === "religious" ? isRel : !isRel;
  });
  const other = ORG_AFFIL_ROLES.find((r) => r.key === "other");
  return other ? [...suggested, ...rest, other] : [...suggested, ...rest];
}

export function isReligiousPerson(roles: string[]): boolean {
  return roles.includes("clergy") || roles.includes("religious");
}

export const SINGULAR_OFFICES = [
  "pastor",
  "bishop",
  "vicar_general",
  "chaplain",
  "campus_minister",
  "parish_secretary",
  "faith_formation",
  "liturgy_coordinator",
  "chancellor",
  "communications",
  "office_of_worship",
  "science_chair",
  "principal",
  "front_office",
] as const;

export function isSingularOffice(key: string): boolean {
  return (SINGULAR_OFFICES as readonly string[]).includes(key);
}

export function personRolesFromDesk(kind: DeskKind, office: string, religiousTitle?: string): string[] {
  if (kind === "religious") {
    const t = (religiousTitle ?? "").trim();
    if (["Sr.", "Br.", "Mother", "Abbot"].includes(t)) return ["religious"];
    return ["clergy"];
  }
  if (office === "science_chair" || office === "faculty" || office === "principal") return ["educator"];
  return ["friend"];
}

export const SCHOOL_TYPES = ["high_school", "university"] as const;

export function isSchoolType(typeKey: string | null | undefined): boolean {
  return typeKey === "high_school" || typeKey === "university";
}

export const OCCASIONS = [
  { key: "st_albert", label: "St. Albert the Great", month: 11, day: 15 },
  { key: "st_thomas_aquinas", label: "St. Thomas Aquinas", month: 1, day: 28 },
  { key: "st_newman", label: "St. John Henry Newman", month: 10, day: 9 },
  { key: "other", label: "Other", month: null, day: null },
] as const;

export const GUEST_STATUSES = [
  "no_response",
  "attending",
  "declined",
  "waitlisted",
  "attended",
  "no_show",
] as const;

export const ADMISSIONS = [
  { key: "free", label: "Free" },
  { key: "private", label: "Private" },
] as const;

export type Admission = (typeof ADMISSIONS)[number]["key"];

export const GOLD_MASS_CHECKLIST: {
  key: string;
  title: string;
  offsetDays: number;
  hat: string;
  skippable: boolean;
}[] = [
  { key: "choose_date", title: "Choose date and occasion", offsetDays: -180, hat: "president", skippable: false },
  { key: "request_pastor", title: "Ask the pastor if they will host", offsetDays: -150, hat: "events_lead", skippable: false },
  { key: "confirm_space", title: "Confirm church (and hall, if reception on site)", offsetDays: -120, hat: "events_lead", skippable: false },
  { key: "request_celebrant", title: "Request celebrant", offsetDays: -120, hat: "president", skippable: false },
  { key: "confirm_celebrant", title: "Confirm celebrant and homilist", offsetDays: -90, hat: "president", skippable: false },
  { key: "book_speaker", title: "Book speaker if there is a lecture", offsetDays: -90, hat: "events_lead", skippable: true },
  { key: "draft_blurb", title: "Draft bulletin blurb and flyer", offsetDays: -60, hat: "secretary", skippable: false },
  { key: "host_bulletin", title: "Ask host parish to announce", offsetDays: -40, hat: "secretary", skippable: false },
  { key: "parishes_bulletin", title: "Ask other parishes to announce", offsetDays: -40, hat: "secretary", skippable: false },
  { key: "diocese_comms", title: "Notify diocese communications", offsetDays: -40, hat: "secretary", skippable: false },
  { key: "notify_schools", title: "Notify Catholic high-school science chairs", offsetDays: -40, hat: "events_lead", skippable: false },
  { key: "invite_members", title: "Invite chapter members and past attendees", offsetDays: -35, hat: "secretary", skippable: false },
  { key: "reception_food", title: "Confirm reception food and volunteers", offsetDays: -21, hat: "events_lead", skippable: true },
  { key: "print_materials", title: "Print programs and nametags", offsetDays: -7, hat: "secretary", skippable: true },
  { key: "day_of", title: "Day-of: ushers, check-in, reserved seats", offsetDays: 0, hat: "volunteer", skippable: false },
  { key: "close_door", title: "Close attendance; note no-shows", offsetDays: 1, hat: "secretary", skippable: false },
  { key: "thank_yous", title: "Thank pastor, celebrant, speaker, hall", offsetDays: 3, hat: "president", skippable: false },
  { key: "after_action", title: "Write five lines for next year", offsetDays: 7, hat: "events_lead", skippable: false },
  { key: "close_event", title: "Mark gathering complete", offsetDays: 14, hat: "events_lead", skippable: false },
];

export const CONFERENCE_CHECKLIST = [
  { key: "venue", title: "Confirm venue", offsetDays: -120, hat: "events_lead", skippable: false },
  { key: "theme", title: "Lock theme and title", offsetDays: -90, hat: "president", skippable: false },
  { key: "speakers", title: "Confirm speakers and sessions", offsetDays: -60, hat: "events_lead", skippable: false },
  { key: "reg_open", title: "Open registration / send invites", offsetDays: -45, hat: "secretary", skippable: false },
  { key: "notify_schools", title: "Notify Catholic high schools", offsetDays: -40, hat: "events_lead", skippable: false },
  { key: "materials", title: "Nametags and packets", offsetDays: -7, hat: "secretary", skippable: true },
  { key: "day_of", title: "Check-in and hospitality", offsetDays: 0, hat: "volunteer", skippable: false },
  { key: "thank_speakers", title: "Thank speakers", offsetDays: 3, hat: "president", skippable: false },
  { key: "writeup", title: "File a short write-up", offsetDays: 7, hat: "events_lead", skippable: false },
  { key: "close_event", title: "Mark complete", offsetDays: 14, hat: "events_lead", skippable: false },
];

export function roleLabel(key: string): string {
  return (
    PERSON_ROLES.find((r) => r.key === key)?.label ??
    ORG_AFFIL_ROLES.find((r) => r.key === key)?.label ??
    key.replaceAll("_", " ")
  );
}

export function orgTypeLabel(key: string): string {
  return ORG_TYPES.find((t) => t.key === key)?.label ?? key;
}
