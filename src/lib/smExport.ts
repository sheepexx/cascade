import JSZip from "jszip";
import type { Difficulty, LoadedFile, ManiaNote, SongMeta, TimingPoint } from "../types";
import { makeRedPoint } from "../types";
import { sortedPoints, redPoints } from "./timing";
import {
  convertAudio,
  cutAudioName,
  cutDifficulty,
  decodeAudioBlob,
  effectiveRegion,
  isWav,
  renderTrimmedAudio,
  shiftTimingPoints,
  toMp3Name,
  type BakedRegion,
} from "./audioTrim";

export type BuildSmArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  audioFilename: string;
  backgroundFilename?: string;
};

const SLOTS_PER_BEAT = 192;
const SLOTS_PER_MEASURE = SLOTS_PER_BEAT * 4;

/** Convert milliseconds to a beat position given timing points. */
function msToBeat(timeMs: number, tps: TimingPoint[]): number {
  const reds = redPoints(tps);
  if (reds.length === 0) return timeMs / 500; // fallback 120 BPM

  let beat = 0;
  for (let i = 0; i < reds.length; i++) {
    const cur = reds[i];
    const next = i + 1 < reds.length ? reds[i + 1] : null;
    const segEnd = next ? next.time : Infinity;

    if (timeMs < cur.time) {
      // Before the first timing point — extrapolate backwards using first BPM
      const diff = cur.time - timeMs;
      return beat - diff * (cur.bpm / 60000);
    }

    if (timeMs <= segEnd) {
      const diff = timeMs - cur.time;
      return beat + diff * (cur.bpm / 60000);
    }

    // Advance past this segment
    const segMs = segEnd - cur.time;
    beat += segMs * (cur.bpm / 60000);
  }

  // After the last timing point
  const last = reds[reds.length - 1];
  return beat + (timeMs - last.time) * (last.bpm / 60000);
}

/** Compute the OFFSET: the time (seconds) at which beat 0 occurs, ≤ 0. */
function computeOffset(tps: TimingPoint[]): number {
  const reds = redPoints(tps);
  if (reds.length === 0) return 0;

  const first = reds[0];
  if (first.time <= 0) return first.time / 1000;

  // Pull back by whole 4-beat measures until ≤ 0
  const measureMs = (60_000 / first.bpm) * 4;
  const n = Math.ceil(first.time / measureMs);
  return (first.time - n * measureMs) / 1000;
}

function computeBpms(
  points: TimingPoint[],
  beatShift: number,
): [number, number][] {
  const reds = redPoints(points);
  if (reds.length === 0) return [[0, 120]];

  const bpms: [number, number][] = reds.map((tp) => [
    msToBeat(tp.time, points) + beatShift,
    tp.bpm,
  ]);

  if (bpms.length === 0) bpms.push([0, 120]);
  // force first BPM to beat 0 so Etterna has a defined tempo from the start
  bpms[0][0] = 0;
  return bpms;
}

function computeRadarValues(
  notes: ManiaNote[],
  durationMs: number,
): [number, number, number, number, number] {
  const dur = durationMs / 1000;
  if (dur <= 0 || notes.length === 0) return [0, 0, 0, 0, 0];

  const taps = notes.filter((n) => !n.endTime).length;

  const stream = Math.min(1, Math.max(0, taps / dur / 12));

  const timeCounts = new Map<number, number>();
  for (const note of notes) {
    const key = Math.round(note.startTime * 100);
    timeCounts.set(key, (timeCounts.get(key) ?? 0) + 1);
  }
  const simultaneous = [...timeCounts.values()].filter((c) => c >= 2).length;
  const totalSlots = timeCounts.size;
  const voltage =
    totalSlots > 0
      ? Math.min(1, Math.max(0, (simultaneous / totalSlots) * 2))
      : 0;

  const holdMs = notes
    .filter((n): n is ManiaNote & { endTime: number } => n.endTime != null)
    .reduce((sum, n) => sum + (n.endTime - n.startTime), 0);
  const freeze = Math.min(1, Math.max(0, holdMs / durationMs));

  const air = Math.min(1, Math.max(0, 1 - taps / dur / 8));

  const chaos = Math.min(
    1,
    Math.max(0, (stream + voltage + air + freeze) / 4),
  );

  return [stream, voltage, air, freeze, chaos];
}

function escape(s: string): string {
  return s.replace(/;/g, "\\;").replace(/\n/g, " ").replace(/\r/g, "");
}

