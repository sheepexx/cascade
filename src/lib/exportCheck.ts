import type JSZip from "jszip";
import type { Difficulty } from "../types";
import { isManiaOsu, parseOsuFile } from "./osuImport";
import {
  CAPABILITIES,
  compareCharts,
  type Capabilities,
  type ChartLike,
  type RoundTripIssue,
} from "./roundTrip";

/**
 * Reads an exported .osz back and compares it with what the editor holds, so
 * an export that would not open as the same map is caught before a mapper
 * uploads it. Difficulties the export changes on purpose (trimmed audio, a
 * baked rate) are left out, since their times move by design.
 */

/** What the export writes; file names may be renamed (PNG to JPEG), so they are not compared. */
const EXPORT_CHECK: Capabilities = {
  ...CAPABILITIES.osu,
  difficulty: [
    "name",
    "keyCount",
    "hpDrainRate",
    "overallDifficulty",
    "previewTime",
    "bookmarks",
    "beatmapId",
    "sampleSet",
    "videoOffsetMs",
  ],
  // A note the editor holds between milliseconds goes out rounded.
  noteToleranceMs: 0.5,
};

function changedOnPurpose(difficulty: Difficulty): boolean {
  const rate = difficulty.audioRate ?? 1;
  return (
    (difficulty.trimStartMs ?? 0) > 0.5 ||
    difficulty.trimEndMs !== undefined ||
    Math.abs(rate - 1) > 1e-6
  );
}

export async function verifyOszArchive(
  archive: Blob,
  expected: ChartLike,
): Promise<RoundTripIssue[]> {
  const { default: JSZipCtor } = await import("jszip");
  const zip: JSZip = await JSZipCtor.loadAsync(await archive.arrayBuffer());
  const charts = await Promise.all(
    Object.values(zip.files)
      .filter((file) => !file.dir && file.name.toLowerCase().endsWith(".osu"))
      .map((file) => file.async("string")),
  );
  const parsed = charts.filter(isManiaOsu).map(parseOsuFile);
  const checked = expected.difficulties.filter((d) => !changedOnPurpose(d));
  const names = new Set(checked.map((d) => d.name));
  const actual: ChartLike = {
    meta: parsed[0]?.meta ?? expected.meta,
    timingPoints: parsed[0]?.timingPoints ?? [],
    difficulties: parsed
      .map((p) => p.difficulty)
      .filter((d) => names.has(d.name) || !expected.difficulties.some((e) => e.name === d.name)),
  };
  return compareCharts(
    { ...expected, difficulties: checked },
    actual,
    EXPORT_CHECK,
    { ignoreWatermarkTag: true },
  );
}
