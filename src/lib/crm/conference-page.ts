/**
 * Public conference page assembled from Website-shelf copy.
 * Speaker lines are text on those items. This module never reads People.
 */

import { todayIn } from "./dates.ts";
import { slugify } from "./ids.ts";
import { siteImageSrc } from "./site-image.ts";

export function chooseConferenceItem(
  items: { id: string; title: string; kind: string; layout: string | null }[],
  eventTitle: string,
  linkedId: string | null,
): string | null {
  if (linkedId && items.some((item) => item.id === linkedId && item.kind === "event")) return linkedId;
  const conferences = items.filter((item) => item.kind === "event" && item.layout === "conference");
  const titled = conferences.find((item) => item.title.trim().toLowerCase() === eventTitle.trim().toLowerCase());
  if (titled) return titled.id;
  if (conferences.length === 1) return conferences[0]!.id;
  return null;
}

export type ConferenceItem = {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  url: string | null;
  when_label: string | null;
  audience: string | null;
  featured: boolean;
  slug: string | null;
  image_id?: string | null;
  body?: string | null;
};

export type ConferenceTrack = { name: string; anchor: string; talks: ConferenceItem[] };

export type ConferenceSpeaker = {
  name: string;
  slug: string;
  title: string;
  line: string | null;
  headshot: string | null;
  bio: string | null;
  talks: ConferenceItem[];
};

/** "Name, role" becomes a heading and the line under the portrait. */
export function speakerCardText(name: string): { title: string; line: string | null } {
  const comma = name.indexOf(",");
  if (comma < 0) return { title: name, line: null };
  const title = name.slice(0, comma).trim();
  const line = name.slice(comma + 1).trim();
  if (!title) return { title: name, line: null };
  return { title, line: line || null };
}

export type SpeakerRecord = {
  name: string;
  role: string | null;
  body: string | null;
  imageId: string | null;
  talkIds: string[];
};