function stepType(keys: number): string {
  switch (keys) {
    case 4: return "dance-single";
    case 5: return "pump-single";
    case 6: return "dance-solo";
    case 7: return "kb7-single";
    case 8: return "dance-double";
    case 10: return "pump-double";
    default: return "dance-single";
  }
}

function notesToMeasures(
  notes: ManiaNote[],
  tps: TimingPoint[],
  keys: number,
  beatShift: number,
): string {
  if (notes.length === 0) {
    return "0".repeat(keys) + "\n";
  }

  const slotOf = (timeMs: number): number => {
    const beat = msToBeat(timeMs, tps) + beatShift;
    return Math.round(beat * SLOTS_PER_BEAT);
  };

  const endMs = notes.reduce(
    (max, n) => Math.max(max, n.endTime ?? n.startTime),
    0,
  );
  const numMeas = Math.max(1, Math.floor(slotOf(endMs) / SLOTS_PER_MEASURE) + 1);

  // Build grid: measures[mi][si][col]
  const grid: string[][][] = Array.from({ length: numMeas }, () =>
    Array.from({ length: SLOTS_PER_MEASURE }, () => Array(keys).fill("0")),
  );

  for (const note of notes) {
    const col = note.column;
    if (col >= keys) continue;
    const s = slotOf(note.startTime);

    if (note.endTime !== undefined && note.endTime > note.startTime) {
      const e = slotOf(note.endTime);
      if (e <= s) {
        // Hold too short to encode as 2→3 — write as tap
        if (s >= 0 && Math.floor(s / SLOTS_PER_MEASURE) < numMeas) {
          const mi = Math.floor(s / SLOTS_PER_MEASURE);
          const si = s % SLOTS_PER_MEASURE;
          grid[mi][si][col] = "1";
        }
      } else {
        if (s >= 0 && Math.floor(s / SLOTS_PER_MEASURE) < numMeas) {
          const mi = Math.floor(s / SLOTS_PER_MEASURE);
          const si = s % SLOTS_PER_MEASURE;
          grid[mi][si][col] = "2";
        }
        if (e >= 0 && Math.floor(e / SLOTS_PER_MEASURE) < numMeas) {
          const mi = Math.floor(e / SLOTS_PER_MEASURE);
          const si = e % SLOTS_PER_MEASURE;
          grid[mi][si][col] = "3";
        }
      }
    } else {
      if (s >= 0 && Math.floor(s / SLOTS_PER_MEASURE) < numMeas) {
        const mi = Math.floor(s / SLOTS_PER_MEASURE);
        const si = s % SLOTS_PER_MEASURE;
        grid[mi][si][col] = "1";
      }
    }
  }

  const rowCounts = [4, 8, 12, 16, 24, 32, 48, 64, 96, 192, 384, 768];

  const out: string[] = [];
  for (let mi = 0; mi < numMeas; mi++) {
    const measure = grid[mi];
    // Find occupied slots
    const occupied: number[] = [];
    for (let si = 0; si < SLOTS_PER_MEASURE; si++) {
      if (measure[si].some((c) => c !== "0")) occupied.push(si);
    }

    // Pick the coarsest row count that holds all occupied slots
    const rows = rowCounts.find((r) => {
      const step = SLOTS_PER_MEASURE / r;
      return occupied.every((si) => si % step === 0);
    }) ?? 768;

    const step = SLOTS_PER_MEASURE / rows;
    for (let ri = 0; ri < rows; ri++) {
      out.push(measure[ri * step].join(""));
    }
    if (mi < numMeas - 1) out.push(",");
  }

  return out.join("\n") + "\n";
}

