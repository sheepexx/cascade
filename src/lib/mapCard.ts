import type { Difficulty, SongMeta, TimingPoint } from "../types";
import { computeMapStats } from "./mapStats";
import { computeStarRating } from "./starRating";
import { bpmRange, dominantBpm } from "./rateChange";
import { formatUiNumber } from "./formatUiNumber";
import { osuFilename } from "./osuExport";
import type { MessageKey } from "./i18n/core";
import {
  msdSupportsKeyCount,
  notesToMsdRows,
  type MsdRating,
} from "./msd/minacalc";

export const MAP_CARD_BACKGROUNDS = ["banner", "full", "none"] as const;
export type MapCardBackground = (typeof MAP_CARD_BACKGROUNDS)[number];

export const MAP_CARD_LAYOUTS = ["detailed", "compact"] as const;
export type MapCardLayout = (typeof MAP_CARD_LAYOUTS)[number];

export const MAP_CARD_SKILLSET_STYLES = ["bars", "tiles", "pills"] as const;
export type MapCardSkillsetStyle = (typeof MAP_CARD_SKILLSET_STYLES)[number];

export const MAP_CARD_ACCENT_COLORS = {
  cascade: "#e86868",
  blue: "#5bc0ff",
  teal: "#5eead4",
  violet: "#a78bfa",
  amber: "#fbbf24",
  green: "#4ade80",
} as const;

export const MAP_CARD_ACCENTS = [
  ...(Object.keys(MAP_CARD_ACCENT_COLORS) as (keyof typeof MAP_CARD_ACCENT_COLORS)[]),
  "difficulty",
] as const;
export type MapCardAccent = (typeof MAP_CARD_ACCENTS)[number];

export const MAP_CARD_STATS = [
  "starRating",
  "msd",
  "bpm",
  "length",
  "notes",
  "longNotes",
  "nps",
  "judgement",
] as const;
export type MapCardStat = (typeof MAP_CARD_STATS)[number];

export type MapCardConfig = {
  backgroundMode: MapCardBackground;
  blur: number;
  overlayOpacity: number;
  layout: MapCardLayout;
  skillsetStyle: MapCardSkillsetStyle;
  accent: MapCardAccent;
  visibleStats: Record<MapCardStat, boolean>;
  showBranding: boolean;
};

export const MAP_CARD_BLUR_MAX = 24;
export const MAP_CARD_OVERLAY_MAX = 0.9;
export const MAP_CARD_PRESET_NAME_MAX = 40;
export const MAP_CARD_PRESET_LIMIT = 50;

const ALL_STATS = Object.fromEntries(
  MAP_CARD_STATS.map((stat) => [stat, true]),
) as Record<MapCardStat, boolean>;

export const DEFAULT_MAP_CARD_CONFIG: MapCardConfig = {
  backgroundMode: "banner",
  blur: 0,
  overlayOpacity: 0.3,
  layout: "detailed",
  skillsetStyle: "bars",
  accent: "cascade",
  visibleStats: ALL_STATS,
  showBranding: true,
};

export type MapCardPresetOption = {
  id: string;
  name: string;
  config: MapCardConfig;
  builtIn: boolean;
  labelKey?: MessageKey;
};

export const BUILT_IN_MAP_CARD_PRESETS: MapCardPresetOption[] = [
  {
    id: "builtin:default",
    name: "Default",
    labelKey: "mapCard.presetDefault",
    builtIn: true,
    config: DEFAULT_MAP_CARD_CONFIG,
  },
  {
    id: "builtin:minimal",
    name: "Minimal",
    labelKey: "mapCard.presetMinimal",
    builtIn: true,
    config: {
      ...DEFAULT_MAP_CARD_CONFIG,
      backgroundMode: "none",
      layout: "compact",
      skillsetStyle: "pills",
      visibleStats: {
        ...ALL_STATS,
        notes: false,
        longNotes: false,
        nps: false,
        judgement: false,
      },
    },
  },
  {
    id: "builtin:banner",
    name: "Background Banner",
    labelKey: "mapCard.presetBanner",
    builtIn: true,
    config: {
      ...DEFAULT_MAP_CARD_CONFIG,
      backgroundMode: "banner",
      blur: 3,
      overlayOpacity: 0.2,
      skillsetStyle: "tiles",
      accent: "difficulty",
    },
  },
  {
    id: "builtin:full",
    name: "Full Background",
    labelKey: "mapCard.presetFull",
    builtIn: true,
    config: {
      ...DEFAULT_MAP_CARD_CONFIG,
      backgroundMode: "full",
      blur: 10,
      overlayOpacity: 0.55,
    },
  },
  {
    id: "builtin:tournament",
    name: "Tournament Style",
    labelKey: "mapCard.presetTournament",
    builtIn: true,
    config: {
      ...DEFAULT_MAP_CARD_CONFIG,
      backgroundMode: "full",
      blur: 18,
      overlayOpacity: 0.7,
      skillsetStyle: "tiles",
      accent: "amber",
    },
  },
];

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeMapCardConfig(value: unknown): MapCardConfig {
  const base = DEFAULT_MAP_CARD_CONFIG;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...base, visibleStats: { ...base.visibleStats } };
  }
  const raw = value as Partial<Record<keyof MapCardConfig, unknown>>;
  const rawStats =
    raw.visibleStats && typeof raw.visibleStats === "object" && !Array.isArray(raw.visibleStats)
      ? (raw.visibleStats as Record<string, unknown>)
      : {};
  const visibleStats = { ...base.visibleStats };
  for (const stat of MAP_CARD_STATS) {
    if (typeof rawStats[stat] === "boolean") visibleStats[stat] = rawStats[stat] as boolean;
  }
  return {
    backgroundMode: pick(raw.backgroundMode, MAP_CARD_BACKGROUNDS, base.backgroundMode),
    blur: Math.round(clampNumber(raw.blur, 0, MAP_CARD_BLUR_MAX, base.blur)),
    overlayOpacity:
      Math.round(
        clampNumber(raw.overlayOpacity, 0, MAP_CARD_OVERLAY_MAX, base.overlayOpacity) * 100,
      ) / 100,
    layout: pick(raw.layout, MAP_CARD_LAYOUTS, base.layout),
    skillsetStyle: pick(raw.skillsetStyle, MAP_CARD_SKILLSET_STYLES, base.skillsetStyle),
    accent: pick(raw.accent, MAP_CARD_ACCENTS, base.accent),
    visibleStats,
    showBranding:
      typeof raw.showBranding === "boolean" ? raw.showBranding : base.showBranding,
  };
}

