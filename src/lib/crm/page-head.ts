import { excerptText } from "./announcement-html.ts";
import { siteImageSrc } from "./site-image.ts";

const ORIGIN = /^https?:\/\/[^/\s]+$/;
const CHAPTER = "Society of Catholic Scientists";

export type SharePage = {
  title: string;
  slug: string | null;
  kind: string;
  layout: string | null;
  summary: string | null;
  body: string | null;
  public_title: string | null;
  image_id: string | null;
  location: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

type MetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { "script:ld+json": Record<string, unknown> };

type HeadLink = { rel: "canonical"; href: string };

export type PageHead = {
  title: string;
  meta: MetaEntry[];
  links: HeadLink[];
};

export function publicOrigin(env: {
  PUBLIC_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
}): string | null {
  const raw = [env.PUBLIC_ORIGIN, env.BETTER_AUTH_URL].find(
    (value) => value != null && value.trim() !== "",
  );
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\/$/, "");
  return ORIGIN.test(trimmed) ? trimmed : null;
}

export function plainDescription(text: string | null | undefined, max = 160): string | null {
  const excerpt = excerptText(text);
  if (excerpt == null) return null;
  const collapsed = excerpt.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  if (collapsed.length <= max) return collapsed;
  const space = collapsed.lastIndexOf(" ", max - 2);
  const end = space >= 0 ? space : max - 1;
  return `${collapsed.slice(0, end)}…`;
}

function pageDescription(page: { summary: string | null; body: string | null }): string | null {
  return plainDescription(page.summary) ?? plainDescription(page.body);
}

/** siteImageSrc rejects a non-UUID. A real id keeps that path; the share URL uses the same shape. */
function absoluteImage(origin: string | null, imageId: string | null | undefined): string | null {
  if (!origin || !imageId?.trim()) return null;
  const path = siteImageSrc(imageId) ?? `/api/site-image/${imageId.trim()}`;
  return `${origin}${path}`;
}

export function eventJsonLd(
  page: SharePage,
  origin: string | null,
): Record<string, unknown> | null {
  if (page.kind !== "event" || !page.starts_on) return null;
  const description = pageDescription(page);
  const image = absoluteImage(origin, page.image_id);
  const url = origin && page.slug ? `${origin}/p/${page.slug}` : null;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: page.title,
    startDate: page.starts_on,
  };
  if (page.ends_on) data.endDate = page.ends_on;
  if (description) data.description = description;
  if (image) data.image = image;
  if (url) data.url = url;
  if (page.location) {
    data.location = { "@type": "Place", name: page.location, address: page.location };
  }
  data.organizer = {
    "@type": "Organization",
    name: page.public_title || CHAPTER,
    url: "https://scs-wisconsin-usa.org/",
  };
  data.eventAttendanceMode = "https://schema.org/OfflineEventAttendanceMode";
  data.eventStatus = "https://schema.org/EventScheduled";
  return data;
}

function shareHead(
  title: string,
  description: string | null,
  ogTitle: string,
  url: string | null,
  image: string | null,
  twitter: "summary" | "summary_large_image",
): PageHead {
  const meta: MetaEntry[] = [{ title }];
  if (description) {
    meta.push({ name: "description", content: description });
    meta.push({ property: "og:description", content: description });
  }
  meta.push({ property: "og:title", content: ogTitle });
  if (url) meta.push({ property: "og:url", content: url });
  if (image) meta.push({ property: "og:image", content: image });
  meta.push({ name: "twitter:card", content: twitter });
  return { title, meta, links: url ? [{ rel: "canonical", href: url }] : [] };
}

export function pageHead(page: SharePage, origin: string | null): PageHead {
  const title = `${page.title} · ${page.public_title || CHAPTER}`;
  const description = pageDescription(page);
  const url = origin && page.slug ? `${origin}/p/${page.slug}` : null;
  const image = absoluteImage(origin, page.image_id);
  const meta: MetaEntry[] = [{ title }];
  if (description) {
    meta.push({ name: "description", content: description });
    meta.push({ property: "og:description", content: description });
  }
  meta.push(
    { property: "og:title", content: page.title },
    { property: "og:type", content: "website" },
  );
  if (url) meta.push({ property: "og:url", content: url });
  if (image) meta.push({ property: "og:image", content: image });
  meta.push({ name: "twitter:card", content: image ? "summary_large_image" : "summary" });
  const jsonLd = eventJsonLd(page, origin);
  if (jsonLd) meta.push({ "script:ld+json": jsonLd });
  return { title, meta, links: url ? [{ rel: "canonical", href: url }] : [] };
}

export function speakerHead(
  speaker: {
    title: string;
    slug: string;
    bio: string | null | undefined;
    headshot: string | null | undefined;
  },
  page: { title: string; slug: string | null },
  origin: string | null,
): PageHead {
  const url = origin && page.slug ? `${origin}/p/${page.slug}/speakers/${speaker.slug}` : null;
  const image = origin && speaker.headshot ? `${origin}${speaker.headshot}` : null;
  return shareHead(
    `${speaker.title} · ${page.title}`,
    plainDescription(speaker.bio),
    speaker.title,
    url,
    image,
    image ? "summary_large_image" : "summary",
  );
}

export function siteHead(
  settings: { public_title: string | null; about: string | null | undefined },
  origin: string | null,
): PageHead {
  const title = settings.public_title || CHAPTER;
  return shareHead(
    title,
    plainDescription(settings.about),
    title,
    origin ? `${origin}/site` : null,
    null,
    "summary",
  );
}
