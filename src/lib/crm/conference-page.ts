/**
 * Public conference page assembled from Website-shelf copy.
 * Speaker lines are text on those items. This module never reads People.
 */

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

export type ConferenceSpeaker = { name: string; headshot: string | null; bio: string | null; talks: ConferenceItem[] };

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
  for (const talk of talks) {
    const name = clean(talk.subtitle);
    if (!name) continue;
    const key = groupKey(name);
    let speaker = speakerIndex.get(key);
    if (!speaker) {
      speaker = { name, headshot: null, bio: null, talks: [] };
      speakerIndex.set(key, speaker);
      speakers.push(speaker);
    }
    if (!speaker.headshot) speaker.headshot = siteImageSrc(talk.image_id);
    if (!speaker.bio && clean(talk.body)) speaker.bio = clean(talk.body);
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
