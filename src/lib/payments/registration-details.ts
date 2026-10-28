import { z } from "zod";
import { PERSON_ROLES } from "../crm/constants.ts";

export const TITLES = ["", "Dr.", "Prof.", "Fr.", "Rev.", "Msgr.", "Deacon", "Sr.", "Br.", "Mr.", "Mrs.", "Ms."] as const;

export const DIETARY_TAG_KEYS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "nut_allergy",
  "shellfish_allergy",
  "other",
] as const;

export type DietaryKey = (typeof DIETARY_TAG_KEYS)[number];

export const DIETARY_TAGS: Record<DietaryKey, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gluten_free: "Gluten-free",
  dairy_free: "Dairy-free",
  nut_allergy: "Nut allergy",
  shellfish_allergy: "Shellfish allergy",
  other: "Other (describe below)",
};

export const LODGING_KEYS = ["none", "hotel_block", "need_help", "friends"] as const;

export type LodgingKey = (typeof LODGING_KEYS)[number];

export const LODGING: Record<LodgingKey, string> = {
  none: "I don't need lodging",
  hotel_block: "I'll book the conference hotel block",
  need_help: "Please help me find lodging",
  friends: "Staying with family or friends",
};

export const LODGING_REQUIRED = "Choose whether you need lodging.";

export const REFUND_REQUIRED = "Please confirm you have read the refund policy.";

const RELIGIOUS_TITLES = new Set<string>(["Fr.", "Rev.", "Msgr.", "Deacon", "Sr.", "Br."]);
const ACADEMIC_TITLES = new Set<string>(["Dr.", "Prof."]);
const ROLE_KEYS = new Set<string>(PERSON_ROLES.map((role) => role.key));

const sharedDetails = {
  title: z.enum(TITLES),
  badgeName: z.string().max(60, "Name on badge must be 60 characters or fewer."),
  position: z.string().max(120, "Position or role must be 120 characters or fewer."),
  city: z.string().max(100, "City must be 100 characters or fewer."),
  state: z.string().max(50, "State must be 50 characters or fewer."),
  dietaryTags: z
    .array(z.enum(DIETARY_TAG_KEYS))
    .max(7, "Choose up to 7 dietary needs.")
    .refine((tags) => new Set(tags).size === tags.length, "Choose each dietary need once."),
  lodging: z.enum(LODGING_KEYS).optional(),
  roomShare: z.boolean(),
  roommate: z.string().max(120, "Roommate's name must be 120 characters or fewer."),
  parking: z.boolean(),
  notes: z.string().max(500, "Keep notes to 500 characters or fewer."),
  refundAcknowledged: z.boolean(),
};

function nightsField(allowed: ReadonlySet<string> | null) {
  const field = z.array(z.string().max(200)).max(7, "Choose up to 7 nights.");
  if (!allowed) return field;
  return field.refine((nights) => nights.every((night) => allowed.has(night)), "Choose a listed night.");
}

/** Details for one attendee. Nights must be lines from the page's housing nights. */
export function detailsSchema(housingNights: string | null | undefined) {
  return z.object({
    ...sharedDetails,
    nights: nightsField(new Set(nightOptions(housingNights))),
  });
}

/** Same shape as the form posts it, before the page's night list is known. */
export const detailsRequest = z.object({
  ...sharedDetails,
  nights: nightsField(null),
});

export type RegistrationDetails = z.infer<ReturnType<typeof detailsSchema>>;

export type DetailsDraft = {
  title: string;
  badgeName: string;
  position: string;
  city: string;
  state: string;
  dietaryTags: string[];
  lodging?: string;
  nights: string[];
  roomShare: boolean;
  roommate: string;
  parking: boolean;
  notes: string;
  refundAcknowledged: boolean;
};

export function blankDetails(): DetailsDraft {
  return {
    title: "",
    badgeName: "",
    position: "",
    city: "",
    state: "",
    dietaryTags: [],
    nights: [],
    roomShare: false,
    roommate: "",
    parking: false,
    notes: "",
    refundAcknowledged: false,
  };
}