export function speakerSlug(name: string, used: Set<string>): string {
  const base = slugify(name) || "speaker";
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

/** Speakers saved on their own. A later speaker does not replace an earlier one. */
export function lineupFromSpeakers(records: SpeakerRecord[], talks: ConferenceItem[]): ConferenceSpeaker[] {
  const used = new Set<string>();
  const byId = new Map(talks.map((talk) => [talk.id, talk]));
  return records
    .filter((record) => record.name.trim())
    .map((record) => {
      const title = record.name.trim();
      const line = record.role?.trim() || null;
      return {
        name: line ? `${title}, ${line}` : title,
        slug: speakerSlug(title, used),
        title,
        line,
        headshot: siteImageSrc(record.imageId),
        bio: biographyText(record.body),
        talks: record.talkIds.map((id) => byId.get(id)).filter((talk): talk is ConferenceItem => Boolean(talk)),
      };
    });
}

export type ConferenceProgram = {
  notices: ConferenceItem[];
  keynotes: ConferenceItem[];
  tracks: ConferenceTrack[];
  speakers: ConferenceSpeaker[];
  workshops: ConferenceItem[];
  notes: ConferenceItem[];
  topics: { name: string; anchor: string }[];
};

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Keeps the line breaks typed into a biography. Enter starts a new paragraph. */
export function biographyParagraphs(body: string | null | undefined): string[] {
  const text = (body ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function biographyText(body: string | null | undefined): string | null {
  const text = (body ?? "").replace(/\r\n/g, "\n").trim();
  return text || null;
}

function groupKey(value: string): string {
  return value.toLowerCase();
}

export function pieceHref(item: { slug?: string | null; url?: string | null }): string | null {
  if (item.slug) return `/p/${item.slug}`;
  const url = clean(item.url);
  if (!url) return null;
  if (url.startsWith("/")) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function anchorFor(name: string, used: Map<string, number>): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "section";
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n === 0 ? base : `${base}-${n + 1}`;
}

export function buildConferenceProgram(items: ConferenceItem[]): ConferenceProgram {
  const notices = items.filter((item) => item.kind === "announcement");
  const talks = items.filter((item) => item.kind === "article");
  const workshops = items.filter((item) => item.kind === "course");
  const notes = items.filter((item) => item.kind === "document");
  const keynotes = talks.filter((item) => item.featured);
  const sessionTalks = talks.filter((item) => !item.featured);

  const anchors = new Map<string, number>();
  const tracks: ConferenceTrack[] = [];
  const trackIndex = new Map<string, ConferenceTrack>();
  for (const talk of sessionTalks) {
    const name = clean(talk.audience) || "Sessions";
    const key = groupKey(name);
    let track = trackIndex.get(key);
    if (!track) {
      track = { name, anchor: anchorFor(name, anchors), talks: [] };
      trackIndex.set(key, track);
      tracks.push(track);
    }
    track.talks.push(talk);
  }

  const speakers: ConferenceSpeaker[] = [];
  const speakerIndex = new Map<string, ConferenceSpeaker>();
  const usedSlugs = new Set<string>();
  for (const talk of talks) {
    const name = clean(talk.subtitle);
    if (!name) continue;
    const key = groupKey(name);
    let speaker = speakerIndex.get(key);
    if (!speaker) {
      const card = speakerCardText(name);
      let slug = slugify(card.title);
      let n = 2;
      while (usedSlugs.has(slug)) {
        slug = `${slugify(card.title)}-${n}`;
        n += 1;
      }
      usedSlugs.add(slug);
      speaker = { name, slug, title: card.title, line: card.line, headshot: null, bio: null, talks: [] };
      speakerIndex.set(key, speaker);
      speakers.push(speaker);
    }
    if (!speaker.headshot) speaker.headshot = siteImageSrc(talk.image_id);
    if (!speaker.bio) speaker.bio = biographyText(talk.body);
    speaker.talks.push(talk);
  }

  const topics: { name: string; anchor: string }[] = [];
  const seenTopics = new Set<string>();
  for (const talk of talks) {
    const name = clean(talk.audience);
    if (!name) continue;
    const key = groupKey(name);
    if (seenTopics.has(key)) continue;
    seenTopics.add(key);
    const track = tracks.find((row) => groupKey(row.name) === key);
    topics.push({ name, anchor: track?.anchor ?? "keynotes" });
  }
  for (const workshop of workshops) {
    const name = clean(workshop.audience);
    if (!name) continue;
    const key = groupKey(name);
    if (seenTopics.has(key)) continue;
    seenTopics.add(key);
    topics.push({ name, anchor: "workshops" });
  }

  return { notices, keynotes, tracks, speakers, workshops, notes, topics };
}

export type ConferenceDay = {
  key: string;
  name: string;
  heading: string;
  anchor: string;
  talks: { talk: ConferenceItem; time: string }[];
};

function weekdayName(when: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(when);
}

function dayHeading(when: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(when);
}

/** "9:30 AM" becomes "9:30 a.m." The narrow space some engines put before AM is included. */
function clockTime(when: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(when);
  return formatted.replace(/[\s\u202f]*AM$/, " a.m.").replace(/[\s\u202f]*PM$/, " p.m.");
}

/**
 * Talks grouped by calendar day in the event's time zone.
 * Null when there are no talks, or when any talk has no start time, so the page stays as it is.
 */
export function programDays(
  items: ConferenceItem[],
  startsAt: Record<string, string>,
  timeZone: string,
): ConferenceDay[] | null {
  const talks = items.filter((item) => item.kind === "article");
  if (talks.length === 0) return null;
  if (talks.some((talk) => !startsAt[talk.id])) return null;

  const ordered = talks
    .map((talk, index) => ({
      talk,
      index,
      instant: new Date(startsAt[talk.id]!).getTime(),
    }))
    .sort((a, b) => a.instant - b.instant || a.index - b.index);

  const days: ConferenceDay[] = [];
  const byKey = new Map<string, ConferenceDay>();
  for (const entry of ordered) {
    const when = new Date(startsAt[entry.talk.id]!);
    const key = todayIn(timeZone, when);
    let day = byKey.get(key);
    if (!day) {
      day = {
        key,
        name: weekdayName(when, timeZone),
        heading: dayHeading(when, timeZone),
        anchor: `day-${key}`,
        talks: [],
      };
      byKey.set(key, day);
      days.push(day);
    }
    day.talks.push({ talk: entry.talk, time: clockTime(when, timeZone) });
  }
  days.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return days;
}
