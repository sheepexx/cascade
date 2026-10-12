import { MAX_KEYS, MIN_KEYS } from "../types";
import type { Difficulty, ManiaNote, SongMeta, TimingPoint } from "../types";
import { t, type MessageKey } from "./i18n/core";

/**
 * Runtime checks for chart data arriving from outside the editor's own state:
 * a cloud snapshot, a collaborator's op, or a chart about to be exported.
 * TypeScript only describes what the editor writes; JSON from the network or
 * a corrupted record can hold anything, and a NaN that gets in ends up in an
 * exported .osu line.
 *
 * These are format requirements: a value that breaks one cannot be edited,
 * played or exported correctly. Checks that are matters of taste (overlaps,
 * stacked notes, unusual timing) stay warnings in lib/validation.
 * Nothing here repairs or drops a value; callers decide what to refuse.
 */

export const CHART_LIMITS = {
  /** Ids the editor makes are short; this only stops a hostile one. */
  maxIdLength: 256,
  maxTextLength: 4096,
  maxSampleFileLength: 1024,
  maxDifficulties: 1024,
  maxNotesPerDifficulty: 1_000_000,
  maxTimingPoints: 100_000,
  maxBookmarks: 10_000,
  /** osu! reads times as 32-bit integers. */
  maxAbsTimeMs: 2_147_483_647,
} as const;

export type ChartProblem =
  | "shape"
  | "id"
  | "duplicateId"
  | "column"
  | "time"
  | "hold"
  | "number"
  | "keyCount"
  | "bpm"
  | "text"
  | "limit";

export type ChartIssue = {
  problem: ChartProblem;
  /** Where it is, like `difficulties[1].notes[20].startTime`. */
  path: string;
};

export type ChartCheck<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ChartIssue[]; total: number };

/** Issues kept for a report; past this only the total grows. */
const MAX_REPORTED = 20;

class IssueList {
  issues: ChartIssue[] = [];
  total = 0;
  add(problem: ChartProblem, path: string): void {
    this.total += 1;
    if (this.issues.length < MAX_REPORTED) this.issues.push({ problem, path });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTime(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= CHART_LIMITS.maxAbsTimeMs;
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= CHART_LIMITS.maxIdLength
  );
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= CHART_LIMITS.maxTextLength;
}

const NOTE_SAMPLE_FIELDS = [
  "hitSound",
  "sampleSet",
  "additionSet",
  "sampleIndex",
  "sampleVolume",
] as const;

/**
 * The first thing wrong with a note in a difficulty of `keyCount` columns, or
 * null. A hold must end after it starts: osu! has no zero-length hold.
 */
export function noteProblem(
  value: unknown,
  keyCount: number,
): { problem: ChartProblem; field: string } | null {
  if (!isRecord(value)) return { problem: "shape", field: "" };
  if (!isId(value.id)) return { problem: "id", field: "id" };
  const column = value.column;
  if (
    typeof column !== "number" ||
    !Number.isInteger(column) ||
    column < 0 ||
    column >= keyCount
  ) {
    return { problem: "column", field: "column" };
  }
  if (!isTime(value.startTime)) return { problem: "time", field: "startTime" };
  if (value.endTime !== undefined) {
    if (!isTime(value.endTime)) return { problem: "time", field: "endTime" };
    if (value.endTime <= value.startTime) return { problem: "hold", field: "endTime" };
  }
  for (const field of NOTE_SAMPLE_FIELDS) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) {
      return { problem: "number", field };
    }
  }
  if (
    value.sampleFile !== undefined &&
    (typeof value.sampleFile !== "string" ||
      value.sampleFile.length > CHART_LIMITS.maxSampleFileLength)
  ) {
    return { problem: "text", field: "sampleFile" };
  }
  return null;
}

export function isValidNote(value: unknown, keyCount: number): value is ManiaNote {
  return noteProblem(value, keyCount) === null;
}

/**
 * The first thing wrong with a timing point, or null. The first builds saved
 * only id, time and bpm; later fields fill in with defaults when absent
 * (normalizeTimingPoint), so only a field that is present can be wrong.
 */
