import type { Difficulty, LoadedFile, ManiaNote, SongMeta } from "../types";
import { difficultyRate } from "./rateChange";
import { redPoints, sortedPoints } from "./timing";
import { formatUiNumber } from "./formatUiNumber";
import { analyzePatterns, readinessScore, type CriteriaPenalty, type PatternFeatures } from "./patternQuality";
import { compareToCorpus, formatCorpusValue, type CorpusComparison } from "./patternCorpus";
import { checkRankingCriteria, difficultyTier, type Tier } from "./rankingCriteria";
import { t } from "./i18n/core";
import type { AiModFileFacts } from "./aimodFiles";
import type { SampleFile } from "./mapSamples";

export {
  AIMOD_SNAP_DIVISORS,
  countUnsnapped,
  formatAiModTime,
  isUnsnapped,
  nearestSnap,
  resnapNotes,
  type SnapResult,
} from "./snapCheck";
import { formatAiModTime, nearestSnap } from "./snapCheck";

export type AiModCategory =
  | "Criteria"
  | "Guidelines"
  | "Patterns"
  | "Compose"
  | "Design"
  | "Timing"
  | "Meta"
  | "Mapset";

export const AIMOD_CATEGORIES: AiModCategory[] = [
  "Criteria",
  "Guidelines",
  "Patterns",
  "Compose",
  "Design",
  "Timing",
  "Meta",
  "Mapset",
];

export type AiModSeverity = "warning" | "error";

export const AIMOD_CONCURRENT_MS = 30;
export const AIMOD_MIN_LONG_NOTE_MS = 30;
/** Density ratio between neighbouring difficulties that counts as a spread gap. */
export const AIMOD_SPREAD_GAP_RATIO = 2;

export type AiModObject = { time: number; column: number };

export type AiModDetail = {
  time: number;
  label: string;
  /** End of the passage this detail covers, when it spans one rather than a moment. */
  endTime?: number;
  objects?: AiModObject[];
};

export type AiModIssue = {
  rule?: string;
  id: string;
  category: AiModCategory;
  severity: AiModSeverity;
  message: string;
  /** Difficulty this issue belongs to (omitted for whole-mapset issues). */
  diffId?: string;
  /** Time in ms to jump to when the issue is clicked. */
  time?: number;
  count?: number;
  details?: AiModDetail[];
};

export type AiModReport = {
  issues: AiModIssue[];
  warnings: number;
  errors: number;
  quality: {
    score: number | null;
    difficulties: { id: string; name: string; tier: Tier; score: number | null; features: PatternFeatures; comparison: CorpusComparison }[];
  };
};

export type AiModArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles: Record<string, LoadedFile>;
  /**
   * Length of the source audio file in ms, unscaled by any difficulty rate.
   * Enables the length, drain and past-the-end-of-audio checks.
   */
  audioDurationMs?: number;
  /**
   * What reading the audio and background files turned up. The file checks
   * are skipped until it arrives.
   */
  files?: AiModFileFacts;
  /** The mapset's own samples, so facts about a replaced one are ignored. */
  sampleFiles?: Record<string, SampleFile>;
};

// Ranking Criteria limits, the same ones osu!lazer's verify checks use.
export const AIMOD_MAX_BITRATE_KBPS = 192;
export const AIMOD_MAX_BITRATE_OGG_KBPS = 208;
export const AIMOD_MIN_BITRATE_KBPS = 128;
export const AIMOD_BG_MAX = { width: 2560, height: 1440 };
export const AIMOD_BG_MIN = { width: 160, height: 120 };
/** Below this a sharper copy of the same image can usually be found. */
export const AIMOD_BG_LOW = { width: 960, height: 540 };
export const AIMOD_BG_MAX_MB = 2.5;
/** Share of the song that should be mapped before the outro counts as unused. */
export const AIMOD_MIN_MAPPED_PERCENT = 80;
/** Shorter audio doesn't play on some sound cards. */
export const AIMOD_MIN_AUDIO_MS = 25;
/** A hitsound this late, in ms, is heard off the beat. */
export const AIMOD_HITSOUND_DELAY_MS = 5;