export function normalizeDetails(input: DetailsDraft): DetailsDraft {
  const lodging = input.lodging?.trim();
  const { lodging: _dropped, ...rest } = input;
  return {
    ...rest,
    badgeName: input.badgeName.trim(),
    position: input.position.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    roommate: input.roommate.trim(),
    notes: input.notes.trim(),
    nights: input.nights.map((night) => night.trim()).filter((night) => night.length > 0),
    ...(lodging ? { lodging } : {}),
  };
}

/** One trimmed, non-blank line each, at most 7. */
export function nightOptions(housingNights: string | null | undefined): string[] {
  return (housingNights ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 7);
}

export function detailsErrors(
  details: { lodging?: string | null; refundAcknowledged?: boolean },
  options: {
    housingAsked: boolean;
    refundPolicyShown: boolean;
    paid: boolean;
    affiliationPrompt?: string | null;
    affiliation?: string | null;
  },
): string[] {
  const errors: string[] = [];
  if (options.housingAsked && !(details.lodging ?? "").trim()) errors.push(LODGING_REQUIRED);
  if (options.paid && options.refundPolicyShown && details.refundAcknowledged !== true) {
    errors.push(REFUND_REQUIRED);
  }
  const prompt = (options.affiliationPrompt ?? "").trim();
  if (prompt && !(options.affiliation ?? "").trim()) errors.push(`${prompt} is required.`);
  return errors;
}

/** Religious or academic title stored on a person created from this registration. */
export function personTitles(title: string): { religiousTitle: string | null; academicTitle: string | null } {
  if (RELIGIOUS_TITLES.has(title)) return { religiousTitle: title, academicTitle: null };
  if (ACADEMIC_TITLES.has(title)) return { religiousTitle: null, academicTitle: title };
  return { religiousTitle: null, academicTitle: null };
}

/** Tag labels, then the free-text dietary note. Null when both are empty. */
export function storedDietary(tags: readonly string[], text: string | null | undefined): string | null {
  const chosen = new Set(tags);
  const labels = DIETARY_TAG_KEYS.filter((key) => chosen.has(key)).map((key) => DIETARY_TAGS[key]);
  const extra = (text ?? "").trim();
  if (extra) labels.push(extra);
  if (!labels.length) return null;
  return labels.join("; ");
}

/** A People role key from the ticket, or null when the ticket leaves it blank. */
export function personRoleKey(value: string | null | undefined): string | null {
  const key = (value ?? "").trim();
  if (!key || !ROLE_KEYS.has(key)) return null;
  return key;
}

export function lodgingLabel(key: string | null | undefined): string {
  if (!key) return "";
  return key in LODGING ? LODGING[key as LodgingKey] : "";
}

/** How many people chose each dietary tag, in the tag list's order. */
export function dietaryTagCounts(lists: readonly (readonly string[])[]): { key: DietaryKey; label: string; count: number }[] {
  const counts = new Map<DietaryKey, number>();
  for (const tags of lists) {
    const seen = new Set<DietaryKey>();
    for (const tag of tags) {
      if (!(tag in DIETARY_TAGS) || seen.has(tag as DietaryKey)) continue;
      const key = tag as DietaryKey;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return DIETARY_TAG_KEYS.filter((key) => (counts.get(key) ?? 0) > 0).map((key) => ({
    key,
    label: DIETARY_TAGS[key],
    count: counts.get(key) ?? 0,
  }));
}

/** Badge line. The printed given name is the badge name when one was typed. */
export function badgePrintName(badgeName: string | null | undefined, givenName: string): string {
  const badge = (badgeName ?? "").trim();
  return badge || givenName;
}

export function readDetails(value: unknown): RegistrationDetails | null {
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const nights = Array.isArray((raw as { nights?: unknown }).nights)
    ? (raw as { nights: unknown[] }).nights.filter((night): night is string => typeof night === "string")
    : [];
  const parsed = detailsSchema(nights.join("\n")).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Editors and admins see emergency contacts. Anyone else does not receive the fields. */
export function attendeeForRole<T>(role: string, attendee: T): T {
  if (role === "admin" || role === "editor") return attendee;
  if (!attendee || typeof attendee !== "object") return attendee;
  const copy = { ...(attendee as Record<string, unknown>) };
  delete copy.emergencyName;
  delete copy.emergencyPhone;
  return copy as T;
}
