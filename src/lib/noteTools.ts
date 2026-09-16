import type { ManiaNote, SnapDivisor, TimingPoint } from "../types";
import { snapIntervalAt } from "./timing";

export function fullLongNotes(
  notes: ManiaNote[],
  timingPoints: TimingPoint[],
  divisor: SnapDivisor,
  ticksGap: number,
): ManiaNote[] {
  const byColumn = new Map<number, ManiaNote[]>();
  for (const n of notes) {
    const arr = byColumn.get(n.column);
    if (arr) arr.push(n);
    else byColumn.set(n.column, [n]);
  }
  const nextStart = new Map<string, number>();
  for (const arr of byColumn.values()) {
    arr.sort((a, b) => a.startTime - b.startTime);
    for (let i = 0; i < arr.length - 1; i++) {
      nextStart.set(arr[i].id, arr[i + 1].startTime);
    }
  }

  const gap = Math.max(0, ticksGap);
  return notes.map((n) => {
    const next = nextStart.get(n.id);
    if (next === undefined) return n;
    const interval = snapIntervalAt(n.startTime, timingPoints, divisor);
    const newEnd = Math.round(next - gap * interval);
    const curEnd = n.endTime ?? n.startTime;
    if (newEnd <= n.startTime) return n;
    if (newEnd <= curEnd) return n;
    return { ...n, endTime: newEnd };
  });
}

export function fullRiceNotes(notes: ManiaNote[]): ManiaNote[] {
  return notes.map((n) => {
    if (n.endTime === undefined) return n;
    const { endTime: _drop, ...rice } = n;
    return rice;
  });
}

/**
 * Long-note conversion limited to `ids`. Tails are still measured against the
 * next note in the whole difficulty, not just the selection, so filling a
 * selected run never runs its holds through notes that were left out.
 */
export function fullLongNotesWithin(
  notes: ManiaNote[],
  ids: ReadonlySet<string>,
  timingPoints: TimingPoint[],
  divisor: SnapDivisor,
  ticksGap: number,
): ManiaNote[] {
  if (!ids.size) return notes;
  const filled = fullLongNotes(notes, timingPoints, divisor, ticksGap);
  const byId = new Map(filled.map((n) => [n.id, n]));
  return notes.map((n) => (ids.has(n.id) ? (byId.get(n.id) ?? n) : n));
}

/** Rice conversion limited to `ids`. */
export function fullRiceNotesWithin(
  notes: ManiaNote[],
  ids: ReadonlySet<string>,
): ManiaNote[] {
  if (!ids.size) return notes;
  return notes.map((n) => {
    if (!ids.has(n.id) || n.endTime === undefined) return n;
    const { endTime: _drop, ...rice } = n;
    return rice;
  });
}

/**
 * Move the tail of every selected long note by `deltaMs`. Rice notes are left
 * alone, and a tail never crosses its own head: shortening past `minLengthMs`
 * stops there rather than turning the hold inside out.
 */
export function shiftLongNoteEnds(
  notes: ManiaNote[],
  ids: ReadonlySet<string>,
  deltaMs: number,
  minLengthMs = 1,
): ManiaNote[] {
  if (!ids.size || deltaMs === 0) return notes;
  const floor = Math.max(1, Math.round(minLengthMs));
  return notes.map((n) => {
    if (!ids.has(n.id) || n.endTime === undefined) return n;
    if (n.endTime <= n.startTime) return n;
    const end = Math.max(n.startTime + floor, Math.round(n.endTime + deltaMs));
    return end === n.endTime ? n : { ...n, endTime: end };
  });
}

/**
 * Turn selected holds shorter than `minMs` back into rice. Cleans up the stubs
 * left behind after scaling or resnapping a section.
 */
export function dropShortLongNotes(
  notes: ManiaNote[],
  ids: ReadonlySet<string>,
  minMs: number,
): ManiaNote[] {
  if (!ids.size || minMs <= 0) return notes;
  return notes.map((n) => {
    if (!ids.has(n.id) || n.endTime === undefined) return n;
    if (n.endTime - n.startTime >= minMs) return n;
    const { endTime: _drop, ...rice } = n;
    return rice;
  });
}

export function mirrorColumns(
  notes: ManiaNote[],
  keyCount: number,
): ManiaNote[] {
  return notes.map((n) => ({ ...n, column: keyCount - 1 - n.column }));
}

function noteEnd(n: ManiaNote): number {
  return n.endTime !== undefined && n.endTime > n.startTime
    ? n.endTime
    : n.startTime;
}

/**
 * Reflect the notes in time within their own span: the last note becomes the
 * first. Long notes keep their length (a reversed LN starts where its tail
 * used to end). Columns are untouched.
 */
export function reverseTime(notes: ManiaNote[]): ManiaNote[] {
  if (notes.length < 2) return notes;
  const minStart = Math.min(...notes.map((n) => n.startTime));
  const maxEnd = Math.max(...notes.map(noteEnd));
  return notes.map((n) => {
    const start = minStart + (maxEnd - noteEnd(n));
    const dur = noteEnd(n) - n.startTime;
    return {
      ...n,
      startTime: Math.round(start),
      endTime: dur > 0 ? Math.round(start + dur) : undefined,
    };
  });
}

