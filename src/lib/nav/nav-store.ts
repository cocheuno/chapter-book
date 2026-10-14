import { useSyncExternalStore } from "react";
import { addRecent, parseRecent, type RecentItem } from "./nav-rules";

export const RECENT_KEY = "chapter-book.recent.v1";
export const LIST_KEY = "chapter-book.lists.v1";

const RECENT_EVENT = "chapter-book:recent";
const EMPTY_RECENT: RecentItem[] = [];

export const LIST_SECTIONS = ["people", "partners", "events", "mail"] as const;
export type ListSection = (typeof LIST_SECTIONS)[number];

let recentRaw: string | null | undefined;
let recentCache: RecentItem[] = EMPTY_RECENT;
let listRaw: string | null | undefined;
let listCache: Partial<Record<ListSection, string>> = {};

function readRaw(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function hasControl(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function isSection(value: string): value is ListSection {
  return value === "people" || value === "partners" || value === "events" || value === "mail";
}

/** Path plus search only, and only for this section. */
function normalizeListHref(section: ListSection, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("#") || trimmed.includes("\\") || hasControl(trimmed)) return null;
  const queryAt = trimmed.indexOf("?");
  const rawPath = queryAt === -1 ? trimmed : trimmed.slice(0, queryAt);
  const path = rawPath.replace(/\/+$/, "") || "/";
  if (path !== `/${section}`) return null;
  const search = queryAt === -1 ? "" : trimmed.slice(queryAt + 1);
  if (!search) return path;
  return `${path}?${search}`;
}

function parseLists(raw: string | null): Partial<Record<ListSection, string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Partial<Record<ListSection, string>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isSection(key) || typeof value !== "string") continue;
      const href = normalizeListHref(key, value);
      if (href) out[key] = href;
    }
    return out;
  } catch {
    return {};
  }
}

function readLists(): Partial<Record<ListSection, string>> {
  const raw = readRaw(LIST_KEY);
  if (raw === listRaw) return listCache;
  listRaw = raw;
  listCache = parseLists(raw);
  return listCache;
}

function notifyRecent(): void {
  try {
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch {
    /* no window */
  }
}

export function readRecent(): RecentItem[] {
  const raw = readRaw(RECENT_KEY);
  if (raw === recentRaw) return recentCache;
  recentRaw = raw;
  recentCache = parseRecent(raw);
  return recentCache;
}

export function rememberVisit(item: RecentItem): void {
  try {
    const next = addRecent(readRecent(), item);
    const raw = JSON.stringify(next);
    sessionStorage.setItem(RECENT_KEY, raw);
    recentRaw = raw;
    recentCache = next;
  } catch {
    return;
  }
  notifyRecent();
}

export function rememberList(section: ListSection, href: string): void {
  const stored = normalizeListHref(section, href);
  if (!stored) return;
  const lists = { ...readLists(), [section]: stored };
  try {
    const raw = JSON.stringify(lists);
    sessionStorage.setItem(LIST_KEY, raw);
    listRaw = raw;
    listCache = lists;
  } catch {
    /* storage may be unavailable */
  }
}

export function listHref(section: ListSection, fallback: string): string {
  return readLists()[section] ?? fallback;
}

export function clearNavStorage(): void {
  try {
    sessionStorage.removeItem(RECENT_KEY);
    sessionStorage.removeItem(LIST_KEY);
  } catch {
    /* storage may be unavailable */
  }
  recentRaw = null;
  recentCache = EMPTY_RECENT;
  listRaw = null;
  listCache = {};
  notifyRecent();
}

function subscribeRecent(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(RECENT_EVENT, onStoreChange);
  return () => window.removeEventListener(RECENT_EVENT, onStoreChange);
}

function subscribeNothing(): () => void {
  return () => {};
}

export function useRecentItems(): RecentItem[] {
  return useSyncExternalStore(subscribeRecent, readRecent, () => EMPTY_RECENT);
}

/** First paint uses the fallback so server and client markup match. */
export function useListHref(section: ListSection, fallback: string): string {
  return useSyncExternalStore(
    subscribeNothing,
    () => listHref(section, fallback),
    () => fallback,
  );
}
