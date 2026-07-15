import type {
  Difficulty,
  LoadedFile,
  ManiaNote,
  SmMeta,
  SongMeta,
  TimingPoint,
} from "../types";
import { MAX_KEYS, MIN_KEYS, makeRedPoint, uid } from "../types";

export type ParsedSm = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  audioFilename: string | null;
  backgroundFilename: string | null;
};

type SmHeaders = Record<string, string>;
type BpmEntry = { beat: number; bpm: number };
type StopEntry = { beat: number; seconds: number };

function parseHeaders(raw: string): SmHeaders {
  const headers: SmHeaders = {};
  const re = /#(\w+):(.*?);/gs;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const key = m[1].toUpperCase();
    if (key === "NOTES" || key in headers) continue;
    headers[key] = m[2].trim();
  }
  return headers;
}

function extractNotesSections(raw: string): string[] {
  const sections: string[] = [];
  const lines = raw.split("\n");
  let inNotes = false;
  let current = "";

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#NOTES:")) {
      inNotes = true;
      current = "";
      continue;
    }
    if (inNotes) {
      if (t === ";") {
        sections.push(current.trim());
        inNotes = false;
        current = "";
        continue;
      }
      current += line + "\n";
    }
  }
  return sections;
}

/** Column count for a StepMania/Etterna steptype (dance-single, kb7-single…). */
function stepTypeToKeys(steptype: string): number {
  switch (steptype.trim().replace(/:+$/, "").trim().replace(/"/g, "")) {
    case "dance-single": return 4;
    case "dance-solo": return 6;
    case "dance-double": return 8;
    case "pump-single": return 5;
    case "pump-double": return 10;
    case "kb7-single":
    case "kbx-single": return 7;
    default: return 4;
  }
}

/** `.sm` steptype is the first line of the #NOTES section. */
function detectKeys(notesSection: string): number {
  return stepTypeToKeys(notesSection.split("\n")[0] ?? "");
}

function detectDifficultyName(notesSection: string): string {
  const lines = notesSection.split("\n").filter((l) => l.trim());
  return lines.length > 1
    ? lines[1].trim().replace(/:+$/, "").trim().replace(/"/g, "")
    : "";
}

function parseBpms(str: string): BpmEntry[] {
  if (!str) return [{ beat: 0, bpm: 120 }];
  const bpms: BpmEntry[] = [];
  for (const part of str.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const beat = parseFloat(part.slice(0, idx).trim());
    const bpm = parseFloat(part.slice(idx + 1).trim());
    if (isFinite(beat) && isFinite(bpm) && bpm > 0) bpms.push({ beat, bpm });
  }
  if (bpms.length === 0) bpms.push({ beat: 0, bpm: 120 });
  bpms.sort((a, b) => a.beat - b.beat);
  return bpms;
}

function parseStops(str: string): StopEntry[] {
  if (!str) return [];
  const stops: StopEntry[] = [];
  for (const part of str.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const beat = parseFloat(part.slice(0, idx).trim());
    const seconds = parseFloat(part.slice(idx + 1).trim());
    if (isFinite(beat) && isFinite(seconds)) stops.push({ beat, seconds });
  }
  return stops;
}

/** Convert a beat position to milliseconds given BPM changes and offset. */
function beatToMs(
  beat: number,
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): number {
  let time = offsetMs;
  let prevBeat = 0;

  for (let i = 0; i < bpms.length; i++) {
    const bpm = bpms[i].bpm;
    const segEnd = i + 1 < bpms.length ? bpms[i + 1].beat : Infinity;

    if (beat < segEnd) {
      const beatDiff = beat - prevBeat;
      time += beatDiff * (60_000 / bpm);
      for (const s of stops) {
        if (s.beat >= prevBeat && s.beat < beat) {
          time += s.seconds * 1000;
        }
      }
      return time;
    }

    const beatDiff = segEnd - prevBeat;
    time += beatDiff * (60_000 / bpm);
    for (const s of stops) {
      if (s.beat >= prevBeat && s.beat < segEnd) {
        time += s.seconds * 1000;
      }
    }
    prevBeat = segEnd;
  }

  if (beat > prevBeat) {
    const lastBpm = bpms.length > 0 ? bpms[bpms.length - 1].bpm : 120;
    time += (beat - prevBeat) * (60_000 / lastBpm);
    for (const s of stops) {
      if (s.beat >= prevBeat && s.beat < beat) {
        time += s.seconds * 1000;
      }
    }
  }
  return time;
}

function buildTimingPoints(
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): TimingPoint[] {
  const points: TimingPoint[] = [];
  let currentTime = offsetMs;

  for (let i = 0; i < bpms.length; i++) {
    if (i > 0) {
      const prev = bpms[i - 1];
      const cur = bpms[i];
      const beatDiff = cur.beat - prev.beat;
      const msDiff = beatDiff * (60_000 / prev.bpm);

      let stopDuration = 0;
      for (const s of stops) {
        if (s.beat >= prev.beat && s.beat < cur.beat) {
          stopDuration += s.seconds * 1000;
        }
      }
      currentTime += msDiff + stopDuration;
    }

    points.push(
      makeRedPoint(currentTime, bpms[i].bpm),
    );
  }

  return points;
}

/** `.sm` #NOTES: the steptype/description/difficulty/meter/radar header lines
 *  followed by measure data. Strip the header, then parse the measures. */
function parseNotesData(
  notesSection: string,
  keys: number,
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): ManiaNote[] {
  const lines = toDataLines(notesSection);

  // Skip the 5 header lines (steptype, description, difficulty, meter, radar)
  let skipped = 0;
  while (skipped < lines.length && skipped < 5 && lines[skipped].endsWith(":")) {
    skipped++;
  }
  if (skipped === 0) return [];
  return notesFromRows(lines.slice(skipped), keys, bpms, stops, offsetMs);
}

/** Strip comments and blank lines from a raw notes section. */
function toDataLines(notesSection: string): string[] {
  return notesSection
    .split("\n")
    .map((l) => {
      const commentIdx = l.indexOf("//");
      return (commentIdx >= 0 ? l.slice(0, commentIdx) : l).trim();
    })
    .filter((l) => l.length > 0);
}

/**
 * `.ssc` #NOTES is measure data only (the chart's steptype/difficulty/meter
 * live in sibling #NOTEDATA tags), so parse the rows directly.
 */
function parseSscNotesData(
  notesSection: string,
  keys: number,
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): ManiaNote[] {
  return notesFromRows(toDataLines(notesSection), keys, bpms, stops, offsetMs);
}

/** Turn measure-data lines (no headers) into notes. */
function notesFromRows(
  lines: string[],
  keys: number,
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): ManiaNote[] {
  let idx = 0;

  // Group into measures separated by ',' lines
  const measures: string[][] = [];
  let current: string[] = [];
  for (; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line === ";") break;
    if (line === ",") {
      measures.push(current);
      current = [];
      continue;
    }
    const row = line.replace(/[;,]$/, "").trim();
    if (row.length > 0) current.push(row);
    if (line.endsWith(",") && row.length !== line.length) {
      measures.push(current);
      current = [];
    }
  }
  if (current.length > 0) measures.push(current);

  const notes: ManiaNote[] = [];
  let beatsAccumulated = 0;
  const inHold = new Array(keys).fill(false);
  const holdStart = new Array(keys).fill(0);

  for (const rows of measures) {
    if (rows.length === 0) {
      beatsAccumulated += 4;
      continue;
    }
    const rowsPerMeasure = rows.length;

    for (let ri = 0; ri < rows.length; ri++) {
      const beatInMeasure = (ri / rowsPerMeasure) * 4;
      const currentBeat = beatsAccumulated + beatInMeasure;
      const time = beatToMs(currentBeat, bpms, stops, offsetMs);
      const row = rows[ri];

      for (let col = 0; col < Math.min(row.length, keys); col++) {
        const ch = row[col];
        switch (ch) {
          case "1": {
            if (inHold[col]) {
              notes.push({
                id: uid("n"),
                column: col,
                startTime: holdStart[col],
                endTime: time,
              });
              inHold[col] = false;
            }
            notes.push({
              id: uid("n"),
              column: col,
              startTime: time,
            });
            break;
          }
          case "2": {
            if (inHold[col]) {
              notes.push({
                id: uid("n"),
                column: col,
                startTime: holdStart[col],
                endTime: time,
              });
            }
            inHold[col] = true;
            holdStart[col] = time;
            break;
          }
          case "3": {
            if (inHold[col]) {
              notes.push({
                id: uid("n"),
                column: col,
                startTime: holdStart[col],
                endTime: time,
              });
              inHold[col] = false;
            }
            break;
          }
          case "4": {
            if (inHold[col]) {
              notes.push({
                id: uid("n"),
                column: col,
                startTime: holdStart[col],
                endTime: time,
              });
            }
            inHold[col] = true;
            holdStart[col] = time;
            break;
          }
        }
      }
    }

    beatsAccumulated += 4;
  }

  // Close any unclosed holds
  for (let col = 0; col < keys; col++) {
    if (inHold[col]) {
      notes.push({
        id: uid("n"),
        column: col,
        startTime: holdStart[col],
        endTime: holdStart[col] + 1000,
      });
    }
  }

  notes.sort((a, b) => a.startTime - b.startTime || a.column - b.column);
  return notes;
}

/** Result of reading a dropped folder: parsed SM + resolved media files. */
export type ImportedSmFolder = {
  parsed: ParsedSm;
  audioFiles: Record<string, LoadedFile>;
  backgroundFiles: Record<string, LoadedFile>;
};

export function isAudioName(name: string): boolean {
  return /\.(mp3|ogg|wav|oga|flac|m4a)$/i.test(name);
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|bmp|webp)$/i.test(name);
}