/**
 * Scale the notes' times by `factor` around the earliest selected note, so
 * 0.5 packs a 1/2 pattern into 1/4 and 2 stretches it the other way.
 */
export function scaleTime(notes: ManiaNote[], factor: number): ManiaNote[] {
  if (notes.length < 2 || factor <= 0 || factor === 1) return notes;
  const anchor = Math.min(...notes.map((n) => n.startTime));
  return notes.map((n) => ({
    ...n,
    startTime: Math.round(anchor + (n.startTime - anchor) * factor),
    endTime:
      n.endTime !== undefined
        ? Math.round(anchor + (n.endTime - anchor) * factor)
        : undefined,
  }));
}

/**
 * Re-deal every chord onto random columns. Chord sizes and all times are
 * preserved, and columns still occupied by an earlier long note are never
 * reused. Chords that cannot fit (more notes than free columns) keep their
 * original columns.
 */
export function shuffleColumns(
  notes: ManiaNote[],
  keyCount: number,
  random: () => number = Math.random,
): ManiaNote[] {
  const chords = new Map<number, ManiaNote[]>();
  for (const n of notes) {
    const key = Math.round(n.startTime);
    const arr = chords.get(key);
    if (arr) arr.push(n);
    else chords.set(key, [n]);
  }
  const times = [...chords.keys()].sort((a, b) => a - b);
  const busyUntil = new Array<number>(keyCount).fill(-Infinity);
  const out: ManiaNote[] = [];
  for (const t of times) {
    const chord = chords.get(t)!;
    const free: number[] = [];
    for (let c = 0; c < keyCount; c++) {
      if (busyUntil[c] <= t) free.push(c);
    }
    if (free.length < chord.length) {
      // Not enough room to re-deal; keep this chord as-is.
      for (const n of chord) {
        busyUntil[n.column] = Math.max(busyUntil[n.column], noteEnd(n) + 1);
        out.push(n);
      }
      continue;
    }
    // Fisher-Yates the free columns, then hand them out in order.
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    chord.forEach((n, i) => {
      const column = free[i];
      busyUntil[column] = Math.max(busyUntil[column], noteEnd(n) + 1);
      out.push({ ...n, column });
    });
  }
  return out;
}

type HitsoundFields = Pick<
  ManiaNote,
  "hitSound" | "sampleSet" | "additionSet" | "sampleIndex" | "sampleVolume" | "sampleFile"
>;

function pickHitsound(n: ManiaNote): HitsoundFields {
  return {
    hitSound: n.hitSound,
    sampleSet: n.sampleSet,
    additionSet: n.additionSet,
    sampleIndex: n.sampleIndex,
    sampleVolume: n.sampleVolume,
    sampleFile: n.sampleFile,
  };
}

function hasHitsound(h: HitsoundFields): boolean {
  return (h.hitSound ?? 0) !== 0 || (h.sampleFile ?? "") !== "";
}

/**
 * Copy the hitsound of each source note onto the target note at the same time.
 * A target note takes the hitsound of the nearest source note within
 * `toleranceMs`, preferring one in the same column. Only target notes that
 * actually change are returned in `after` (with the matching `before`), so the
 * caller can commit a minimal, undoable update.
 */
export function copyHitsounds(
  target: ManiaNote[],
  source: ManiaNote[],
  toleranceMs = 2,
): { before: ManiaNote[]; after: ManiaNote[]; changed: number } {
  // Bucket source notes by rounded time for fast lookup around each target.
  const byTime = new Map<number, ManiaNote[]>();
  for (const s of source) {
    const key = Math.round(s.startTime);
    const arr = byTime.get(key);
    if (arr) arr.push(s);
    else byTime.set(key, [s]);
  }

  const before: ManiaNote[] = [];
  const after: ManiaNote[] = [];
  const tol = Math.max(0, Math.round(toleranceMs));

  for (const t of target) {
    const center = Math.round(t.startTime);
    let best: ManiaNote | null = null;
    let bestScore = Infinity;
    for (let dt = -tol; dt <= tol; dt++) {
      const bucket = byTime.get(center + dt);
      if (!bucket) continue;
      for (const s of bucket) {
        // Same column beats a different column; nearer time breaks ties.
        const score = Math.abs(s.startTime - t.startTime) +
          (s.column === t.column ? 0 : 1000);
        if (score < bestScore) {
          bestScore = score;
          best = s;
        }
      }
    }
    if (!best) continue;
    const hs = pickHitsound(best);
    const cur = pickHitsound(t);
    // Skip if nothing would change.
    if (
      hs.hitSound === cur.hitSound &&
      hs.sampleSet === cur.sampleSet &&
      hs.additionSet === cur.additionSet &&
      hs.sampleIndex === cur.sampleIndex &&
      hs.sampleVolume === cur.sampleVolume &&
      hs.sampleFile === cur.sampleFile
    ) {
      continue;
    }
    before.push(t);
    after.push({ ...t, ...hs });
  }

  return { before, after, changed: after.length };
}

/** Count how many notes in a difficulty carry any hitsound. */
export function countHitsounds(notes: ManiaNote[]): number {
  let n = 0;
  for (const note of notes) if (hasHitsound(pickHitsound(note))) n++;
  return n;
}