export function mapCardConfigsEqual(a: MapCardConfig, b: MapCardConfig): boolean {
  return (
    a.backgroundMode === b.backgroundMode &&
    a.blur === b.blur &&
    a.overlayOpacity === b.overlayOpacity &&
    a.layout === b.layout &&
    a.skillsetStyle === b.skillsetStyle &&
    a.accent === b.accent &&
    a.showBranding === b.showBranding &&
    MAP_CARD_STATS.every((stat) => a.visibleStats[stat] === b.visibleStats[stat])
  );
}

export function cleanPresetName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAP_CARD_PRESET_NAME_MAX);
}

export type MapCardMsdStatus =
  | "ready"
  | "loading"
  | "unsupported"
  | "empty"
  | "failed";

export function mapCardMsdStatus(
  difficulty: Pick<Difficulty, "notes" | "keyCount">,
  rating: MsdRating | null | undefined,
): MapCardMsdStatus {
  if (!msdSupportsKeyCount(difficulty.keyCount)) return "unsupported";
  if (notesToMsdRows(difficulty.notes, difficulty.keyCount).length <= 1) {
    return "empty";
  }
  if (rating === undefined) return "loading";
  if (rating === null) return "failed";
  return rating.overall > 0 ? "ready" : "empty";
}

export type MapCardData = {
  title: string;
  artist: string;
  creator: string;
  difficultyName: string;
  keyCount: number;
  starRating: number;
  bpm: number | null;
  bpmMin: number | null;
  bpmMax: number | null;
  lengthMs: number;
  notes: number;
  holds: number;
  lnRatio: number;
  avgNps: number;
  peakNps: number;
  overallDifficulty: number;
  hpDrainRate: number;
  msd: MsdRating | null;
};

export function buildMapCardData(input: {
  meta: SongMeta;
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
  msd: MsdRating | null;
}): MapCardData {
  const { meta, difficulty, timingPoints } = input;
  const stats = computeMapStats(difficulty.notes, difficulty.keyCount);
  const lastNoteEnd = difficulty.notes.reduce(
    (end, note) => Math.max(end, note.endTime ?? note.startTime),
    0,
  );
  const range = bpmRange(timingPoints);
  const bpm = range ? dominantBpm(timingPoints, lastNoteEnd || null) : 0;
  return {
    title: meta.title.trim() || "Untitled",
    artist: meta.artist.trim(),
    creator: meta.creator.trim(),
    difficultyName: difficulty.name.trim() || "Unnamed",
    keyCount: difficulty.keyCount,
    starRating: computeStarRating(difficulty.notes, difficulty.keyCount),
    bpm: bpm > 0 ? bpm : null,
    bpmMin: range && range.varies ? range.min : null,
    bpmMax: range && range.varies ? range.max : null,
    lengthMs: stats.spanMs,
    notes: stats.notes,
    holds: stats.holds,
    lnRatio: stats.lnRatio,
    avgNps: stats.avgNps,
    peakNps: stats.peakNps,
    overallDifficulty: difficulty.overallDifficulty,
    hpDrainRate: difficulty.hpDrainRate,
    msd: input.msd && input.msd.overall > 0 ? input.msd : null,
  };
}

export function formatCardBpm(bpm: number): string {
  return formatUiNumber(bpm, 2);
}

export function formatCardCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function mapCardKey(input: {
  projectId: string;
  difficulty: Pick<Difficulty, "id" | "beatmapId">;
}): string {
  const beatmapId = input.difficulty.beatmapId;
  if (beatmapId && Number.isSafeInteger(beatmapId) && beatmapId > 0) {
    return `osu-${beatmapId}`;
  }
  const clean = (part: string) => part.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 90);
  return `${clean(input.projectId) || "project"}.${clean(input.difficulty.id) || "difficulty"}`;
}

export function mapCardFilename(meta: SongMeta, difficulty: Difficulty): string {
  return osuFilename(meta, difficulty).replace(/\.osu$/i, " card.png");
}

export function mapCardBbcode(url: string): string {
  return `[img]${url}[/img]`;
}

const LAST_CONFIG_KEY = "mania-editor:map-card-config";

export function loadLastMapCardConfig(): MapCardConfig | null {
  try {
    const raw = localStorage.getItem(LAST_CONFIG_KEY);
    return raw ? normalizeMapCardConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveLastMapCardConfig(config: MapCardConfig): void {
  try {
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(config));
  } catch {
  }
}