export function timingPointProblem(
  value: unknown,
): { problem: ChartProblem; field: string } | null {
  if (!isRecord(value)) return { problem: "shape", field: "" };
  if (!isId(value.id)) return { problem: "id", field: "id" };
  if (!isTime(value.time)) return { problem: "time", field: "time" };
  if (value.uninherited !== undefined && typeof value.uninherited !== "boolean") {
    return { problem: "shape", field: "uninherited" };
  }
  if (value.bpm !== undefined) {
    if (!isFiniteNumber(value.bpm)) return { problem: "number", field: "bpm" };
    if (value.uninherited !== false && !(value.bpm > 0)) return { problem: "bpm", field: "bpm" };
  }
  for (const field of ["sv", "meter", "sampleSet", "sampleIndex", "volume"] as const) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) {
      return { problem: "number", field };
    }
  }
  if (value.sv !== undefined && !((value.sv as number) > 0)) {
    return { problem: "number", field: "sv" };
  }
  for (const field of ["kiai", "omitFirstBarline"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "boolean") {
      return { problem: "shape", field };
    }
  }
  return null;
}

function checkTimingPoints(value: unknown, path: string, out: IssueList): void {
  if (!Array.isArray(value)) {
    out.add("shape", path);
    return;
  }
  if (value.length > CHART_LIMITS.maxTimingPoints) out.add("limit", path);
  value.forEach((point, i) => {
    const found = timingPointProblem(point);
    if (found) out.add(found.problem, `${path}[${i}]${found.field ? `.${found.field}` : ""}`);
  });
}

const OPTIONAL_DIFFICULTY_NUMBERS = [
  "audioRate",
  "videoOffsetMs",
  "beatmapId",
  "trimStartMs",
  "trimEndMs",
  "fadeInMs",
  "fadeOutMs",
] as const;

function checkDifficulty(value: unknown, path: string, out: IssueList): void {
  if (!isRecord(value)) {
    out.add("shape", path);
    return;
  }
  if (!isId(value.id)) out.add("id", `${path}.id`);
  if (!isText(value.name)) out.add("text", `${path}.name`);
  const keyCount = value.keyCount;
  const validKeys =
    typeof keyCount === "number" &&
    Number.isInteger(keyCount) &&
    keyCount >= MIN_KEYS &&
    keyCount <= MAX_KEYS;
  if (!validKeys) out.add("keyCount", `${path}.keyCount`);
  for (const field of ["hpDrainRate", "overallDifficulty"] as const) {
    if (!isFiniteNumber(value[field])) out.add("number", `${path}.${field}`);
  }
  if (!isTime(value.previewTime)) out.add("time", `${path}.previewTime`);
  for (const field of OPTIONAL_DIFFICULTY_NUMBERS) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) {
      out.add("number", `${path}.${field}`);
    }
  }
  if (value.audioRate !== undefined && !((value.audioRate as number) > 0)) {
    out.add("number", `${path}.audioRate`);
  }
  if (value.bookmarks !== undefined) {
    if (!Array.isArray(value.bookmarks) || value.bookmarks.length > CHART_LIMITS.maxBookmarks) {
      out.add("shape", `${path}.bookmarks`);
    } else if (!value.bookmarks.every(isTime)) {
      out.add("time", `${path}.bookmarks`);
    }
  }
  checkTimingPoints(value.timingPoints, `${path}.timingPoints`, out);
  const notes = value.notes;
  if (!Array.isArray(notes)) {
    out.add("shape", `${path}.notes`);
    return;
  }
  if (notes.length > CHART_LIMITS.maxNotesPerDifficulty) {
    out.add("limit", `${path}.notes`);
    return;
  }
  // Without a usable key count every column would read as wrong; that is
  // already one issue, so the notes are checked against the widest layout.
  const columns = validKeys ? keyCount : MAX_KEYS;
  for (let i = 0; i < notes.length; i++) {
    const found = noteProblem(notes[i], columns);
    if (found) out.add(found.problem, `${path}.notes[${i}]${found.field ? `.${found.field}` : ""}`);
  }
}

