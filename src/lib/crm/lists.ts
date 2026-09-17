import { nid } from "./ids";

export const LIST_KEYS = [
  { key: "religious_title", label: "Religious titles" },
  { key: "academic_title", label: "Academic titles" },
  { key: "state", label: "States" },
  { key: "country", label: "Countries" },
] as const;

export type ListKey = (typeof LIST_KEYS)[number]["key"];

export const LIST_SEEDS: Record<ListKey, string[]> = {
  religious_title: [
    "Fr.",
    "Sr.",
    "Br.",
    "Rev.",
    "Very Rev.",
    "Msgr.",
    "Deacon",
    "Dcn.",
    "Most Rev.",
    "Bishop",
    "Abbot",
    "Mother",
    "Cardinal",
    "Pope",
    "Rev. Dr.",
  ],
  academic_title: ["Dr.", "Prof.", "Prof. Dr.", "Ph.D.", "M.D.", "Sc.D.", "M.Sc.", "M.A.", "B.S."],
  state: [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "District of Columbia",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
  ],
  country: [
    "United States",
    "Canada",
    "Mexico",
    "United Kingdom",
    "Ireland",
    "Italy",
    "France",
    "Germany",
    "Spain",
    "Portugal",
    "Poland",
    "Austria",
    "Switzerland",
    "Netherlands",
    "Belgium",
    "Vatican City",
    "Australia",
    "New Zealand",
    "Philippines",
    "Nigeria",
    "Kenya",
    "India",
    "Brazil",
    "Argentina",
    "Colombia",
    "Peru",
    "Chile",
    "Japan",
    "South Korea",
    "Israel",
    "Lebanon",
  ],
};

export function composedHonorific(religious?: string | null, academic?: string | null): string | null {
  const r = religious?.trim();
  const a = academic?.trim();
  if (r && a && r !== a) return r;
  return r || a || null;
}

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
};

export async function seedLists(sql: Sql, chapterId: string) {
  for (const { key } of LIST_KEYS) {
    const values = LIST_SEEDS[key];
    for (let i = 0; i < values.length; i++) {
      await sql`
        insert into list_items (id, chapter_id, list_key, value, sort_order)
        values (${nid()}, ${chapterId}, ${key}, ${values[i]}, ${i})
      `;
    }
  }
}

export async function ensureLists(sql: Sql, chapterId: string) {
  const n = await sql<{ n: number }>`
    select count(*)::int as n from list_items where chapter_id = ${chapterId}
  `;
  if ((n[0]?.n ?? 0) > 0) return;
  await seedLists(sql, chapterId);
}
