import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import {
  CAPABILITIES,
  compareCharts,
  formatIssues,
  knownOsuLosses,
  osuInventory,
  type Capabilities,
  type ChartLike,
  type RoundTripIssue,
} from "./roundTrip";
import { importOsz, isManiaOsu, parseOsuFile, type ParsedOsu } from "./osuImport";
import { buildOsuFile } from "./osuExport";
import { buildOsz } from "./oszExport";
import { buildSmFile } from "./smExport";
import { smStepsType } from "./smFormat";
import { parseSmFile } from "./smImport";
import { buildQuaFile, parseQuaFile } from "./qua";
import { buildMalodyChart, MALODY_MAX_KEYS, parseMalodyChart } from "./malody";
import type { LoadedFile, TimingPoint } from "../types";

/**
 * Round-trips every map in the corpus through Cascade and checks that what
 * comes back is the map that went in.
 *
 * The corpus is:
 * - src/lib/fixtures/corpus/ — small charts that each pin down an edge case.
 *   Drop a .osu, .osz, .sm, .ssc, .qua or .mc in there to add one.
 * - public/maps/*.osz — the real ranked mapsets the editor ships as samples.
 * - every folder listed in CASCADE_CORPUS (separated by ":"), for checking a
 *   local collection, e.g. `CASCADE_CORPUS=~/osu/Songs npm test -- roundTrip`.
 *
 * A difference fails the test with a report of what changed and where. Things
 * Cascade leaves out on purpose (storyboards, say) are listed, not failed.
 */

// Node lacks FileReader, which JSZip uses to read Blobs.
class ArrayBufferFileReader {
  result: ArrayBuffer | null = null;
  onload: ((e: { target: ArrayBufferFileReader }) => void) | null = null;
  onerror: ((e: { target: { error: unknown } }) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(
      (buffer) => {
        this.result = buffer;
        this.onload?.({ target: this });
      },
      (error: unknown) => this.onerror?.({ target: { error } }),
    );
  }
}
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = ArrayBufferFileReader as unknown as typeof FileReader;
}

type Source = { name: string; path: string; ext: string };

const CHART_EXTENSIONS = new Set(["osu", "osz", "sm", "ssc", "qua", "mc"]);