export function buildSmFile({
  meta,
  difficulties,
  timingPoints,
  audioFilename,
  backgroundFilename,
}: BuildSmArgs): string {
  const points = sortedPoints(
    timingPoints.length > 0 ? timingPoints : [makeRedPoint(0, 120)],
  );
  const offset = computeOffset(points);
  const offsetMs = offset * 1000;
  const beatShift = -msToBeat(offsetMs, points);

  // ── BPMS ──
  const bpms = computeBpms(points, beatShift);
  const bpmStr = bpms
    .map(([b, bpm]) => `${b.toFixed(6)}=${bpm.toFixed(6)}`)
    .join(",");

  // Revert the 50ms import shift so the SM file plays natively in StepMania
  const displayOffset = offset + 50 / 1000;
  const smOffset = displayOffset === 0 ? 0 : -displayOffset;

  const lines: string[] = [];

  // Pull SM-specific metadata from the first difficulty (all diffs share the
  // same set-level SM headers — they were parsed from a single .sm file).
  const sm = difficulties[0]?.smMeta ?? {};

  // Header
  lines.push(`#TITLE:${escape(meta.title)};`);
  lines.push(`#SUBTITLE:${escape(sm.subtitle ?? "")};`);
  lines.push(`#ARTIST:${escape(meta.artist)};`);
  lines.push(`#TITLETRANSLIT:${escape(sm.titleTranslit ?? meta.title)};`);
  lines.push(`#SUBTITLETRANSLIT:${escape(sm.subtitleTranslit ?? "")};`);
  lines.push(`#ARTISTTRANSLIT:${escape(sm.artistTranslit ?? meta.artist)};`);
  const genre = sm.genre ?? meta.tags ?? "";
  if (genre) lines.push(`#GENRE:${escape(genre)};`);
  lines.push(`#CREDIT:${escape(meta.creator)};`);
  lines.push(`#MUSIC:${escape(audioFilename)};`);
  if (backgroundFilename) {
    lines.push("#BACKGROUND:bg.png;");
    lines.push("#BANNER:bg.png;");
  }
  lines.push("#CDTITLE:cdtitle.png;");

  lines.push(`#OFFSET:${smOffset.toFixed(6)};`);
  const previewTime = difficulties.length > 0 ? difficulties[0].previewTime : -1;
  const sampleStart = previewTime >= 0 ? previewTime / 1000 : 0;
  lines.push(`#SAMPLESTART:${sampleStart.toFixed(6)};`);
  const sampleLength = sm.sampleLength ?? 10;
  lines.push(`#SAMPLELENGTH:${sampleLength.toFixed(3)};`);
  lines.push(`#SELECTABLE:${sm.selectable ?? "YES"};`);
  if (sm.displayBpm) lines.push(`#DISPLAYBPM:${escape(sm.displayBpm)};`);
  lines.push("#BPMS:" + bpmStr + ";");
  lines.push("#STOPS:;");
  lines.push("#BGCHANGES:;");
  lines.push("#FGCHANGES:;");

  // ── NOTES sections ──
  for (const diff of difficulties) {
    const st = stepType(diff.keyCount);
    const name = diff.name || "Converted";
    const durationMs = diff.notes.reduce(
      (max, n) => Math.max(max, n.endTime ?? n.startTime),
      0,
    );
    const radar = computeRadarValues(diff.notes, durationMs);

    lines.push("#NOTES:");
    lines.push(`    ${st}:`);
    lines.push(`    ${escape(name)}:`);
    lines.push("    Challenge:");
    lines.push("    1:");
    lines.push(
      `    ${radar[0].toFixed(3)},${radar[1].toFixed(3)},${radar[2].toFixed(3)},${radar[3].toFixed(3)},${radar[4].toFixed(3)}:`,
    );

    const notes = [...diff.notes].sort(
      (a, b) => a.startTime - b.startTime || a.column - b.column,
    );
    const measures = notesToMeasures(notes, points, diff.keyCount, beatShift);
    lines.push(measures);
    lines.push(";");
  }

  return lines.join("\n");
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";
}

export function smFilename(meta: SongMeta): string {
  const base = `${sanitize(meta.title)} [${sanitize(meta.creator)}]`;
  return `${base}.sm`;
}

export function smZipFilename(meta: SongMeta): string {
  const base = `${sanitize(meta.title)} [${sanitize(meta.creator)}]`;
  return `${base}.zip`;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSm(args: BuildSmArgs): void {
  const content = buildSmFile(args);
  const blob = new Blob([content], { type: "text/plain" });
  triggerDownload(blob, smFilename(args.meta));
}

export type BuildSmzArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles?: Record<string, LoadedFile>;
};

