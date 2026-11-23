/** Colour override for a conference page. Null means today's parchment palette. */

export const THEME_VARS = [
  "--color-paper",
  "--color-paper-2",
  "--color-surface",
  "--color-ink",
  "--color-ink-soft",
  "--color-muted",
  "--color-line",
  "--color-bronze",
  "--color-bronze-fg",
  "--color-highlight",
  "--color-highlight-fg",
] as const;

export type ThemeVar = (typeof THEME_VARS)[number];
export type ThemeColours = Record<ThemeVar, string>;

export const PARCHMENT_LABEL = "Parchment (current)";

/** Editor swatches for no override. Highlight shows today's border colour. */
export const PARCHMENT_SWATCHES = {
  background: "#f4efe6",
  text: "#1a1612",
  accent: "#7a6238",
  highlight: "#d4cbb8",
};

type Preset = { key: string; label: string; colours: readonly string[] };

export const PRESETS: readonly Preset[] = [
  {
    key: "orange-green",
    label: "Orange & green",
    colours: ["#f6f8f5", "#e6efe9", "#ffffff", "#0f1f17", "#2b3b33", "#55645c", "#cfdcd4", "#005030", "#ffffff", "#f47321", "#0f1f17"],
  },
  {
    key: "marian-blue",
    label: "Marian blue",
    colours: ["#f3f6fb", "#e6ecf5", "#fafcff", "#0f1b2d", "#2c3b52", "#56657a", "#c9d4e3", "#1f4e8c", "#ffffff", "#1f4e8c", "#ffffff"],
  },
  {
    key: "cardinal",
    label: "Cardinal",
    colours: ["#faf5f3", "#f0e6e2", "#fffbfa", "#1d1212", "#3e2c2c", "#6b5656", "#e0cfca", "#9b1c1c", "#ffffff", "#9b1c1c", "#ffffff"],
  },
  {
    key: "forest",
    label: "Forest",
    colours: ["#f4f6f1", "#e7ece2", "#fbfcf9", "#14201a", "#2f3d35", "#5a6a60", "#cfd8ca", "#2f5d46", "#ffffff", "#2f5d46", "#ffffff"],
  },
  {
    key: "navy-gold",
    label: "Navy & gold",
    colours: ["#f6f4ee", "#ebe7dc", "#fcfbf7", "#111a2b", "#2e374a", "#5d6472", "#d8d2c2", "#1c2f5a", "#f6e7b8", "#d4af37", "#111a2b"],
  },
  {
    key: "indigo",
    label: "Indigo",
    colours: ["#f5f6f8", "#e9ecf0", "#ffffff", "#111418", "#30353d", "#5b626c", "#d3d8df", "#3b4cca", "#ffffff", "#3b4cca", "#ffffff"],
  },
];

