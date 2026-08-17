import type { ManiaNote } from "../types";

export type PlaytestNoteIndex = {
  source: ManiaNote[];
  keyCount: number;
  byId: Map<string, ManiaNote>;
  byColumn: ManiaNote[][];
  sorted: ManiaNote[];
};

export function buildPlaytestNoteIndex(
  notes: ManiaNote[],
  keyCount: number,
): PlaytestNoteIndex {
  const sorted = [...notes].sort(
    (a, b) => a.startTime - b.startTime || a.column - b.column,
  );
  const byId = new Map<string, ManiaNote>();
  const byColumn = Array.from(
    { length: Math.max(0, keyCount) },
    () => [] as ManiaNote[],
  );
  for (const note of sorted) {
    byId.set(note.id, note);
    byColumn[note.column]?.push(note);
  }
  return { source: notes, keyCount, byId, byColumn, sorted };
}

export function firstNoteAtOrAfter(notes: ManiaNote[], time: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].startTime < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function playtestStartWindow(
  notes: ManiaNote[],
  startTime: number,
  leadInMs: number,
) {
  const skipBeforeTime = startTime + Math.max(0, leadInMs);
  return {
    first: firstNoteAtOrAfter(notes, startTime),
    firstPlayable: firstNoteAtOrAfter(notes, skipBeforeTime),
    skipBeforeTime,
  };
}

export function nearestPlayableNote(
  notes: ManiaNote[],
  time: number,
  maxDistance: number,
  unavailable: (note: ManiaNote) => boolean,
): ManiaNote | null {
  let right = firstNoteAtOrAfter(notes, time);
  let left = right - 1;
  while (left >= 0 || right < notes.length) {
    const leftDistance =
      left >= 0 ? Math.abs(notes[left].startTime - time) : Infinity;
    const rightDistance =
      right < notes.length
        ? Math.abs(notes[right].startTime - time)
        : Infinity;
    const useLeft = leftDistance <= rightDistance;
    const distance = useLeft ? leftDistance : rightDistance;
    if (distance > maxDistance) return null;
    const candidate = useLeft ? notes[left--] : notes[right++];
    if (!unavailable(candidate)) return candidate;
  }
  return null;
}
