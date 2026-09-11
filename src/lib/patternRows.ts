import type { ManiaNote } from "../types";

export type NoteRow = { time: number; mask: number; notes: ManiaNote[] };

export const CHORD_TOLERANCE_MS = 10;
export const REPEAT_LOOKBACK = 8;
export const REPEAT_MAX_PERIOD = 16;
export const ROLL_MIN_STEPS = 8;

export function toRows(notes: ManiaNote[], keyCount: number): NoteRow[] {
  const sorted = notes
    .filter((n) => Number.isFinite(n.startTime) && n.column >= 0 && n.column < keyCount)
    .sort((a, b) => a.startTime - b.startTime);
  const rows: NoteRow[] = [];
  for (const n of sorted) {
    const last = rows[rows.length - 1];
    if (last && n.startTime - last.time <= CHORD_TOLERANCE_MS) {
      last.mask |= 1 << n.column;
      last.notes.push(n);
    } else rows.push({ time: n.startTime, mask: 1 << n.column, notes: [n] });
  }
  return rows;
}

export function repeatPeriod(masks: ArrayLike<number>, end: number): number {
  for (let p = 1; p <= REPEAT_MAX_PERIOD; p++) {
    if (end - (REPEAT_LOOKBACK - 1) - p < 0) return 0;
    let k = 0;
    while (k < REPEAT_LOOKBACK && masks[end - k] === masks[end - k - p]) k++;
    if (k === REPEAT_LOOKBACK) return p;
  }
  return 0;
}

export function rollStep(prev: number, next: number, keyCount: number): number {
  if (!prev || !next || prev & (prev - 1) || next & (next - 1)) return 0;
  const d = (Math.log2(next) - Math.log2(prev) + keyCount) % keyCount;
  if (d === 0 || d * 2 === keyCount) return 0;
  return d * 2 < keyCount ? 1 : -1;
}

export function rollLengthAt(masks: ArrayLike<number>, end: number, keyCount: number): number {
  const dir = end > 0 ? rollStep(masks[end - 1], masks[end], keyCount) : 0;
  if (!dir) return 0;
  let length = 1;
  while (end - length > 0 && rollStep(masks[end - length - 1], masks[end - length], keyCount) === dir) length++;
  return length;
}

export type MonotoneRun = { from: number; to: number; kind: "repeat" | "roll"; period: number };

export function monotoneRuns(masks: ArrayLike<number>, keyCount: number): MonotoneRun[] {
  const runs: (MonotoneRun & { repeats: number; rolls: number })[] = [];
  let roll = 0;
  let dir = 0;
  for (let i = 0; i < masks.length; i++) {
    const step = i > 0 ? rollStep(masks[i - 1], masks[i], keyCount) : 0;
    if (step && step === dir) roll++;
    else {
      roll = step ? 1 : 0;
      dir = step;
    }
    const period = repeatPeriod(masks, i);
    if (!period && roll < ROLL_MIN_STEPS) continue;
    const start = Math.max(0, period ? i - REPEAT_LOOKBACK - period + 1 : i - roll);
    const current = runs[runs.length - 1];
    if (current && current.to === i - 1) {
      current.to = i;
      current.from = Math.min(current.from, start);
      if (period) {
        current.repeats++;
        if (!current.period) current.period = period;
      } else current.rolls++;
    } else {
      runs.push({ from: start, to: i, kind: "repeat", period, repeats: period ? 1 : 0, rolls: period ? 0 : 1 });
    }
  }
  return runs.map(({ repeats, rolls, ...run }) => ({ ...run, kind: repeats >= rolls ? "repeat" : "roll" }));
}