const MIN_CONTRAST = 4.5;
const HEX = /^#[0-9a-f]{6}$/;
const CUSTOM = /^custom:(#[0-9a-f]{6}(?:,#[0-9a-f]{6}){2,3})$/;

export type ThemeDraft = {
  choice: string;
  background: string;
  text: string;
  accent: string;
  highlight: string;
};

function hexByte(hex: string, index: number): number {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * linear(hexByte(hex, 0)) + 0.7152 * linear(hexByte(hex, 1)) + 0.0722 * linear(hexByte(hex, 2));
}

/** WCAG 2 relative-luminance contrast of two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const left = luminance(a);
  const right = luminance(b);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Per-channel sRGB blend. `t` is the share of `b`. */
export function mix(a: string, b: string, t: number): string {
  const channels = [0, 1, 2].map((index) => Math.round(hexByte(a, index) * (1 - t) + hexByte(b, index) * t));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function foreground(ink: string, background: string): string {
  const white = contrastRatio("#ffffff", background);
  const inkRatio = contrastRatio(ink, background);
  return white >= inkRatio ? "#ffffff" : ink;
}

export function customTheme(paper: string, ink: string, accent: string, highlight?: string): ThemeColours {
  const background = paper.toLowerCase();
  const text = ink.toLowerCase();
  const bronze = accent.toLowerCase();
  const stripe = (highlight ?? accent).toLowerCase();
  return {
    "--color-paper": background,
    "--color-paper-2": mix(background, text, 0.06),
    "--color-surface": mix(background, "#ffffff", 0.5),
    "--color-ink": text,
    "--color-ink-soft": mix(text, background, 0.2),
    "--color-muted": mix(text, background, 0.45),
    "--color-line": mix(background, text, 0.18),
    "--color-bronze": bronze,
    "--color-bronze-fg": foreground(text, bronze),
    "--color-highlight": stripe,
    "--color-highlight-fg": foreground(text, stripe),
  };
}

function coloursFromList(list: readonly string[]): ThemeColours {
  const colours = {} as ThemeColours;
  for (let i = 0; i < THEME_VARS.length; i++) colours[THEME_VARS[i]] = list[i];
  return colours;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

type Parsed =
  | { kind: "none" }
  | { kind: "preset"; colours: ThemeColours }
  | { kind: "custom"; colours: ThemeColours }
  | { kind: "unknown" }
  | { kind: "malformed" };

function parseTheme(value: string | null | undefined): Parsed {
  const text = normalize(value);
  if (!text) return { kind: "none" };
  const preset = PRESETS.find((item) => item.key === text);
  if (preset) return { kind: "preset", colours: coloursFromList(preset.colours) };
  if (!text.startsWith("custom:")) return { kind: "unknown" };
  const match = CUSTOM.exec(text);
  if (!match) return { kind: "malformed" };
  const [paper, ink, accent, highlight] = match[1].split(",");
  if (!HEX.test(paper) || !HEX.test(ink) || !HEX.test(accent) || (highlight !== undefined && !HEX.test(highlight))) {
    return { kind: "malformed" };
  }
  return { kind: "custom", colours: customTheme(paper, ink, accent, highlight) };
}

const CHECKS: { fg: ThemeVar; bg: ThemeVar; sentence: (ratio: string) => string }[] = [
  { fg: "--color-ink", bg: "--color-paper", sentence: (ratio) => `Text on the background is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-ink-soft", bg: "--color-paper", sentence: (ratio) => `Soft text on the background is hard to read (contrast ${ratio}; needs 4.5).` },
  // Accent is named before muted so a bright accent is the first failure when both fail.
  { fg: "--color-bronze", bg: "--color-paper", sentence: (ratio) => `The accent on the background is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-muted", bg: "--color-paper", sentence: (ratio) => `Muted text on the background is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-ink", bg: "--color-surface", sentence: (ratio) => `Text on the surface is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-ink-soft", bg: "--color-surface", sentence: (ratio) => `Soft text on the surface is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-bronze", bg: "--color-surface", sentence: (ratio) => `The accent on the surface is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-muted", bg: "--color-surface", sentence: (ratio) => `Muted text on the surface is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-bronze-fg", bg: "--color-bronze", sentence: (ratio) => `Text on the accent is hard to read (contrast ${ratio}; needs 4.5).` },
  { fg: "--color-highlight-fg", bg: "--color-highlight", sentence: (ratio) => `Text on the highlight is hard to read (contrast ${ratio}; needs 4.5).` },
];

/** Null when the value is parchment or readable. Otherwise one sentence. */
export function themeProblem(value: string | null | undefined): string | null {
  const parsed = parseTheme(value);
  if (parsed.kind === "none") return null;
  if (parsed.kind === "unknown") return "That theme is not one of the presets.";
  if (parsed.kind === "malformed") return "The custom colours must be three or four #rrggbb values.";
  for (const check of CHECKS) {
    const ratio = contrastRatio(parsed.colours[check.fg], parsed.colours[check.bg]);
    if (ratio < MIN_CONTRAST) return check.sentence(ratio.toFixed(1));
  }
  return null;
}

/** Null for parchment or a value that does not parse. Contrast is not required. */
export function themeVars(value: string | null | undefined): ThemeColours | null {
  const parsed = parseTheme(value);
  if (parsed.kind === "preset" || parsed.kind === "custom") return parsed.colours;
  return null;
}

/** Stored form: null, a preset key, or a lowercase custom string. Null when unreadable. */
export function canonicalTheme(value: string | null | undefined): string | null {
  const text = normalize(value);
  if (!text || themeProblem(value)) return null;
  return text;
}

export function themeFrameStyle(value: string | null | undefined): Record<string, string> | null {
  const vars = themeVars(value);
  if (!vars) return null;
  return { ...vars, backgroundColor: "var(--color-paper)", minHeight: "100dvh" };
}

function swatches(colours: ThemeColours): Omit<ThemeDraft, "choice"> {
  return {
    background: colours["--color-paper"],
    text: colours["--color-ink"],
    accent: colours["--color-bronze"],
    highlight: colours["--color-highlight"],
  };
}

export function readThemeDraft(value: string | null | undefined): ThemeDraft {
  const text = normalize(value);
  const preset = PRESETS.find((item) => item.key === text);
  if (preset) return { choice: preset.key, ...swatches(coloursFromList(preset.colours)) };
  const colours = themeVars(text);
  if (colours && text.startsWith("custom:")) return { choice: "custom", ...swatches(colours) };
  return { choice: "", ...PARCHMENT_SWATCHES };
}

export function writeThemeDraft(draft: ThemeDraft): string | null {
  if (!draft.choice || draft.choice === PARCHMENT_LABEL) return null;
  if (PRESETS.some((item) => item.key === draft.choice)) return draft.choice;
  if (draft.choice !== "custom") return null;
  return `custom:${[draft.background, draft.text, draft.accent, draft.highlight].join(",")}`.toLowerCase();
}