const TITLE_MARKERS: { marker: string; pattern: RegExp }[] = [
  { marker: "(TV Size)", pattern: /tv (size|ver)/i },
  { marker: "(Game Ver.)", pattern: /game (size|ver)/i },
  { marker: "(Short Ver.)", pattern: /short (size|ver)/i },
  { marker: "(Cut Ver.)", pattern: /(?<!& )cut (size|ver)/i },
  { marker: "(Sped Up Ver.)", pattern: /(?<!& )(sped|speed) ?up ver/i },
  { marker: "(Nightcore Mix)", pattern: /(?<!& )(nightcore|night core) (ver|mix)/i },
  { marker: "(Sped Up & Cut Ver.)", pattern: /(sped|speed) ?up (ver)? ?& cut (size|ver)/i },
  { marker: "(Nightcore & Cut Ver.)", pattern: /(nightcore|night core) (ver|mix)? ?& cut (size|ver)/i },
];

/** Markers the title spells differently from the form the Ranking Criteria require. */
export function misformattedTitleMarkers(title: string): string[] {
  return TITLE_MARKERS.filter(
    ({ marker, pattern }) => pattern.test(title) && !title.includes(marker),
  ).map(({ marker }) => marker);
}

// The website's genre and language filters, as osu!lazer checks tags against them.
const GENRE_TAGS = ["video game", "anime", "rock", "pop", "other", "novelty", "hip hop", "electronic", "metal", "classical", "folk", "jazz"];
const LANGUAGE_TAGS = ["english", "japanese", "chinese", "instrumental", "korean", "french", "german", "swedish", "spanish", "italian", "russian", "polish", "other"];

function tagsInclude(tags: string, options: string[]): boolean {
  const words = new Set(tags.toLowerCase().split(/\s+/).filter(Boolean));
  return options.some((option) => option.split(" ").every((word) => words.has(word)));
}

export function hasGenreTag(tags: string): boolean {
  return tagsInclude(tags, GENRE_TAGS);
}

export function hasLanguageTag(tags: string): boolean {
  return tagsInclude(tags, LANGUAGE_TAGS);
}

/** Export writes a rate-changed or trimmed difficulty its own audio file. */
function bakesOwnAudio(d: Difficulty): boolean {
  return difficultyRate(d) !== 1 || (d.trimStartMs ?? 0) > 0.5 || d.trimEndMs !== undefined;
}

function formatMb(bytes: number): string {
  return formatUiNumber(Math.round((bytes / (1024 * 1024)) * 100) / 100);
}

const MIN_MAP_LENGTH_MS = 30_000;
const RECOMMENDED_MAP_LENGTH_MS = 45_000;
const MAX_DETAILS = 1000;


export function formatAiModObjects(objects?: AiModObject[]): string {
  if (!objects || objects.length === 0) return "";
  return `(${objects
    .map((o) => `${Math.round(o.time)}|${o.column + 1}`)
    .join(",")})`;
}

function objectRef(time: number, column: number): AiModObject {
  return { time: Math.round(time), column };
}

/** Total time spanned by the notes of a difficulty (first to last). */
function mappedSpanMs(d: Difficulty): number {
  if (d.notes.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const n of d.notes) {
    if (n.startTime < min) min = n.startTime;
    const end = n.endTime ?? n.startTime;
    if (end > max) max = end;
  }
  return max - min;
}

