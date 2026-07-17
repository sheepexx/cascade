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

export function mirrorColumns(
  notes: ManiaNote[],
  keyCount: number,
): ManiaNote[] {
  return notes.map((n) => ({ ...n, column: keyCount - 1 - n.column }));
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
