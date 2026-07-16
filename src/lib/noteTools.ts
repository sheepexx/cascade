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
