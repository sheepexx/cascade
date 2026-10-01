import type { Difficulty, ManiaNote, SongMeta, TimingPoint } from "../types";

/**
 * Semantic comparison of beatmaps, for checking that an export reads back as
 * the map that was exported.
 *
 * Byte equality is the wrong test: ids are regenerated, numbers are written
 * with different precision, and difficulties may come back in another order.
 * What matters is what a player or a mapper would notice, so this compares
 * notes, holds, hitsounds, timing, SV, metadata and difficulty settings, and
 * describes every difference in words a bug report can carry.
 *
 * Formats differ in what they can hold at all (StepMania has no hitsounds,
 * Quaver no per-note samples, ...), so each comparison runs against the
 * capabilities of the format the map went through.
 */

export type ChartLike = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

export type FormatId = "osu" | "sm" | "qua" | "mc";

export type Capabilities = {
  /** Per-note hitsound, sample set, volume and custom sample file. */
  hitsounds: boolean;
  /** Green lines. */
  sv: boolean;
  /** Meter, sample set and index, volume, kiai and omitted barlines on timing points. */
  timingExtras: boolean;
  meta: (keyof SongMeta)[];
  difficulty: (keyof Difficulty)[];
  /** How far a note may move through the format's own time resolution. */
  noteToleranceMs: number;
  /** Relative tolerance for BPM and SV values. */
  valueTolerance: number;
  /**
   * The format keeps a single offset instead of the first red line's own
   * position (StepMania), so that line may come back whole beats earlier on
   * the same grid.
   */
  gridOnlyFirstRedLine?: boolean;
  /**
   * The format stores where scroll speed changes rather than osu!'s green
   * lines (Quaver), so SV is compared as the speed in force over time.
   */
  effectiveSvOnly?: boolean;
};

export const CAPABILITIES: Record<FormatId, Capabilities> = {
  osu: {
    hitsounds: true,
    sv: true,
    timingExtras: true,
    meta: ["title", "titleUnicode", "artist", "artistUnicode", "creator", "source", "tags", "beatmapSetId"],
    difficulty: [
      "name",
      "keyCount",
      "hpDrainRate",
      "overallDifficulty",
      "previewTime",
      "bookmarks",
      "beatmapId",
      "sampleSet",
      "backgroundFilename",
      "videoFilename",
      "videoOffsetMs",
    ],
    noteToleranceMs: 0,
    valueTolerance: 1e-9,
  },
  sm: {
    hitsounds: false,
    sv: false,
    timingExtras: false,
    meta: ["title", "artist", "creator"],
    difficulty: ["keyCount"],
    // Notes are stored on a 192nd-per-beat grid.
    noteToleranceMs: 2,
    valueTolerance: 1e-3,
    gridOnlyFirstRedLine: true,
  },
  qua: {
    hitsounds: false,
    sv: true,
    timingExtras: false,
    meta: ["title", "artist", "creator", "source", "tags"],
    difficulty: ["name", "keyCount", "previewTime"],
    noteToleranceMs: 1,
    valueTolerance: 1e-3,
    effectiveSvOnly: true,
  },
  mc: {
    hitsounds: false,
    sv: false,
    timingExtras: false,
    meta: ["title", "artist", "creator"],
    difficulty: ["name", "keyCount"],
    // Beat fractions; a note can land a millisecond off its source.
    noteToleranceMs: 2,
    valueTolerance: 1e-3,
    gridOnlyFirstRedLine: true,
  },
};

export type RoundTripIssue = {
  /** Where in the map, e.g. "Insane › notes". */
  path: string;
  message: string;
  /** A handful of concrete cases, for diagnostics. */
  examples?: string[];
};

export type CompareOptions = {
  /** The Cascade watermark is added to tags on export; ignore it. */
  ignoreWatermarkTag?: boolean;
  /** Most examples listed per issue. */
  exampleLimit?: number;
};

const WATERMARK_TAG = "cascade";