function checkMeta(value: unknown, out: IssueList): void {
  if (!isRecord(value)) {
    out.add("shape", "meta");
    return;
  }
  for (const field of ["title", "artist", "creator"] as const) {
    if (!isText(value[field])) out.add("text", `meta.${field}`);
  }
  for (const field of ["tags", "source", "titleUnicode", "artistUnicode"] as const) {
    if (value[field] !== undefined && !isText(value[field])) out.add("text", `meta.${field}`);
  }
  if (value.beatmapSetId !== undefined && !isFiniteNumber(value.beatmapSetId)) {
    out.add("number", "meta.beatmapSetId");
  }
}

export type ChartDocument = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

/**
 * Checks a whole chart: metadata, timing, every difficulty and note. Fields
 * the editor does not know about are left alone, so a newer build's data
 * still opens in an older one.
 */
export function checkChartDocument<T extends ChartDocument = ChartDocument>(
  value: unknown,
): ChartCheck<T> {
  const out = new IssueList();
  if (!isRecord(value)) {
    out.add("shape", "");
    return { ok: false, issues: out.issues, total: out.total };
  }
  checkMeta(value.meta, out);
  checkTimingPoints(value.timingPoints, "timingPoints", out);
  const difficulties = value.difficulties;
  if (!Array.isArray(difficulties) || difficulties.length === 0) {
    out.add("shape", "difficulties");
  } else if (difficulties.length > CHART_LIMITS.maxDifficulties) {
    out.add("limit", "difficulties");
  } else {
    const ids = new Set<unknown>();
    difficulties.forEach((d, i) => {
      checkDifficulty(d, `difficulties[${i}]`, out);
      const id = isRecord(d) ? d.id : undefined;
      if (ids.has(id)) out.add("duplicateId", `difficulties[${i}].id`);
      ids.add(id);
    });
  }
  return out.total === 0
    ? { ok: true, value: value as T }
    : { ok: false, issues: out.issues, total: out.total };
}

const PROBLEM_MESSAGES: Record<ChartProblem, MessageKey> = {
  shape: "chartData.problem.shape",
  id: "chartData.problem.id",
  duplicateId: "chartData.problem.duplicateId",
  column: "chartData.problem.column",
  time: "chartData.problem.time",
  hold: "chartData.problem.hold",
  number: "chartData.problem.number",
  keyCount: "chartData.problem.keyCount",
  bpm: "chartData.problem.bpm",
  text: "chartData.problem.text",
  limit: "chartData.problem.limit",
};

/** One line per issue, in the interface language, for an error report. */
export function describeChartIssues(issues: ChartIssue[], total: number): string {
  const lines = issues.map((issue) =>
    t(PROBLEM_MESSAGES[issue.problem], { path: issue.path || t("chartData.root") }),
  );
  if (total > issues.length) {
    lines.push(t("chartData.more", { count: total - issues.length }));
  }
  return lines.join("\n");
}

/** Thrown when chart data fails its checks; the message lists what failed. */
export class InvalidChartDataError extends Error {
  readonly issues: ChartIssue[];
  readonly total: number;

  constructor(headline: string, issues: ChartIssue[], total: number) {
    super(`${headline}\n${describeChartIssues(issues, total)}`);
    this.name = "InvalidChartDataError";
    this.issues = issues;
    this.total = total;
  }
}

/** Returns the chart when it passes, and throws a readable report when not. */
export function assertChartDocument<T extends ChartDocument = ChartDocument>(
  value: unknown,
  source: string,
): T {
  const result = checkChartDocument<T>(value);
  if (!result.ok) {
    throw new InvalidChartDataError(
      t("chartData.rejected", { source, count: result.total }),
      result.issues,
      result.total,
    );
  }
  return result.value;
}

/**
 * The last check before a difficulty is written out as .osu: every value the
 * file holds must be one the format can. The export check reports these to
 * the mapper first; this keeps a path that skipped it from writing "NaN".
 */
export function assertExportable(difficulty: Difficulty, timingPoints: TimingPoint[]): void {
  const out = new IssueList();
  checkDifficulty({ ...difficulty, timingPoints }, "difficulty", out);
  if (out.total > 0) {
    throw new InvalidChartDataError(
      t("chartData.exportBlocked", { name: difficulty.name, count: out.total }),
      out.issues,
      out.total,
    );
  }
}
