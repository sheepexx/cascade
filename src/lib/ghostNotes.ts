import type { ManiaNote, TimingPoint } from "../types";
import type { AudioOnset } from "./bpmDetect";
import { snapTime } from "./timing";

export type GhostNote = ManiaNote & { strength: number; sourceTime: number };

export function suggestGhostNotes(onsets: AudioOnset[], options: {
  notes: ManiaNote[]; timingPoints: TimingPoint[]; snapDivisor: number;
  timeScale: number; keyCount: number; threshold: number; start: number; end: number;
}): GhostNote[] {
  const { notes, timingPoints, snapDivisor, timeScale, keyCount, threshold, start, end } = options;
  const rows = [...new Set(notes.map(n => n.startTime))].sort((a, b) => a - b);
  const occupied = Array.from({ length: keyCount }, (_, c) => notes.filter(n => n.column === c).sort((a, b) => a.startTime - b.startTime));
  const cursors = new Array<number>(keyCount).fill(0);
  const result: GhostNote[] = [];
  let rowIndex = 0;
  const candidates = onsets.map((onset, index) => ({ onset, index, time: Math.round(snapTime(onset.timeMs / timeScale, timingPoints, snapDivisor)) }))
    .filter(({ onset, time }) => onset.strength >= threshold && time >= start && time <= end)
    .sort((a, b) => a.time - b.time || b.onset.strength - a.onset.strength);
  for (const { onset, index, time } of candidates) {
    // An onset suggests a new rhythm row, never extra chord notes on an existing row.
    while (rowIndex < rows.length && rows[rowIndex] < time - 25) rowIndex++;
    if (rowIndex < rows.length && Math.abs(rows[rowIndex] - time) <= 25) continue;
    if (result[result.length - 1]?.startTime === time) continue;
    let column = -1;
    for (let step = 0; step < keyCount; step++) {
      // Stable across acceptance and threshold changes: accepting one row must
      // not reset every subsequent proposal to the first lane.
      const c = (index + step) % keyCount;
      const lane = occupied[c];
      while (cursors[c] < lane.length && (lane[cursors[c]].endTime ?? lane[cursors[c]].startTime) < time - 30) cursors[c]++;
      if (!lane[cursors[c]] || lane[cursors[c]].startTime > time + 30) { column = c; break; }
    }
    if (column < 0) continue;
    result.push({ id: `ghost_${onset.timeMs}`, column, startTime: time, sourceTime: onset.timeMs, strength: onset.strength });
  }
  return result;
}