export async function buildSmZip(args: BuildSmzArgs): Promise<Blob> {
  const zip = new JSZip();

  // Bundle every unique background referenced by any difficulty.
  for (const diff of args.difficulties) {
    if (diff.backgroundFilename && args.bgFiles?.[diff.backgroundFilename]) {
      const bg = args.bgFiles[diff.backgroundFilename];
      zip.file("bg.png", bg.blob);
      break;
    }
  }

  const bgFilename = args.difficulties.find(
    (d) => d.backgroundFilename,
  )?.backgroundFilename;

  // Audio: all difficulties in a .sm share one audio file.
  const allAudio = Object.values(args.audioFiles);
  const fallbackAudio = allAudio.length === 1 ? allAudio[0] : null;
  const firstDiff = args.difficulties[0];
  const audio =
    (firstDiff?.audioFilename && args.audioFiles[firstDiff.audioFilename]) ||
    fallbackAudio;

  // Trim support (same as buildOsz — decode, cut, re-encode).
  const ctxHolder: { ctx: AudioContext | null } = { ctx: null };
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  const cutNameByKey = new Map<string, string>();
  const bundled = new Set<string>();

  const ensureCtx = (): AudioContext | null => {
    if (ctxHolder.ctx) return ctxHolder.ctx;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctxHolder.ctx = new AC();
    return ctxHolder.ctx;
  };

  const getDecoded = (audio: LoadedFile): Promise<AudioBuffer | null> => {
    let pr = decoded.get(audio.name);
    if (!pr) {
      const ctx = ensureCtx();
      pr = ctx ? decodeAudioBlob(audio.blob, ctx) : Promise.resolve(null);
      decoded.set(audio.name, pr);
    }
    return pr;
  };

  try {
    let audioName = audio?.name ?? firstDiff?.audioFilename ?? "audio.mp3";
    let exportDiffs = args.difficulties;
    let exportTiming = args.timingPoints;

    // Find the first difficulty that has trim settings. Since SM has one
    // shared audio, the first trim found is used for the whole export.
    const trimDiff = args.difficulties.find(
      (d) =>
        d != null &&
        ((d.trimStartMs ?? 0) > 0.5 || d.trimEndMs !== undefined),
    );

    if (audio && trimDiff) {
      const buffer = await getDecoded(audio);
      const region: BakedRegion | null = buffer
        ? effectiveRegion(trimDiff, buffer.duration * 1000)
        : null;
      if (buffer && region) {
        const key = `${audio.name}|${region.startMs}|${region.endMs}|${region.fadeInMs}|${region.fadeOutMs}`;
        let cutName = cutNameByKey.get(key);
        if (!cutName) {
          const encoded = renderTrimmedAudio(buffer, region);
          cutName = cutAudioName(audio.name, bundled, encoded.ext);
          zip.file(cutName, encoded.blob);
          bundled.add(cutName);
          cutNameByKey.set(key, cutName);
        }
        audioName = cutName;
        exportDiffs = args.difficulties.map((d) =>
          cutDifficulty(d, region.startMs, region.endMs),
        );
        exportTiming = shiftTimingPoints(args.timingPoints, region.startMs);
      }
    }

    // Bundle the verbatim audio only when it wasn't cut.
    // Convert WAV → preferred format; keep other formats as-is.
    if (audio && audioName === audio.name) {
      let effectiveName = audio.name;
      let effectiveBlob = audio.blob;
      if (isWav(audio.name)) {
        const ctx = ensureCtx();
        if (ctx) {
          const buffer = await getDecoded(audio);
          if (buffer) {
            const encoded = convertAudio(buffer);
            effectiveName = toMp3Name(audio.name).replace(/\.mp3$/i, `.${encoded.ext}`);
            effectiveBlob = encoded.blob;
          }
        }
      }
      if (!bundled.has(effectiveName)) {
        zip.file(effectiveName, effectiveBlob);
        bundled.add(effectiveName);
      }
      audioName = effectiveName;
    }

    // Attempt to fetch avatar for CDTITLE
    if (args.meta.creator && args.meta.creator !== "Mapper") {
      try {
        const resp = await fetch(`/api/avatar?user=${encodeURIComponent(args.meta.creator)}`);
        if (resp.ok) {
          zip.file("cdtitle.png", await resp.blob());
        }
      } catch {
        // Silently fail and omit cdtitle image (SM will just ignore it)
      }
    }

    const sm = buildSmFile({
      meta: args.meta,
      difficulties: exportDiffs,
      timingPoints: exportTiming.length ? exportTiming : args.timingPoints,
      audioFilename: audioName,
      backgroundFilename: bgFilename,
    });
    zip.file(smFilename(args.meta), sm);
  } finally {
    ctxHolder.ctx?.close().catch(() => {});
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export async function downloadSmZip(args: BuildSmzArgs): Promise<void> {
  const blob = await buildSmZip(args);
  triggerDownload(blob, smZipFilename(args.meta));
}
