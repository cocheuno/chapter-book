import { nid } from "./ids";

export const SITE_KINDS = [
  { key: "event", label: "Events" },
  { key: "article", label: "Articles" },
  { key: "document", label: "Documents" },
  { key: "course", label: "Courses" },
] as const;

export type SiteKind = (typeof SITE_KINDS)[number]["key"];

export const DEFAULT_SITE = {
  publicTitle: "Society of Catholic Scientists — Wisconsin Chapter",
  publicTagline: "Understanding science and technology in the light of the Church",
  about:
    "The Wisconsin chapter of the Society of Catholic Scientists. We gather for Gold Masses, lectures, and courses that put the human person first in an age of powerful machines.",
  contactEmail: "chapter@catholicscientists.example",
};

type SeedItem = {
  kind: SiteKind;
  title: string;
  subtitle?: string;
  summary?: string;
  url?: string;
  location?: string;
  whenLabel?: string;
  audience?: string;
  featured?: boolean;
  sort: number;
};

export const SITE_ITEM_SEEDS: SeedItem[] = [
  {
    kind: "event",
    title: "Gold Mass · Milwaukee",
    subtitle: "Inaugural Milwaukee Gold Mass",
    whenLabel: "Tuesday, November 10, 2026 · 6:00 p.m.",
    location: "St. John the Evangelist Parish, 8500 W. Cold Spring Road, Greenfield, WI",
    summary:
      "A Mass for Catholic scientific professionals, celebrated by Most Rev. James T. Schuerman, Auxiliary Bishop of Milwaukee. Followed by dinner and a presentation by Dr. Daniel Kuebler on \u201cHuman Origins: Creation in Light of Evolution\u201d.",
    featured: true,
    sort: 0,
  },
  {
    kind: "event",
    title: "Gold Mass · Madison",
    subtitle: "Madison-area Gold Mass",
    whenLabel: "Saturday, November 21, 2026 · 11:00 a.m.",
    location: "Holy Redeemer Catholic Church, 126 West Johnson Street, Madison, Wisconsin",
    summary:
      "Followed by luncheon featuring Del\u2019s famous pork ribs. Lecture details TBA. Register before midnight, Tuesday, November 17, 2026.",
    featured: true,
    sort: 1,
  },
  {
    kind: "event",
    title: "Faith, Reason, and AI — Putting Humanity First in the Age of Intelligent Machines",
    whenLabel: "April 16, 2027",
    location: "University of Wisconsin, Madison",
    summary: "A gathering of the chapter on artificial intelligence, faith, and the human person.",
    sort: 2,
  },
  {
    kind: "article",
    title: "Algorithms and Faith: The Meaning, Power, and Causality of Algorithms in Catholic Online Discourse",
    subtitle: "Sierocki, R. (2024) \u00b7 Religions",
    summary:
      "Algorithms are perceived as ideological machines in Catholic online discourse, influencing the individualization of religion — with God as creator and the soul as the algorithm.",
    url: "https://doi.org/10.3390/rel15040431",
    sort: 0,
  },
  {
    kind: "article",
    title: "Transhumanism and Catholic Social Teaching",
    subtitle: "Jenkins, G. (2025) \u00b7 Religions",
    summary:
      "Transhumanism\u2019s technological advancement of the human must be evaluated against Catholic Social Teaching. Technology is subordinate to human dignity and the common good.",
    url: "https://doi.org/10.3390/rel16080971",
    sort: 1,
  },
  {
    kind: "article",
    title: "In Defense of Catholic AI",
    subtitle: "Sanders, M. (2025) \u00b7 Journal of Ethics and Emerging Technologies",
    summary:
      "Catholic AI projects such as Magisterium AI are necessary evangelical tools in a digital and secular world; abandoning them risks losing mission fields to relativist technologies.",
    url: "https://doi.org/10.55613/jeet.v35i1.201",
    sort: 2,
  },
  {
    kind: "document",
    title: "Magnifica Humanitas",
    subtitle: "Encyclical \u00b7 May 25, 2026",
    summary: "On safeguarding the human person in the time of artificial intelligence. First encyclical of Pope Leo XIV.",
    url: "https://www.vatican.va/content/leo-xiv/en/encyclicals/documents/20260515-magnifica-humanitas.html",
    sort: 0,
  },
  {
    kind: "document",
    title: "Antiqua et Nova",
    subtitle: "Doctrinal Note \u00b7 January 28, 2025",
    summary: "Note on the relationship between artificial intelligence and human intelligence, Dicastery for the Doctrine of the Faith.",
    url: "https://www.vatican.va/roman_curia/congregations/cfaith/documents/rc_ddf_doc_20250128_antiqua-et-nova_en.html",
    sort: 1,
  },
  {
    kind: "document",
    title: "Quo Vadis, Humanitas?",
    subtitle: "ITC Study \u00b7 March 4, 2026",
    summary: "Christian anthropology facing the future of the human: AI, transhumanism, and posthumanism. International Theological Commission.",
    url: "https://www.vatican.va/roman_curia/congregations/cfaith/cti_documents/rc_cti_doc_20260304_quo-vadis-humanits_en.html",
    sort: 2,
  },
  {
    kind: "course",
    title: "What AI Really Is: A Six-Week Foundation",
    audience: "Clergy & religious",
    subtitle: "Six weeks \u00b7 no technical background required",
    summary:
      "How these systems actually work, what they can and cannot do, and how to preach and counsel about them faithfully — anchored in Antiqua et Nova and Magnifica Humanitas.",
    sort: 0,
  },
  {
    kind: "course",
    title: "AI in Daily Life: A Catholic Approach",
    audience: "Laity & families",
    subtitle: "Four weeks \u00b7 practical",
    summary:
      "Work, school, parenting, and prayer in a world of AI tools. Discernment guides, family media plans, and discussion materials for parish groups.",
    sort: 1,
  },
];

type Sql = {
  <T = Record<string, string | number | boolean | null>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
};

export async function seedSite(sql: Sql, chapterId: string) {
  await sql`
    insert into site_settings (chapter_id, public_title, public_tagline, about, contact_email)
    values (
      ${chapterId}, ${DEFAULT_SITE.publicTitle}, ${DEFAULT_SITE.publicTagline},
      ${DEFAULT_SITE.about}, ${DEFAULT_SITE.contactEmail}
    )
    on conflict (chapter_id) do nothing
  `;
  const n = await sql<{ n: number }>`
    select count(*)::int as n from site_items where chapter_id = ${chapterId}
  `;
  if ((n[0]?.n ?? 0) > 0) return;
  for (const item of SITE_ITEM_SEEDS) {
    await sql`
      insert into site_items (
        id, chapter_id, kind, title, subtitle, summary, url, location, when_label, audience, featured, published, sort_order
      )
      values (
        ${nid()}, ${chapterId}, ${item.kind}, ${item.title}, ${item.subtitle ?? null},
        ${item.summary ?? null}, ${item.url ?? null}, ${item.location ?? null},
        ${item.whenLabel ?? null}, ${item.audience ?? null}, ${item.featured ?? false},
        ${true}, ${item.sort}
      )
    `;
  }
}

export async function ensureSiteContent(sql: Sql, chapterId: string) {
  try {
    await seedSite(sql, chapterId);
  } catch {
    // 0006 / 0007 may not have applied yet.
  }
}

export const ensureSite = ensureSiteContent;