function formatMs(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);
  const millis = Math.round(abs % 1000);
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(millis).padStart(3, "0")}`;
}

function noteLabel(n: ManiaNote): string {
  const hold = n.endTime !== undefined ? `–${formatMs(n.endTime)}` : "";
  return `${formatMs(n.startTime)}${hold} lane ${n.column + 1}`;
}

function nearlyEqual(a: number, b: number, relative: number): boolean {
  if (a === b) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= relative * scale;
}

function tagSet(tags: string | undefined, ignoreWatermark: boolean): string {
  const words = (tags ?? "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !ignoreWatermark || w.toLowerCase() !== WATERMARK_TAG);
  return words.join(" ");
}

function emptyish(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** What a field means when it is left out, so absent and default compare equal. */
const FIELD_DEFAULTS: Partial<Record<keyof Difficulty, unknown>> = {
  sampleSet: "Normal",
  beatmapId: 0,
};

function sameValue(a: unknown, b: unknown): boolean {
  if (emptyish(a) && emptyish(b)) return true;
  if (typeof a === "number" && typeof b === "number") return nearlyEqual(a, b, 1e-9);
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The hitsound side of a note, normalised so absent and default read the same. */
function hitsoundKey(n: ManiaNote): string {
  return [
    n.hitSound ?? 0,
    n.sampleSet ?? 0,
    n.additionSet ?? 0,
    n.sampleIndex ?? 0,
    n.sampleVolume ?? 0,
    n.sampleFile ?? "",
  ].join("|");
}

type NotePair = { a: ManiaNote; b: ManiaNote };

/**
 * Pairs notes lane by lane in time order, allowing `tolerance` ms of drift.
 * What is left on either side is missing or extra.
 */
function pairNotes(
  expected: ManiaNote[],
  actual: ManiaNote[],
  tolerance: number,
): { pairs: NotePair[]; missing: ManiaNote[]; extra: ManiaNote[] } {
  const byLane = (notes: ManiaNote[]) => {
    const lanes = new Map<number, ManiaNote[]>();
    for (const n of notes) {
      const lane = lanes.get(n.column) ?? [];
      lane.push(n);
      lanes.set(n.column, lane);
    }
    for (const lane of lanes.values()) lane.sort((x, y) => x.startTime - y.startTime);
    return lanes;
  };
  const left = byLane(expected);
  const right = byLane(actual);
  const pairs: NotePair[] = [];
  const missing: ManiaNote[] = [];
  const extra: ManiaNote[] = [];
  const lanes = new Set([...left.keys(), ...right.keys()]);
  for (const lane of lanes) {
    const a = left.get(lane) ?? [];
    const b = right.get(lane) ?? [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      const delta = b[j].startTime - a[i].startTime;
      if (Math.abs(delta) <= tolerance) {
        pairs.push({ a: a[i++], b: b[j++] });
      } else if (delta > 0) {
        missing.push(a[i++]);
      } else {
        extra.push(b[j++]);
      }
    }
    while (i < a.length) missing.push(a[i++]);
    while (j < b.length) extra.push(b[j++]);
  }
  const byTime = (x: ManiaNote, y: ManiaNote) => x.startTime - y.startTime || x.column - y.column;
  return { pairs, missing: missing.sort(byTime), extra: extra.sort(byTime) };
}

function effectiveTiming(chart: ChartLike, d: Difficulty): TimingPoint[] {
  const points = d.timingPoints?.length ? d.timingPoints : chart.timingPoints;
  return [...points].sort((x, y) => x.time - y.time || Number(y.uninherited) - Number(x.uninherited));
}

function compareNotes(
  label: string,
  a: ManiaNote[],
  b: ManiaNote[],
  caps: Capabilities,
  limit: number,
  issues: RoundTripIssue[],
): void {
  const { pairs, missing, extra } = pairNotes(a, b, caps.noteToleranceMs);
  if (missing.length) {
    issues.push({
      path: `${label} › notes`,
      message: `${missing.length} of ${a.length} notes are missing`,
      examples: missing.slice(0, limit).map(noteLabel),
    });
  }
  if (extra.length) {
    issues.push({
      path: `${label} › notes`,
      message: `${extra.length} notes appeared that were not there`,
      examples: extra.slice(0, limit).map(noteLabel),
    });
  }
  const holds: string[] = [];
  let holdCount = 0;
  const sounds: string[] = [];
  let soundCount = 0;
  for (const { a: x, b: y } of pairs) {
    const xHold = x.endTime !== undefined;
    const yHold = y.endTime !== undefined;
    if (
      xHold !== yHold ||
      (xHold && yHold && Math.abs((x.endTime as number) - (y.endTime as number)) > caps.noteToleranceMs)
    ) {
      holdCount += 1;
      if (holds.length < limit) holds.push(`${noteLabel(x)} became ${noteLabel(y)}`);
    }
    if (caps.hitsounds && hitsoundKey(x) !== hitsoundKey(y)) {
      soundCount += 1;
      if (sounds.length < limit) {
        sounds.push(`${noteLabel(x)}: ${hitsoundKey(x)} became ${hitsoundKey(y)}`);
      }
    }
  }
  if (holdCount) {
    issues.push({
      path: `${label} › long notes`,
      message: `${holdCount} long notes changed length or type`,
      examples: holds,
    });
  }
  if (soundCount) {
    issues.push({
      path: `${label} › hitsounds`,
      message: `${soundCount} notes changed their hitsounds (sound|set|addition|index|volume|file)`,
      examples: sounds,
    });
  }
}

/**
 * Where the scroll speed osu!mania plays actually changes: a red line resets
 * it to 1x and a green line sets it. Lines that change nothing drop out.
 */
export function svChanges(points: TimingPoint[]): { time: number; sv: number }[] {
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const out: { time: number; sv: number }[] = [];
  let current = 1;
  let i = 0;
  while (i < sorted.length) {
    const time = sorted[i].time;
    const group: TimingPoint[] = [];
    while (i < sorted.length && sorted[i].time === time) group.push(sorted[i++]);
    if (group.some((p) => p.uninherited)) current = 1;
    for (const p of group) if (!p.uninherited) current = p.sv;
    const last = out.length ? out[out.length - 1].sv : 1;
    if (current !== last) out.push({ time, sv: current });
  }
  return out;
}

function pointLabel(p: TimingPoint): string {
  return p.uninherited
    ? `${formatMs(p.time)} ${p.bpm.toFixed(3)} BPM`
    : `${formatMs(p.time)} ${p.sv.toFixed(3)}x SV`;
}

function compareTiming(
  label: string,
  a: TimingPoint[],
  b: TimingPoint[],
  caps: Capabilities,
  limit: number,
  issues: RoundTripIssue[],
): void {
  const keep = (points: TimingPoint[]) => (caps.sv ? points : points.filter((p) => p.uninherited));
  const left = keep(a);
  const right = keep(b);
  const redsA = left.filter((p) => p.uninherited);
  const redsB = right.filter((p) => p.uninherited);
  const greensA = left.filter((p) => !p.uninherited);
  const greensB = right.filter((p) => !p.uninherited);
  const compareKind = (kind: "BPM" | "SV", x: TimingPoint[], y: TimingPoint[]) => {
    if (x.length !== y.length) {
      issues.push({
        path: `${label} › ${kind === "BPM" ? "timing" : "SV"}`,
        message: `${x.length} ${kind === "BPM" ? "red" : "green"} lines became ${y.length}`,
        examples: x
          .filter((p) => !y.some((q) => Math.abs(q.time - p.time) <= Math.max(1, caps.noteToleranceMs)))
          .slice(0, limit)
          .map(pointLabel),
      });
      return;
    }
    const changed: string[] = [];
    let count = 0;
    x.forEach((p, i) => {
      const q = y[i];
      const reasons: string[] = [];
      const drift = Math.abs(p.time - q.time);
      const onSameGrid = (() => {
        if (!(kind === "BPM" && i === 0 && caps.gridOnlyFirstRedLine)) return false;
        const beat = 60000 / p.bpm;
        const beats = (p.time - q.time) / beat;
        return Math.abs(beats - Math.round(beats)) * beat <= Math.max(0.5, caps.noteToleranceMs);
      })();
      if (drift > Math.max(0.5, caps.noteToleranceMs) && !onSameGrid) reasons.push("time");
      if (kind === "BPM" && !nearlyEqual(p.bpm, q.bpm, caps.valueTolerance)) reasons.push("BPM");
      if (kind === "SV" && !nearlyEqual(p.sv, q.sv, caps.valueTolerance)) reasons.push("SV");
      if (caps.timingExtras) {
        if (kind === "BPM" && p.meter !== q.meter) reasons.push("meter");
        if (p.sampleSet !== q.sampleSet) reasons.push("sample set");
        if (p.sampleIndex !== q.sampleIndex) reasons.push("sample index");
        if (p.volume !== q.volume) reasons.push("volume");
        if (p.kiai !== q.kiai) reasons.push("kiai");
        if (kind === "BPM" && p.omitFirstBarline !== q.omitFirstBarline) reasons.push("barline");
      }
      if (reasons.length) {
        count += 1;
        if (changed.length < limit) changed.push(`${pointLabel(p)} → ${pointLabel(q)} (${reasons.join(", ")})`);
      }
    });
    if (count) {
      issues.push({
        path: `${label} › ${kind === "BPM" ? "timing" : "SV"}`,
        message: `${count} ${kind === "BPM" ? "red" : "green"} lines changed`,
        examples: changed,
      });
    }
  };
  compareKind("BPM", redsA, redsB);
  if (!caps.sv) return;
  if (!caps.effectiveSvOnly) {
    compareKind("SV", greensA, greensB);
    return;
  }
  const x = svChanges(a);
  const y = svChanges(b);
  const tolerance = Math.max(0.5, caps.noteToleranceMs);
  const differs =
    x.length !== y.length ||
    x.some(
      (p, i) =>
        Math.abs(p.time - y[i].time) > tolerance ||
        !nearlyEqual(p.sv, y[i].sv, caps.valueTolerance),
    );
  if (differs) {
    const label = (c: { time: number; sv: number }) => `${formatMs(c.time)} ${c.sv.toFixed(3)}x`;
    const firstDiff = x.findIndex(
      (p, i) =>
        !y[i] ||
        Math.abs(p.time - y[i].time) > tolerance ||
        !nearlyEqual(p.sv, y[i].sv, caps.valueTolerance),
    );
    issues.push({
      path: `${label} › SV`,
      message: `scroll speed changes ${x.length} times before and ${y.length} times after`,
      examples:
        firstDiff >= 0
          ? [`first difference: ${label(x[firstDiff])} became ${y[firstDiff] ? label(y[firstDiff]) : "nothing"}`]
          : [],
    });
  }
}

/** Pairs difficulties by name, falling back to position for unnamed ones. */
function pairDifficulties(a: Difficulty[], b: Difficulty[]) {
  const pairs: { a: Difficulty; b: Difficulty }[] = [];
  const unmatchedB = [...b];
  const missing: Difficulty[] = [];
  for (const d of a) {
    const index = unmatchedB.findIndex((x) => x.name === d.name);
    if (index >= 0) pairs.push({ a: d, b: unmatchedB.splice(index, 1)[0] });
    else missing.push(d);
  }
  // Same count left on both sides: a renamed difficulty, paired by position.
  if (missing.length && missing.length === unmatchedB.length) {
    missing.forEach((d, i) => pairs.push({ a: d, b: unmatchedB[i] }));
    return { pairs, missing: [], extra: [] };
  }
  return { pairs, missing, extra: unmatchedB };
}

/**
 * Every difference between two maps that the given format can represent.
 * An empty list means the second map is, for all a mapper can tell, the first.
 */
export function compareCharts(
  expected: ChartLike,
  actual: ChartLike,
  caps: Capabilities = CAPABILITIES.osu,
  options: CompareOptions = {},
): RoundTripIssue[] {
  const limit = options.exampleLimit ?? 5;
  const issues: RoundTripIssue[] = [];

  for (const field of caps.meta) {
    const x = expected.meta[field];
    const y = actual.meta[field];
    const same =
      field === "tags"
        ? tagSet(x as string, !!options.ignoreWatermarkTag) ===
          tagSet(y as string, !!options.ignoreWatermarkTag)
        : sameValue(x, y);
    if (!same) {
      issues.push({
        path: `metadata › ${field}`,
        message: `"${String(x ?? "")}" became "${String(y ?? "")}"`,
      });
    }
  }

  const { pairs, missing, extra } = pairDifficulties(expected.difficulties, actual.difficulties);
  for (const d of missing) {
    issues.push({ path: d.name || "(unnamed)", message: "difficulty is missing" });
  }
  for (const d of extra) {
    issues.push({ path: d.name || "(unnamed)", message: "difficulty appeared that was not there" });
  }
  for (const { a, b } of pairs) {
    const label = a.name || "(unnamed)";
    for (const field of caps.difficulty) {
      const fallback = FIELD_DEFAULTS[field];
      const x = a[field] ?? fallback;
      const y = b[field] ?? fallback;
      if (!sameValue(x, y)) {
        issues.push({
          path: `${label} › ${field}`,
          message: `${JSON.stringify(a[field] ?? null)} became ${JSON.stringify(b[field] ?? null)}`,
        });
      }
    }
    compareNotes(label, a.notes, b.notes, caps, limit, issues);
    compareTiming(label, effectiveTiming(expected, a), effectiveTiming(actual, b), caps, limit, issues);
  }
  return issues;
}

/** A readable report, one issue per line with its examples indented. */
export function formatIssues(issues: RoundTripIssue[], heading = ""): string {
  const lines = heading ? [heading] : [];
  for (const issue of issues) {
    lines.push(`- ${issue.path}: ${issue.message}`);
    for (const example of issue.examples ?? []) lines.push(`    · ${example}`);
  }
  return lines.join("\n");
}

/** What a .osu file holds, counted straight from its text. */
export type OsuInventory = {
  hitObjects: number;
  timingPoints: number;
  /** Storyboard commands in [Events], which Cascade does not edit or export. */
  storyboardLines: number;
  /** Break periods, which osu! recomputes from the notes for mania. */
  breaks: number;
  /** [General] SpecialStyle: 1 puts an 8K map's scratch lane on the left. */
  specialStyle: boolean;
};

export function osuInventory(text: string): OsuInventory {
  const inventory: OsuInventory = {
    hitObjects: 0,
    timingPoints: 0,
    storyboardLines: 0,
    breaks: 0,
    specialStyle: false,
  };
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      section = header[1];
      continue;
    }
    if (section === "HitObjects") inventory.hitObjects += 1;
    else if (section === "TimingPoints") {
      if (line.split(",").length >= 2) inventory.timingPoints += 1;
    } else if (section === "Events") {
      if (/^(2|Break)\s*,/i.test(line)) inventory.breaks += 1;
      else if (/^(Sprite|Animation|Sample|4|5|6)\s*,/i.test(line) || /^[ _]/.test(raw)) {
        inventory.storyboardLines += 1;
      }
    } else if (section === "General" && /^SpecialStyle\s*:\s*1\s*$/i.test(line)) {
      inventory.specialStyle = true;
    }
  }
  return inventory;
}

/**
 * What exporting this file through Cascade leaves out by design, as opposed
 * to a bug: storyboards and the 8K scratch layout are not part of what the
 * editor models. Listed so an export can say so instead of dropping it quietly.
 */
export function knownOsuLosses(source: OsuInventory, exported: OsuInventory): string[] {
  const losses: string[] = [];
  if (source.storyboardLines > exported.storyboardLines) {
    losses.push(`storyboard (${source.storyboardLines} event lines)`);
  }
  if (source.specialStyle && !exported.specialStyle) losses.push("SpecialStyle scratch layout");
  return losses;
}
