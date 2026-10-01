import {
  makeDifficulty,
  makeGreenPoint,
  makeRedPoint,
  type Difficulty,
  type ManiaNote,
  type TimingPoint,
} from "../../types";

/**
 * Builds a chart of a given size that looks like a real dense map, for
 * measuring how the editor's code scales: streams and jumpstreams on a 1/4
 * grid, chords, long notes about one in eight, hitsounds on the downbeats,
 * BPM changes every so often and a green line every few bars.
 *
 * Deterministic, so two runs measure the same work.
 */
export function stressChart(noteCount: number, keyCount = 7): {
  difficulty: Difficulty;
  timingPoints: TimingPoint[];
} {
  let seed = 1234567;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const timingPoints: TimingPoint[] = [];
  const notes: ManiaNote[] = [];
  const busyUntil = new Array<number>(keyCount).fill(-Infinity);
  let time = 1000;
  let bpm = 180;
  let section = 0;
  timingPoints.push(makeRedPoint(time, bpm));
  while (notes.length < noteCount) {
    // A new section every 64 beats: tempo shifts a little, SV changes.
    if (section % 64 === 0 && section > 0) {
      bpm = 160 + Math.round(random() * 60);
      timingPoints.push(makeRedPoint(time, bpm));
    }
    if (section % 16 === 0) {
      timingPoints.push(makeGreenPoint(time, 0.75 + Math.round(random() * 4) / 8, { kiai: section % 128 < 32 }));
    }
    const step = 60000 / bpm / 4;
    const chord = random() < 0.25 ? 2 + Math.floor(random() * 2) : 1;
    const used = new Set<number>();
    for (let c = 0; c < chord && notes.length < noteCount; c++) {
      let column = Math.floor(random() * keyCount);
      for (let tries = 0; (used.has(column) || busyUntil[column] >= time) && tries < keyCount; tries++) {
        column = (column + 1) % keyCount;
      }
      if (used.has(column) || busyUntil[column] >= time) continue;
      used.add(column);
      const start = Math.round(time);
      const hold = random() < 0.12;
      const endTime = hold ? Math.round(time + step * (2 + Math.floor(random() * 6))) : undefined;
      busyUntil[column] = endTime ?? start;
      notes.push({
        id: `n${notes.length}`,
        column,
        startTime: start,
        ...(endTime !== undefined ? { endTime } : {}),
        ...(section % 4 === 0 && c === 0 ? { hitSound: 2 } : {}),
      });
    }
    time += step;
    section += 1;
  }
  const difficulty: Difficulty = {
    ...makeDifficulty(`Stress ${noteCount}`, keyCount),
    timingPoints,
    notes,
  };
  return { difficulty, timingPoints };
}
