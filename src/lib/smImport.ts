import type {
  Difficulty,
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

function makeBeatToMs(
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): (beat: number) => number {
  const segments = bpms.map((entry, index) => ({
    startBeat: index === 0 ? 0 : entry.beat,
    bpm: entry.bpm,
    startMs: 0,
  }));
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    segments[index].startMs =
      previous.startMs +
      (segments[index].startBeat - previous.startBeat) * (60_000 / previous.bpm);
  }

  const sortedStops = stops
    .filter((stop) => stop.beat >= 0)
    .sort((a, b) => a.beat - b.beat);
  const stopPrefixMs = new Array<number>(sortedStops.length + 1).fill(0);
  for (let index = 0; index < sortedStops.length; index += 1) {
    stopPrefixMs[index + 1] = stopPrefixMs[index] + sortedStops[index].seconds * 1000;
  }

  return (beat: number) => {
    let lo = 0;
    let hi = segments.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].startBeat <= beat) lo = mid;
      else hi = mid;
    }
    const segment = segments[lo];

    let stopLo = 0;
    let stopHi = sortedStops.length;
    while (stopLo < stopHi) {
      const mid = (stopLo + stopHi) >> 1;
      if (sortedStops[mid].beat < beat) stopLo = mid + 1;
      else stopHi = mid;
    }
    return (
      offsetMs +
      segment.startMs +
      (beat - segment.startBeat) * (60_000 / segment.bpm) +
      stopPrefixMs[stopLo]
    );
  };
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

function parseNotesData(
  notesSection: string,
  keys: number,
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): ManiaNote[] {
  const lines = toDataLines(notesSection);

  let skipped = 0;
  while (skipped < lines.length && skipped < 5 && lines[skipped].endsWith(":")) {
    skipped++;
  }
  if (skipped === 0) return [];
  return notesFromRows(lines.slice(skipped), keys, bpms, stops, offsetMs);
}

function toDataLines(notesSection: string): string[] {
  return notesSection
    .split("\n")
    .map((l) => {
      const commentIdx = l.indexOf("//");
      return (commentIdx >= 0 ? l.slice(0, commentIdx) : l).trim();
    })
    .filter((l) => l.length > 0);
}

function parseSscNotesData(
  notesSection: string,
  keys: number,
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): ManiaNote[] {
  return notesFromRows(toDataLines(notesSection), keys, bpms, stops, offsetMs);
}

function notesFromRows(
  lines: string[],
  keys: number,
  bpms: BpmEntry[],
  stops: StopEntry[],
  offsetMs: number,
): ManiaNote[] {
  let idx = 0;

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
  const beatToMs = makeBeatToMs(bpms, stops, offsetMs);
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
      const time = Math.round(beatToMs(currentBeat));
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

export function isAudioName(name: string): boolean {
  return /\.(mp3|ogg|wav|oga|flac|m4a)$/i.test(name);
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|bmp|webp)$/i.test(name);
}

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
  const isSsc = /#NOTEDATA\s*:/i.test(raw);
  const headers = parseHeaders(isSsc ? raw.split(/#NOTEDATA\s*:/i)[0] : raw);

  const offsetSeconds = parseFloat(headers["OFFSET"] ?? "0");
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