export function runAiMod({
  meta,
  difficulties,
  audioFiles,
  bgFiles,
  audioDurationMs,
  files,
  sampleFiles,
}: AiModArgs): AiModReport {
  const issues: AiModIssue[] = [];
  let seq = 0;
  const add = (i: Omit<AiModIssue, "id">) =>
    issues.push({ ...i, id: `ai_${seq++}` });
  const addGroup = (
    i: Omit<AiModIssue, "id" | "time" | "count" | "details">,
    details: AiModDetail[],
  ) => {
    if (details.length === 0) return;
    const sorted = [...details].sort((a, b) => a.time - b.time);
    add({
      ...i,
      time: sorted[0].time,
      count: sorted.length,
      details: sorted.slice(0, MAX_DETAILS),
    });
  };

  // --- Mapset-wide metadata (Meta) ---
  if (!meta.title.trim())
    add({ category: "Meta", severity: "error", message: t("aimod.missingTitle") });
  if (!meta.artist.trim())
    add({ category: "Meta", severity: "error", message: t("aimod.missingArtist") });
  if (!meta.creator.trim())
    add({ category: "Meta", severity: "error", message: t("aimod.missingCreator") });
  if (!(meta.tags ?? "").trim())
    add({
      category: "Meta",
      severity: "warning",
      message: t("aimod.noTags"),
    });

  const tags = meta.tags ?? "";
  if (tags.trim()) {
    if (!hasGenreTag(tags))
      add({ category: "Meta", severity: "warning", message: t("aimod.noGenreTag") });
    if (!hasLanguageTag(tags))
      add({ category: "Meta", severity: "warning", message: t("aimod.noLanguageTag") });
  }

  for (const marker of misformattedTitleMarkers(meta.title))
    add({ category: "Meta", severity: "error", message: t("aimod.titleMarker", { marker }) });
  const unicodeTitle = meta.titleUnicode?.trim();
  if (unicodeTitle && unicodeTitle !== meta.title.trim())
    for (const marker of misformattedTitleMarkers(unicodeTitle))
      add({ category: "Meta", severity: "error", message: t("aimod.unicodeTitleMarker", { marker }) });

  // --- Mapset (audio + set-wide) ---
  if (Object.keys(audioFiles).length === 0)
    add({ category: "Mapset", severity: "error", message: t("aimod.noAudio") });

  if (difficulties.length === 0)
    add({
      category: "Mapset",
      severity: "error",
      message: t("aimod.noDifficulties"),
    });

  const keyCounts = new Set(difficulties.map((d) => d.keyCount));
  if (difficulties.length > 1 && keyCounts.size > 1) {
    // Not an error (mixed-key sets are legal) but worth surfacing.
    add({
      category: "Mapset",
      severity: "warning",
      message: t("aimod.mixedKeys", { keys: `${[...keyCounts].sort((a, b) => a - b).join("K, ")}K` }),
    });
  }

  // A large jump in density between neighbouring difficulties is one of the
  // first things a spread gets modded for. Compared only within a key count,
  // since a 4K and a 7K difficulty aren't a spread of one another.
  const byKeyCount = new Map<number, Difficulty[]>();
  for (const d of difficulties) {
    if (d.notes.length === 0) continue;
    const arr = byKeyCount.get(d.keyCount);
    if (arr) arr.push(d);
    else byKeyCount.set(d.keyCount, [d]);
  }
  for (const group of byKeyCount.values()) {
    if (group.length < 2) continue;
    const ranked = group
      .map((d) => {
        const span = mappedSpanMs(d);
        return { d, density: span > 0 ? (d.notes.length / span) * 1000 : 0 };
      })
      .filter((entry) => entry.density > 0)
      .sort((a, b) => a.density - b.density);
    for (let i = 0; i < ranked.length - 1; i++) {
      const lower = ranked[i];
      const upper = ranked[i + 1];
      if (upper.density < lower.density * AIMOD_SPREAD_GAP_RATIO) continue;
      add({
        category: "Mapset",
        severity: "warning",
        message: t("aimod.spreadGap", {
          upper: upper.d.name,
          ratio: (upper.density / lower.density).toFixed(1),
          lower: lower.d.name,
          upperNps: upper.density.toFixed(1),
          lowerNps: lower.density.toFixed(1),
        }),
      });
    }
  }

  const nameCounts = new Map<string, number>();
  for (const d of difficulties) {
    const key = d.name.trim().toLowerCase();
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const reportedNames = new Set<string>();
  for (const d of difficulties) {
    const key = d.name.trim().toLowerCase();
    const n = nameCounts.get(key) ?? 0;
    if (n < 2 || reportedNames.has(key)) continue;
    reportedNames.add(key);
    add({
      category: "Mapset",
      severity: "error",
      message: t("aimod.sharedName", { count: n, name: d.name.trim() }),
    });
  }

  // --- Mapset: what reading the files turned up ---
  if (files) {
    for (const [name, file] of Object.entries(audioFiles)) {
      const facts = files.audio[name];
      if (!facts || facts.blob !== file.blob) continue;
      if (facts.bytes === 0) {
        add({ category: "Mapset", severity: "error", message: t("aimod.emptyFile", { file: name }) });
        continue;
      }
      if (facts.format !== "mp3" && facts.format !== "ogg") {
        add({ category: "Mapset", severity: "error", message: t("aimod.songFormat", { file: name }) });
        continue;
      }
      const max = facts.format === "ogg" ? AIMOD_MAX_BITRATE_OGG_KBPS : AIMOD_MAX_BITRATE_KBPS;
      if (facts.bitrateKbps === null) continue;
      if (facts.bitrateKbps > max)
        add({
          category: "Mapset",
          severity: "error",
          message: t("aimod.bitrateHigh", { file: name, kbps: facts.bitrateKbps, max }),
        });
      else if (facts.bitrateKbps < AIMOD_MIN_BITRATE_KBPS)
        add({
          category: "Mapset",
          severity: "error",
          message: t("aimod.bitrateLow", { file: name, kbps: facts.bitrateKbps, min: AIMOD_MIN_BITRATE_KBPS }),
        });
    }

    const usedBackgrounds = new Set(
      difficulties.map((d) => d.backgroundFilename).filter((name): name is string => !!name),
    );
    for (const name of usedBackgrounds) {
      const file = bgFiles[name];
      const facts = files.backgrounds[name];
      if (!file || !facts || facts.blob !== file.blob) continue;
      if (facts.bytes === 0) {
        add({ category: "Mapset", severity: "error", message: t("aimod.emptyFile", { file: name }) });
        continue;
      }
      if (facts.width !== null && facts.height !== null) {
        // Pixel sizes read as plain digits, without thousands separators.
        const size = { file: name, width: String(facts.width), height: String(facts.height) };
        if (facts.width > AIMOD_BG_MAX.width || facts.height > AIMOD_BG_MAX.height)
          add({
            category: "Mapset",
            severity: "error",
            message: t("aimod.bgTooLarge", { ...size, maxWidth: String(AIMOD_BG_MAX.width), maxHeight: String(AIMOD_BG_MAX.height) }),
          });
        if (facts.width < AIMOD_BG_MIN.width || facts.height < AIMOD_BG_MIN.height)
          add({
            category: "Mapset",
            severity: "error",
            message: t("aimod.bgTooSmall", { ...size, minWidth: String(AIMOD_BG_MIN.width), minHeight: String(AIMOD_BG_MIN.height) }),
          });
        else if (facts.width < AIMOD_BG_LOW.width || facts.height < AIMOD_BG_LOW.height)
          add({
            category: "Mapset",
            severity: "warning",
            message: t("aimod.bgLow", { ...size, minWidth: String(AIMOD_BG_LOW.width), minHeight: String(AIMOD_BG_LOW.height) }),
          });
      }
      if (facts.bytes > AIMOD_BG_MAX_MB * 1024 * 1024)
        add({
          category: "Mapset",
          severity: "error",
          message: t("aimod.bgFileSize", { file: name, mb: formatMb(facts.bytes), max: formatUiNumber(AIMOD_BG_MAX_MB) }),
        });
    }
  }

  if (files?.samples) {
    for (const [name, facts] of Object.entries(files.samples)) {
      if (sampleFiles?.[name]?.blob !== facts.blob) continue;
      if (facts.bytes === 0) {
        add({ category: "Mapset", severity: "error", message: t("aimod.emptyFile", { file: name }) });
        continue;
      }
      if (facts.durationMs !== null && facts.durationMs > 0 && facts.durationMs < AIMOD_MIN_AUDIO_MS)
        add({
          category: "Mapset",
          severity: "error",
          message: t("aimod.sampleTooShort", {
            file: name,
            ms: String(Math.round(facts.durationMs)),
            min: AIMOD_MIN_AUDIO_MS,
          }),
        });
      const delay = facts.delay;
      if (!delay) continue;
      if (delay.silentMs >= AIMOD_HITSOUND_DELAY_MS)
        add({
          category: "Mapset",
          severity: "error",
          message: t("aimod.sampleSilence", { file: name, ms: delay.silentMs }),
        });
      // lazer weighs silence twice here; matched so the same files are flagged.
      else if (delay.silentMs + delay.delayMs >= AIMOD_HITSOUND_DELAY_MS)
        add({
          category: "Mapset",
          severity: "warning",
          message: t("aimod.sampleDelay", { file: name, ms: delay.delayMs }),
        });
    }
  }

  // --- Mapset: settings every difficulty must share ---
  // Rate-changed and trimmed difficulties are left out: export bakes each its
  // own audio file, so their file and preview time differ by design.
  const sameRate = difficulties.filter((d) => !bakesOwnAudio(d));
  if (sameRate.length > 1) {
    const reference = sameRate[0];
    for (const d of sameRate.slice(1)) {
      if ((d.audioFilename ?? "") !== (reference.audioFilename ?? ""))
        add({
          category: "Mapset",
          severity: "error",
          message: t("aimod.inconsistentAudio", { name: d.name, reference: reference.name }),
          diffId: d.id,
        });
      if (Math.round(d.previewTime) !== Math.round(reference.previewTime))
        add({
          category: "Mapset",
          severity: "error",
          message: t("aimod.inconsistentPreview", {
            name: d.name,
            reference: reference.name,
            time: formatAiModTime(d.previewTime),
            referenceTime: formatAiModTime(reference.previewTime),
          }),
          diffId: d.id,
          time: d.previewTime >= 0 ? d.previewTime : undefined,
        });
    }
  }

  for (const d of difficulties) {
    const diffId = d.id;
    const points = d.timingPoints?.length ? d.timingPoints : [];
    const sortedNotes = [...d.notes].sort(
      (a, b) => a.startTime - b.startTime || a.column - b.column,
    );
    const audioEnd =
      audioDurationMs !== undefined && audioDurationMs > 0
        ? audioDurationMs / difficultyRate(d)
        : undefined;

    // --- Timing ---
    const reds = redPoints(points);
    if (reds.length === 0) {
      add({
        category: "Timing",
        severity: "error",
        message: `[${d.name}] ${t("aimod.noRedPoint")}`,
        diffId,
      });
    } else {
      const firstRed = reds[0];
      const firstNote = sortedNotes[0];
      if (firstNote && firstNote.startTime < firstRed.time - 1) {
        add({
          category: "Timing",
          severity: "warning",
          message: `[${d.name}] ${t("aimod.objectBeforeTiming")}`,
          diffId,
          time: firstNote.startTime,
        });
      }
    }

    const badBpm: AiModDetail[] = [];
    const duplicatePoints: AiModDetail[] = [];
    const earlyGreens: AiModDetail[] = [];
    const seenPoints = new Set<string>();
    for (const p of sortedPoints(points)) {
      if (p.uninherited && !(Number.isFinite(p.bpm) && p.bpm > 0))
        badBpm.push({ time: p.time, label: t("aimod.bpmIs", { bpm: formatUiNumber(p.bpm) }) });
      const key = `${p.uninherited ? "red" : "green"}@${Math.round(p.time)}`;
      if (seenPoints.has(key))
        duplicatePoints.push({
          time: p.time,
          label: p.uninherited ? t("aimod.twoRed") : t("aimod.twoGreen"),
        });
      else seenPoints.add(key);
      if (!p.uninherited && reds.length > 0 && p.time < reds[0].time)
        earlyGreens.push({
          time: p.time,
          label: t("aimod.earlyGreenDetail"),
        });
    }
    addGroup(
      {
        category: "Timing",
        severity: "error",
        message: `[${d.name}] ${t("aimod.invalidBpm")}`,
        diffId,
      },
      badBpm,
    );
    addGroup(
      {
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.duplicatePoints")}`,
        diffId,
      },
      duplicatePoints,
    );
    addGroup(
      {
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.earlyGreens")}`,
        diffId,
      },
      earlyGreens,
    );

    // --- Compose: unsnapped objects ---
    if (reds.length > 0) {
      const unsnappedStarts: AiModDetail[] = [];
      const unsnappedEnds: AiModDetail[] = [];
      for (const n of sortedNotes) {
        const start = nearestSnap(n.startTime, points);
        if (start.unsnap > 0)
          unsnappedStarts.push({
            time: n.startTime,
            objects: [objectRef(n.startTime, n.column)],
            label: t("aimod.unsnappedBy", { ms: start.unsnap, divisor: start.divisor }),
          });
        if (n.endTime !== undefined) {
          const end = nearestSnap(n.endTime, points);
          if (end.unsnap > 0)
            unsnappedEnds.push({
              time: n.endTime,
              objects: [objectRef(n.endTime, n.column)],
              label: t("aimod.unsnappedBy", { ms: end.unsnap, divisor: end.divisor }),
            });
        }
      }
      addGroup(
        {
          category: "Compose",
          severity: "warning",
          message: `[${d.name}] ${t("aimod.unsnapped")}`,
          diffId,
        },
        unsnappedStarts,
      );
      addGroup(
        {
          category: "Compose",
          severity: "warning",
          message: `[${d.name}] ${t("aimod.unsnappedEnds")}`,
          diffId,
        },
        unsnappedEnds,
      );
    }

    // --- Compose: concurrent objects in the same column ---
    const byCol = new Map<number, ManiaNote[]>();
    for (const n of d.notes) {
      const arr = byCol.get(n.column);
      if (arr) arr.push(n);
      else byCol.set(n.column, [n]);
    }
    const concurrent: AiModDetail[] = [];
    for (const arr of byCol.values()) {
      arr.sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1];
        const cur = arr[i];
        const prevEnd = Math.max(prev.startTime, prev.endTime ?? prev.startTime);
        const gap = Math.round(cur.startTime - prevEnd);
        if (gap >= AIMOD_CONCURRENT_MS) continue;
        concurrent.push({
          time: prev.startTime,
          objects: [
            objectRef(prev.startTime, prev.column),
            objectRef(cur.startTime, cur.column),
          ],
          label:
            gap < 0
              ? t("aimod.overlapping", { ms: -gap })
              : t("aimod.within", { ms: gap }),
        });
      }
    }
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] ${t("aimod.concurrent")}`,
        diffId,
      },
      concurrent,
    );

    const shortHolds: AiModDetail[] = [];
    const invalidHolds: AiModDetail[] = [];
    for (const n of sortedNotes) {
      if (n.endTime === undefined) continue;
      const length = Math.round(n.endTime - n.startTime);
      const objects = [objectRef(n.startTime, n.column)];
      if (length <= 0)
        invalidHolds.push({
          time: n.startTime,
          objects,
          label:
            length === 0
              ? t("aimod.lnNoLength")
              : t("aimod.lnEndsBefore", { ms: -length }),
        });
      else if (length < AIMOD_MIN_LONG_NOTE_MS)
        shortHolds.push({
          time: n.startTime,
          objects,
          label: t("aimod.lnHeldOnly", { ms: length }),
        });
    }
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] ${t("aimod.invalidHolds")}`,
        diffId,
      },
      invalidHolds,
    );
    addGroup(
      {
        category: "Compose",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.shortHolds", { ms: AIMOD_MIN_LONG_NOTE_MS })}`,
        diffId,
      },
      shortHolds,
    );

    // --- Compose: objects outside the playfield or the audio ---
    const invalidCol: AiModDetail[] = [];
    const beforeAudio: AiModDetail[] = [];
    const afterAudio: AiModDetail[] = [];
    for (const n of sortedNotes) {
      const objects = [objectRef(n.startTime, n.column)];
      if (n.column < 0 || n.column >= d.keyCount)
        invalidCol.push({
          time: n.startTime,
          objects,
          label: t("aimod.columnOutside", { column: n.column + 1, keys: d.keyCount }),
        });
      if (n.startTime < 0)
        beforeAudio.push({
          time: n.startTime,
          objects,
          label: t("aimod.startsBeforeAudio", { ms: Math.round(-n.startTime) }),
        });
      const end = n.endTime ?? n.startTime;
      if (audioEnd !== undefined && end > audioEnd)
        afterAudio.push({
          time: n.startTime,
          objects,
          label: t("aimod.endsAfterAudio", { ms: Math.round(end - audioEnd) }),
        });
    }
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] ${t("aimod.invalidColumns", { keys: d.keyCount })}`,
        diffId,
      },
      invalidCol,
    );
    addGroup(
      {
        category: "Compose",
        severity: "error",
        message: `[${d.name}] ${t("aimod.beforeAudio")}`,
        diffId,
      },
      beforeAudio,
    );
    addGroup(
      {
        category: "Compose",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.afterAudio")}`,
        diffId,
      },
      afterAudio,
    );

    // --- Compose: unused audio at the end ---
    // A trimmed difficulty exports only the part of the song it keeps, so the
    // full file's length says nothing about its outro.
    if (audioEnd !== undefined && audioEnd > 0 && sortedNotes.length > 0 && !bakesOwnAudio(d)) {
      let lastEnd = 0;
      for (const n of sortedNotes) lastEnd = Math.max(lastEnd, n.endTime ?? n.startTime);
      const mappedPercent = Math.round((lastEnd / audioEnd) * 100);
      if (mappedPercent < AIMOD_MIN_MAPPED_PERCENT)
        add({
          category: "Compose",
          severity: "warning",
          message: `[${d.name}] ${t("aimod.unusedAudioEnd", { percent: 100 - mappedPercent })}`,
          diffId,
          time: lastEnd,
        });
    }

    // --- Compose: empty difficulty / no hitsounds ---
    if (d.notes.length === 0) {
      add({
        category: "Compose",
        severity: "error",
        message: `[${d.name}] ${t("aimod.noObjects")}`,
        diffId,
      });
    } else {
      const anyHitsound = d.notes.some(
        (n) => (n.hitSound ?? 0) !== 0 || (n.sampleFile ?? "") !== "",
      );
      if (!anyHitsound)
        add({
          category: "Compose",
          severity: "warning",
          message: `[${d.name}] ${t("aimod.noHitsounds")}`,
          diffId,
        });
    }

    // --- Design: difficulty settings ---
    if (d.overallDifficulty < 0 || d.overallDifficulty > 10)
      add({
        category: "Design",
        severity: "error",
        message: `[${d.name}] ${t("aimod.odRange", { value: d.overallDifficulty })}`,
        diffId,
      });
    if (d.hpDrainRate < 0 || d.hpDrainRate > 10)
      add({
        category: "Design",
        severity: "error",
        message: `[${d.name}] ${t("aimod.hpRange", { value: d.hpDrainRate })}`,
        diffId,
      });

    // --- Design: background ---
    if (!d.backgroundFilename || !bgFiles[d.backgroundFilename])
      add({
        category: "Design",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.noBackground")}`,
        diffId,
      });

    // --- Meta: difficulty name ---
    if (!d.name.trim())
      add({
        category: "Meta",
        severity: "error",
        message: t("aimod.noName"),
        diffId,
      });

    // --- Timing: preview point ---
    if (d.previewTime < 0)
      add({
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.noPreview")}`,
        diffId,
      });
    else if (audioEnd !== undefined && d.previewTime > audioEnd)
      add({
        category: "Timing",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.previewAfterAudio")}`,
        diffId,
        time: d.previewTime,
      });

    // --- Mapset: audio reference ---
    if (
      d.audioFilename &&
      !audioFiles[d.audioFilename] &&
      Object.keys(audioFiles).length > 1
    )
      add({
        category: "Mapset",
        severity: "error",
        message: `[${d.name}] ${t("aimod.audioMissing", { file: d.audioFilename })}`,
        diffId,
      });

    // --- Mapset: length / drain ---
    const span = mappedSpanMs(d);
    if (d.notes.length > 0 && span < MIN_MAP_LENGTH_MS)
      add({
        category: "Mapset",
        severity: "error",
        message: `[${d.name}] ${t("aimod.drainShort")}`,
        diffId,
      });
    else if (audioEnd !== undefined && audioEnd < RECOMMENDED_MAP_LENGTH_MS)
      add({
        category: "Mapset",
        severity: "warning",
        message: `[${d.name}] ${t("aimod.mapShort")}`,
        diffId,
      });
  }

  const criteriaPenalties = new Map<string, CriteriaPenalty[]>();
  const mapsetPenalties: CriteriaPenalty[] = [];
  for (const finding of checkRankingCriteria(difficulties, audioDurationMs)) {
    const shared = {
      category: (finding.guideline ? "Guidelines" : "Criteria") as AiModCategory,
      severity: finding.severity,
      rule: finding.rule,
      message: finding.message,
      diffId: finding.diffId,
    };
    if (finding.details && finding.details.length > 0) addGroup(shared, finding.details);
    else add({ ...shared, time: finding.time });
    const penalty: CriteriaPenalty = {
      severity: finding.severity,
      occurrences: Math.max(1, finding.details?.length ?? 1),
    };
    if (!finding.diffId) mapsetPenalties.push(penalty);
    else criteriaPenalties.set(finding.diffId, [...(criteriaPenalties.get(finding.diffId) ?? []), penalty]);
  }

  const qualityDiffs = difficulties.map(d => {
    const analysis = analyzePatterns(d);
    for (const finding of analysis.findings) addGroup({
      category: "Patterns", severity: "warning", rule: finding.rule,
      message: `[${d.name}] ${finding.message}.`, diffId: d.id,
    }, finding.details);
    const comparison = compareToCorpus(d.keyCount, analysis.windows);
    for (const outlier of comparison.outliers) addGroup({
      category: "Patterns", severity: "warning", rule: `corpus-${outlier.key}`,
      message: `[${d.name}] ${t("aimod.corpusOutlier", { feature: `${outlier.label[0].toUpperCase()}${outlier.label.slice(1)}`, percent: Math.round(outlier.percentile * 100) })}`,
      diffId: d.id,
    }, outlier.spans.map(span => ({ time: span.start, endTime: span.end, label: t("aimod.corpusPeak", { peak: formatCorpusValue(outlier.key, span.peak), threshold: formatCorpusValue(outlier.key, outlier.threshold) }) })));
    const rules = [...mapsetPenalties, ...(criteriaPenalties.get(d.id) ?? [])];
    return { id: d.id, name: d.name, tier: difficultyTier(d), score: readinessScore(d.notes.length, analysis.findings, rules), features: analysis.features, comparison };
  });
  const scores = qualityDiffs.map(d => d.score);
  const quality = { score: scores.length && scores.every(s => s !== null) ? Math.min(...scores as number[]) : null, difficulties: qualityDiffs };
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const errors = issues.filter((i) => i.severity === "error").length;
  return { issues, warnings, errors, quality };
}