function walk(dir: string, out: Source[], depth = 0): void {
  if (!existsSync(dir) || depth > 4) return;
  for (const entry of readdirSync(dir).sort()) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) {
      walk(path, out, depth + 1);
      continue;
    }
    const ext = entry.split(".").pop()?.toLowerCase() ?? "";
    if (CHART_EXTENSIONS.has(ext)) out.push({ name: path.replace(/^.*?(src|public)\//, "$1/"), path, ext });
  }
}

function corpus(): Source[] {
  const root = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
  const sources: Source[] = [];
  walk(`${root}/src/lib/fixtures`, sources);
  walk(`${root}/public/maps`, sources);
  const extra = (import.meta.env.CASCADE_CORPUS as string | undefined) ?? "";
  for (const dir of extra.split(":").filter(Boolean)) walk(dir, sources);
  return sources;
}

const SOURCES = corpus();
const decoder = new TextDecoder();

function chartOf(parsed: ParsedOsu): ChartLike {
  return {
    meta: parsed.meta,
    timingPoints: parsed.timingPoints,
    difficulties: [
      {
        ...parsed.difficulty,
        backgroundFilename: parsed.backgroundFilename ?? undefined,
        videoFilename: parsed.videoFilename ?? undefined,
        videoOffsetMs: parsed.videoFilename && parsed.videoOffsetMs ? parsed.videoOffsetMs : undefined,
      },
    ],
  };
}

function exportOsu(parsed: ParsedOsu): string {
  return buildOsuFile({
    meta: parsed.meta,
    difficulty: parsed.difficulty,
    timingPoints: parsed.timingPoints,
    audioFilename: parsed.audioFilename ?? "audio.mp3",
    backgroundFilename: parsed.backgroundFilename ?? undefined,
    videoFilename: parsed.videoFilename ?? undefined,
    videoOffsetMs: parsed.videoOffsetMs,
    cascadeTag: false,
  });
}

/** Half a 192nd of the slowest beat, plus rounding: where StepMania's grid can put a note. */
function smCapabilities(points: TimingPoint[]): Capabilities {
  const slowest = Math.min(...points.filter((p) => p.uninherited).map((p) => p.bpm), 120);
  return { ...CAPABILITIES.sm, noteToleranceMs: 60000 / slowest / 192 / 2 + 1 };
}


const knownLosses: string[] = [];

function expectNoIssues(issues: RoundTripIssue[], heading: string): void {
  if (issues.length) expect.fail(formatIssues(issues, heading));
}

/**
 * Checks one .osu text: the parser reads every object, the export reads back
 * as the same map, and a second export is byte for byte the first.
 */
function checkOsuText(text: string, name: string): void {
  const source = osuInventory(text);
  const first = parseOsuFile(text);
  const parsedIssues: RoundTripIssue[] = [];
  if (first.difficulty.notes.length !== source.hitObjects) {
    parsedIssues.push({
      path: "parse",
      message: `${source.hitObjects} hit objects in the file, ${first.difficulty.notes.length} read`,
    });
  }
  if (first.timingPoints.length !== Math.max(1, source.timingPoints)) {
    parsedIssues.push({
      path: "parse",
      message: `${source.timingPoints} timing points in the file, ${first.timingPoints.length} read`,
    });
  }
  expectNoIssues(parsedIssues, `${name}: reading the file lost data`);

  const exported = exportOsu(first);
  const second = parseOsuFile(exported);
  expectNoIssues(
    compareCharts(chartOf(first), chartOf(second), CAPABILITIES.osu),
    `${name}: .osu export does not read back as the same map`,
  );
  expect(exportOsu(second), `${name}: a second export differs from the first`).toBe(exported);

  const losses = knownOsuLosses(source, osuInventory(exported));
  if (losses.length) knownLosses.push(`${name}: ${losses.join(", ")}`);

  checkCrossFormats(first, name);
}

/** The same chart through every other format that can hold it. */
function checkCrossFormats(parsed: ParsedOsu, name: string): void {
  const chart = chartOf(parsed);
  const difficulty = parsed.difficulty;
  const keys = difficulty.keyCount;
  if (!difficulty.notes.length) return;

  if (smStepsType(keys) !== null) {
    const sm = buildSmFile({
      meta: parsed.meta,
      difficulties: [difficulty],
      timingPoints: parsed.timingPoints,
      audioFilename: "audio.mp3",
    });
    const back = parseSmFile(sm);
    expectNoIssues(
      compareCharts(chart, { ...back, difficulties: back.difficulties.map((d) => ({ ...d, name: difficulty.name })) }, smCapabilities(parsed.timingPoints)),
      `${name}: .sm export does not read back as the same chart`,
    );
  }

  if (keys === 4 || keys === 7) {
    const qua = buildQuaFile({
      meta: parsed.meta,
      difficulty,
      timingPoints: parsed.timingPoints,
      audioFilename: "audio.mp3",
      bpmAffectsScroll: false,
    });
    const back = parseQuaFile(qua);
    expectNoIssues(
      compareCharts(chart, { meta: back.meta, timingPoints: back.timingPoints, difficulties: [back.difficulty] }, CAPABILITIES.qua),
      `${name}: .qua export does not read back as the same chart`,
    );
  }

  if (keys <= MALODY_MAX_KEYS) {
    const mc = buildMalodyChart({
      meta: parsed.meta,
      difficulty,
      timingPoints: parsed.timingPoints,
      audioFilename: "audio.mp3",
    });
    const back = parseMalodyChart(mc);
    expectNoIssues(
      compareCharts(chart, { meta: back.meta, timingPoints: back.timingPoints, difficulties: [back.difficulty] }, CAPABILITIES.mc),
      `${name}: .mc export does not read back as the same chart`,
    );
  }
}

async function digest(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fileDigests(files: Record<string, LoadedFile | { name: string; blob: Blob }> = {}) {
  const out: Record<string, string> = {};
  for (const [key, file] of Object.entries(files)) out[key] = await digest(file.blob);
  return out;
}

/** The whole set: charts, audio, backgrounds, video and samples. */
async function checkOsz(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<void> {
  const zip = await JSZip.loadAsync(bytes);
  const osuTexts = await Promise.all(
    Object.values(zip.files)
      .filter((f) => f.name.toLowerCase().endsWith(".osu"))
      .map(async (f) => ({ name: f.name, text: await f.async("string") })),
  );
  for (const osu of osuTexts.filter((o) => isManiaOsu(o.text))) {
    checkOsuText(osu.text, `${name} › ${osu.name}`);
  }

  const first = await importOsz(new Blob([bytes]));
  const archive = await buildOsz({
    meta: first.meta,
    difficulties: first.difficulties,
    timingPoints: first.timingPoints,
    audioFiles: first.audioFiles,
    bgFiles: first.backgroundFiles,
    videoFiles: first.videoFiles,
    sampleFiles: first.sampleFiles,
    cascadeTag: false,
  });
  const second = await importOsz(archive);
  expectNoIssues(
    compareCharts(first, second, CAPABILITIES.osu),
    `${name}: .osz export does not read back as the same set`,
  );
  for (const kind of ["audioFiles", "backgroundFiles", "videoFiles", "sampleFiles"] as const) {
    expect(await fileDigests(second[kind]), `${name}: ${kind} changed`).toEqual(
      await fileDigests(first[kind]),
    );
  }
}

function checkSm(text: string, name: string): void {
  const first = parseSmFile(text);
  const sm = buildSmFile({
    meta: first.meta,
    difficulties: first.difficulties.filter((d) => smStepsType(d.keyCount) !== null),
    timingPoints: first.timingPoints,
    audioFilename: first.audioFilename ?? "audio.mp3",
  });
  const second = parseSmFile(sm);
  const kept = { ...first, difficulties: first.difficulties.filter((d) => smStepsType(d.keyCount) !== null) };
  expectNoIssues(
    compareCharts(kept, second, { ...smCapabilities(first.timingPoints), difficulty: ["keyCount", "name"] }),
    `${name}: .sm export does not read back as the same chart`,
  );
}

function checkQua(text: string, name: string): void {
  const first = parseQuaFile(text);
  const qua = buildQuaFile({
    meta: first.meta,
    difficulty: first.difficulty,
    timingPoints: first.timingPoints,
    audioFilename: first.audioFilename ?? "audio.mp3",
    backgroundFilename: first.backgroundFilename ?? undefined,
    bpmAffectsScroll: first.bpmAffectsScroll,
  });
  const second = parseQuaFile(qua);
  const chart = (p: typeof first): ChartLike => ({ meta: p.meta, timingPoints: p.timingPoints, difficulties: [p.difficulty] });
  expectNoIssues(compareCharts(chart(first), chart(second), CAPABILITIES.qua), `${name}: .qua export does not read back as the same chart`);
}

function checkMc(text: string, name: string): void {
  const first = parseMalodyChart(text);
  const mc = buildMalodyChart({
    meta: first.meta,
    difficulty: first.difficulty,
    timingPoints: first.timingPoints,
    audioFilename: first.audioFilename ?? "audio.ogg",
  });
  const second = parseMalodyChart(mc);
  const chart = (p: typeof first): ChartLike => ({ meta: p.meta, timingPoints: p.timingPoints, difficulties: [p.difficulty] });
  expectNoIssues(compareCharts(chart(first), chart(second), CAPABILITIES.mc), `${name}: .mc export does not read back as the same chart`);
}

describe("import/export round trip over the corpus", () => {
  it("has a corpus to check", () => {
    expect(SOURCES.some((s) => s.ext === "osz")).toBe(true);
    expect(SOURCES.some((s) => s.ext === "osu")).toBe(true);
  });

  for (const source of SOURCES) {
    it(`${source.name}`, { timeout: 120_000 }, async () => {
      const bytes = readFileSync(source.path);
      switch (source.ext) {
        case "osz":
          await checkOsz(bytes, source.name);
          break;
        case "osu":
          checkOsuText(decoder.decode(bytes), source.name);
          break;
        case "sm":
        case "ssc":
          checkSm(decoder.decode(bytes), source.name);
          break;
        case "qua":
          checkQua(decoder.decode(bytes), source.name);
          break;
        case "mc":
          checkMc(decoder.decode(bytes), source.name);
          break;
      }
    });
  }

  it("lists what exports leave out on purpose", () => {
    // Not a failure: storyboards and the scratch layout are outside what
    // Cascade edits. Printed so a change in what is lost stays visible.
    if (knownLosses.length) console.info(`Known export losses:\n${knownLosses.join("\n")}`);
    expect(Array.isArray(knownLosses)).toBe(true);
  });
});
