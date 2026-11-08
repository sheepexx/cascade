import type { ManiaNote } from "../types";
import { hasNoteCollisions } from "./noteCollision";

export type LaneSwap =
  /** The notes in the way, already moved to the lane the dragged notes left. */
  | { kind: "swap"; displaced: ManiaNote[] }
  /** Notes in the way that would land on something else, where they are now. */
  | { kind: "blocked"; stuck: ManiaNote[] };

function noteEnd(note: ManiaNote): number {
  return note.endTime !== undefined && note.endTime > note.startTime
    ? note.endTime
    : note.startTime;
}

/**
 * The `targets` that overlap any note in `field` in the same lane, by the same
 * rule as notesCollide. Each lane's field is sorted once with a running
 * furthest end, so a check is a binary search rather than a scan.
 */
function collidingWith(targets: ManiaNote[], field: ManiaNote[]): ManiaNote[] {
  const lanes = new Map<number, ManiaNote[]>();
  for (const note of field) {
    const lane = lanes.get(note.column);
    if (lane) lane.push(note);
    else lanes.set(note.column, [note]);
  }
  const index = new Map<number, { starts: number[]; furthest: number[] }>();
  for (const [column, lane] of lanes) {
    lane.sort((a, b) => a.startTime - b.startTime);
    const starts = lane.map((n) => n.startTime);
    const furthest: number[] = [];
    let reach = -Infinity;
    for (const note of lane) {
      reach = Math.max(reach, noteEnd(note));
      furthest.push(reach);
    }
    index.set(column, { starts, furthest });
  }
  // How many starts fall below `time` (or at it, with `inclusive`).
  const countBefore = (starts: number[], time: number, inclusive: boolean) => {
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] < time || (inclusive && starts[mid] === time)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return targets.filter((note) => {
    const lane = index.get(note.column);
    if (!lane) return false;
    const { starts, furthest } = lane;
    const sameStart =
      countBefore(starts, note.startTime, true) >
      countBefore(starts, note.startTime, false);
    if (sameStart) return true;
    const earlier = countBefore(starts, noteEnd(note), false);
    return earlier > 0 && furthest[earlier - 1] > note.startTime;
  });
}

/**
 * When a sideways drag drops notes onto others, the notes in the way can
 * trade places: they move to the lane the dragged notes came from, keeping
 * their times, hitsounds and everything else. Null when the drag also moved
 * notes in time, or nothing is in the way. "blocked" when a note in the way
 * would land on another note there, in which case nothing should move.
 *
 * `notes` is the chart before the drag and `moved` the dragged notes where
 * they were dropped.
 */
export function laneSwapFor(
  notes: ManiaNote[],
  moved: ManiaNote[],
  colDelta: number,
): LaneSwap | null {
  if (colDelta === 0 || !moved.length) return null;
  const movedById = new Map(moved.map((n) => [n.id, n]));
  let found = 0;
  for (const before of notes) {
    const after = movedById.get(before.id);
    if (!after) continue;
    found++;
    if (
      after.column !== before.column + colDelta ||
      after.startTime !== before.startTime ||
      (after.endTime ?? undefined) !== (before.endTime ?? undefined)
    ) {
      return null;
    }
  }
  if (found !== moved.length) return null;

  const others = notes.filter((n) => !movedById.has(n.id));
  const inTheWay = collidingWith(others, moved);
  if (!inTheWay.length) return null;
  const inTheWayIds = new Set(inTheWay.map((n) => n.id));
  const displaced = inTheWay.map((n) => ({ ...n, column: n.column - colDelta }));
  const staying = others.filter((n) => !inTheWayIds.has(n.id));

  if (!hasNoteCollisions([...staying, ...moved, ...displaced])) {
    return { kind: "swap", displaced };
  }
  const stuckIds = new Set(
    collidingWith(displaced, [...staying, ...moved]).map((n) => n.id),
  );
  return {
    kind: "blocked",
    stuck: stuckIds.size
      ? inTheWay.filter((n) => stuckIds.has(n.id))
      : inTheWay,
  };
}