/** Walk a tree of FileSystemEntry objects, returning flat File[]. */
function readEntryTree(
  entry: FileSystemEntry,
): Promise<File[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([]),
      );
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const all: File[] = [];
      const readBatch = () => {
        reader.readEntries(
          (entries) => {
            if (entries.length === 0) {
              resolve(all);
            } else {
              void Promise.all(entries.map(readEntryTree)).then(
                (batches) => {
                  all.push(...batches.flat());
                  readBatch();
                },
              );
            }
          },
          () => resolve(all),
        );
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

/**
 * Read all files from a dropped folder (drag-and-drop with directory).
 * Returns the parsed first .sm file + resolved media.
 */
export async function readSmFolder(
  items: DataTransferItemList,
): Promise<ImportedSmFolder | null> {
  const entryPromises: Promise<File[]>[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry();
    if (entry) entryPromises.push(readEntryTree(entry));
  }
  if (entryPromises.length === 0) return null;

  const fileBatches = await Promise.all(entryPromises);
  const allFiles = fileBatches.flat();

  const chartFiles = allFiles.filter((f) => /\.(sm|ssc)$/i.test(f.name));
  if (chartFiles.length === 0) return null;

  const audioBlobs: Record<string, Blob> = {};
  const bgBlobs: Record<string, Blob> = {};
  for (const f of allFiles) {
    if (isAudioName(f.name)) audioBlobs[f.name.toLowerCase()] = f;
    else if (isImageName(f.name)) bgBlobs[f.name.toLowerCase()] = f;
  }

  // Prefer .ssc (Etterna's richer native format) when a song ships both.
  const chart = chartFiles.find((f) => /\.ssc$/i.test(f.name)) ?? chartFiles[0];
  const text = await chart.text();
  const parsed = parseSmFile(text);

  // Resolve audio by filename (case-insensitive, then first audio in folder)
  const audioFiles: Record<string, LoadedFile> = {};
  const audioRef = parsed.audioFilename?.toLowerCase();
  let resolvedAudioKey: string | null = null;
  if (audioRef) {
    if (audioBlobs[audioRef]) {
      resolvedAudioKey = audioRef;
    } else {
      const audioBase = audioRef.replace(/\.[^.]+$/, "");
      const match = Object.keys(audioBlobs).find(
        (k) => k.replace(/\.[^.]+$/, "") === audioBase,
      );
      if (match) resolvedAudioKey = match;
    }
  } else if (Object.keys(audioBlobs).length > 0) {
    resolvedAudioKey = Object.keys(audioBlobs)[0];
  }
  if (resolvedAudioKey) {
    const blob = audioBlobs[resolvedAudioKey];
    const displayName = parsed.audioFilename ?? resolvedAudioKey;
    audioFiles[displayName] = {
      name: displayName,
      url: URL.createObjectURL(blob),
      blob,
    };
  }

  // Resolve background by filename (case-insensitive, then base-name fallback).
  // If no background header exists, use the first image from the folder.
  const backgroundFiles: Record<string, LoadedFile> = {};
  let resolvedBgKey: string | null = null;
  const bgRef = parsed.backgroundFilename?.toLowerCase();
  if (bgRef) {
    if (bgBlobs[bgRef]) {
      resolvedBgKey = bgRef;
    } else {
      const bgBase = bgRef.replace(/\.[^.]+$/, "");
      const match = Object.keys(bgBlobs).find(
        (k) => k.replace(/\.[^.]+$/, "") === bgBase,
      );
      if (match) resolvedBgKey = match;
    }
  } else if (Object.keys(bgBlobs).length > 0) {
    // No background header — pick the first plausible image
    const sorted = Object.keys(bgBlobs).sort();
    resolvedBgKey =
      sorted.find((k) => /^bg|back/i.test(k)) ??
      sorted.find((k) => /banner/i.test(k)) ??
      sorted[0];
  }
  if (resolvedBgKey) {
    const blob = bgBlobs[resolvedBgKey];
    const displayName = parsed.backgroundFilename ?? resolvedBgKey;
    backgroundFiles[displayName] = {
      name: displayName,
      url: URL.createObjectURL(blob),
      blob,
    };
  }

  return { parsed, audioFiles, backgroundFiles };
}

/**
 * Parse the `#NOTEDATA` chart blocks of a `.ssc` file into difficulties. Each
 * block carries its own steptype / difficulty / meter tags and may override the
 * song timing (Etterna "split timing"); the measure data lives in `#NOTES:`.
 */
function parseSscCharts(
  raw: string,
  song: {
    bpms: BpmEntry[];
    stops: StopEntry[];
    offsetMs: number;
    timingPoints: TimingPoint[];
    previewTime: number;
    smMeta: SmMeta;
    audioFilename: string | null;
  },
): Difficulty[] {
  const blocks = raw.split(/#NOTEDATA\s*:/i).slice(1);
  const diffs: Difficulty[] = [];
  for (const block of blocks) {
    const noteAt = block.search(/#NOTES\s*:/i);
    const headerPart = noteAt >= 0 ? block.slice(0, noteAt) : block;
    const notesPart =
      noteAt >= 0 ? block.slice(noteAt).replace(/^#NOTES\s*:\s*/i, "") : "";
    const h = parseHeaders(headerPart);

    const keys = stepTypeToKeys(h["STEPSTYPE"] ?? "dance-single");
    const name =
      h["CHARTNAME"] || h["DESCRIPTION"] || h["DIFFICULTY"] || "Imported";

    // Per-chart timing overrides (split timing); otherwise the song timing.
    const hasBpms = !!h["BPMS"];
    const hasOffset = h["OFFSET"] !== undefined;
    const bpms = hasBpms ? parseBpms(h["BPMS"]) : song.bpms;
    const stops = h["STOPS"]
      ? parseStops(h["STOPS"])
      : hasBpms
        ? []
        : song.stops;
    const offsetMs = hasOffset
      ? -parseFloat(h["OFFSET"]) * 1000 - 50
      : song.offsetMs;
    const timing =
      hasBpms || hasOffset
        ? buildTimingPoints(bpms, stops, offsetMs)
        : song.timingPoints;

    const notes = parseSscNotesData(notesPart, keys, bpms, stops, offsetMs);
    diffs.push({
      id: uid("diff"),
      sourceFormat: "sm",
      smMeta: song.smMeta,
      name: name || "Imported",
      audioFilename: song.audioFilename ?? undefined,
      keyCount: Math.max(MIN_KEYS, Math.min(MAX_KEYS, keys)),
      hpDrainRate: 7,
      overallDifficulty: 7,
      previewTime: Math.round(song.previewTime),
      timingPoints: (timing.length > 0 ? timing : [makeRedPoint(0, 120)]).map(
        (tp) => ({ ...tp }),
      ),
      notes,
    });
  }
  return diffs;
}

export function parseSmFile(text: string): ParsedSm {
  const raw = text.replace(/\r\n/g, "\n");
  // Etterna's native format is .ssc: song headers first, then one #NOTEDATA
  // block per chart. In .sm every chart is a #NOTES: section with an inline
  // 5-line header. Detect .ssc so song headers aren't polluted by chart tags.
  const isSsc = /#NOTEDATA\s*:/i.test(raw);
  const headers = parseHeaders(isSsc ? raw.split(/#NOTEDATA\s*:/i)[0] : raw);

  const offsetSeconds = parseFloat(headers["OFFSET"] ?? "0");
  // SM files natively play with a ~50ms delay compared to osu! strict timing.
  // We apply henkan's global_timing_ms (50ms) by shifting the start time early.
  const offsetMs = (-offsetSeconds * 1000) - 50;

  const sampleStart = parseFloat(headers["SAMPLESTART"] ?? "0");
  const previewTime = sampleStart * 1000;

  const bpms = parseBpms(headers["BPMS"] ?? "");
  const stops = parseStops(headers["STOPS"] ?? "");
  const timingPoints = buildTimingPoints(bpms, stops, offsetMs);

  const meta: SongMeta = {
    title: headers["TITLE"] ?? "Untitled",
    artist: headers["ARTIST"] ?? "Unknown Artist",
    creator: headers["CREDIT"] ?? "Mapper",
    tags: headers["GENRE"] ?? "",
  };

  // Collect SM-specific fields into a separate bag.
  const smMeta: SmMeta = {};
  if (headers["SUBTITLE"]) smMeta.subtitle = headers["SUBTITLE"];
  if (headers["TITLETRANSLIT"]) smMeta.titleTranslit = headers["TITLETRANSLIT"];
  if (headers["SUBTITLETRANSLIT"]) smMeta.subtitleTranslit = headers["SUBTITLETRANSLIT"];
  if (headers["ARTISTTRANSLIT"]) smMeta.artistTranslit = headers["ARTISTTRANSLIT"];
  if (headers["DISPLAYBPM"]) smMeta.displayBpm = headers["DISPLAYBPM"];
  if (headers["SELECTABLE"]) smMeta.selectable = headers["SELECTABLE"].toUpperCase() === "NO" ? "NO" : "YES";
  const sampleLen = parseFloat(headers["SAMPLELENGTH"] ?? "");
  if (Number.isFinite(sampleLen)) smMeta.sampleLength = sampleLen;
  if (headers["LISTNOTES"]) smMeta.listnotes = headers["LISTNOTES"];
  // Carry genre into smMeta as well (already in SongMeta.tags).
  if (headers["GENRE"]) smMeta.genre = headers["GENRE"];

  const audioFilename = headers["MUSIC"] ?? null;
  const backgroundFilename = headers["BACKGROUND"] ?? headers["BANNER"] ?? null;

  const difficulties: Difficulty[] = isSsc
    ? parseSscCharts(raw, {
        bpms,
        stops,
        offsetMs,
        timingPoints,
        previewTime,
        smMeta,
        audioFilename,
      })
    : extractNotesSections(raw).map((section) => {
        const keys = detectKeys(section);
        const name = detectDifficultyName(section);
        const notes = parseNotesData(section, keys, bpms, stops, offsetMs);
        const localTiming =
          timingPoints.length > 0
            ? timingPoints.map((tp) => ({ ...tp }))
            : [makeRedPoint(0, 120)];

        return {
          id: uid("diff"),
          sourceFormat: "sm",
          smMeta,
          name: name || "Imported",
          audioFilename: audioFilename ?? undefined,
          keyCount: Math.max(MIN_KEYS, Math.min(MAX_KEYS, keys)),
          hpDrainRate: 7,
          overallDifficulty: 7,
          previewTime: Math.round(previewTime),
          timingPoints: localTiming,
          notes,
        };
      });

  if (difficulties.length === 0) {
    difficulties.push({
      id: uid("diff"),
      sourceFormat: "sm",
      smMeta,
      name: "Imported",
      keyCount: 4,
      hpDrainRate: 7,
      overallDifficulty: 7,
      previewTime: Math.round(previewTime),
      timingPoints: timingPoints.length > 0
        ? timingPoints
        : [makeRedPoint(0, 120)],
      notes: [],
    });
  }

  return {
    meta,
    difficulties,
    timingPoints: timingPoints.length > 0 ? timingPoints : [makeRedPoint(0, 120)],
    audioFilename,
    backgroundFilename,
  };
}
