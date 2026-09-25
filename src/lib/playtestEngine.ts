import type { ManiaNote } from "../types";
import {
  judgeHitError,
  RELEASE_WINDOW_SCALE,
  type HitResult,
  type JudgementWindows,
  type ManiaJudgement,
} from "./playtestJudgements";

// The playtest's moment-to-moment rules, after osu!lazer's mania ruleset:
//
// - DrawableNote.CheckForResult: a press is judged by |error| against the
//   windows; a note that is later than the 50 window without a press misses
//   (HitWindows.CanBeHit), while a press between the 50 and miss windows early
//   is an early miss.
// - OrderedHitPolicy ("note lock"): a note stops being hittable once the next
//   note in its column has started, and hitting a note misses every earlier
//   note in the column still waiting. Presses go to the earliest note that
//   takes them.
// - DrawableHoldNote: a press from the head's miss window on starts holding and
//   judges the head. Releasing judges the tail with 1.5x windows
//   (TailNote.RELEASE_WINDOW_LENIENCE); letting go before that window breaks
//   the hold, which breaks combo. The note can be grabbed again, but its tail
//   then scores at most a 50, as it does when the head was missed. A tail
//   never released in time misses.
//
// It knows nothing about clocks, React or scoring: callers pass song times and
// get judgements back.

export type PlaytestEvent =
  | { kind: "judgement"; result: HitResult }
  /** A hold was let go early: no judgement of its own, but the combo ends. */
  | { kind: "comboBreak"; noteId: string; column: number; time: number };

type NoteRuntime = {
  note: ManiaNote;
  /** Index in its column. */
  index: number;
  isLn: boolean;
  head: ManiaJudgement | null;
  tail: ManiaJudgement | null;
  /** Null until the hold is decided; true once it was let go early. */
  broken: boolean | null;
  holding: boolean;
};

export type PlaytestEngine = {
  press(column: number, time: number, targetId?: string): PlaytestEvent[];
  release(column: number, time: number, targetId?: string): PlaytestEvent[];
  /** Misses whatever time has run past. Call every frame while running. */
  update(time: number): PlaytestEvent[];
  /** Notes the playfield no longer draws: hit, finished, or before the run. */
  hidden: ReadonlySet<string>;
  /** Long notes held right now, whose heads sit on the judgement line. */
  holding: ReadonlySet<string>;
  /** Long notes that were missed or let go, drawn dimmed as they scroll by. */
  dropped: ReadonlySet<string>;
};

const HIT = (j: ManiaJudgement | null) => j !== null && j !== "miss";

function capAt50(j: ManiaJudgement): ManiaJudgement {
  return j === "max" || j === "300" || j === "200" || j === "100" ? "50" : j;
}

export function createPlaytestEngine({
  notes,
  keyCount,
  windows,
  startTime,
}: {
  notes: readonly ManiaNote[];
  keyCount: number;
  windows: JudgementWindows;
  /** Notes starting before this belong to the part of the map skipped over. */
  startTime: number;
}): PlaytestEngine {
  const release: JudgementWindows = {
    max: windows.max * RELEASE_WINDOW_SCALE,
    hit300: windows.hit300 * RELEASE_WINDOW_SCALE,
    hit200: windows.hit200 * RELEASE_WINDOW_SCALE,
    hit100: windows.hit100 * RELEASE_WINDOW_SCALE,
    hit50: windows.hit50 * RELEASE_WINDOW_SCALE,
    miss: windows.miss * RELEASE_WINDOW_SCALE,
  };
  const hidden = new Set<string>();
  const holding = new Set<string>();
  const dropped = new Set<string>();
  const byId = new Map<string, NoteRuntime>();
  const columns: NoteRuntime[][] = Array.from({ length: Math.max(0, keyCount) }, () => []);

  const sorted = [...notes].sort(
    (a, b) => a.startTime - b.startTime || a.column - b.column,
  );
  for (const note of sorted) {
    const column = columns[note.column];
    if (!column) continue;
    const isLn = note.endTime !== undefined && note.endTime > note.startTime;
    const rt: NoteRuntime = {
      note,
      index: column.length,
      isLn,
      head: null,
      tail: null,
      broken: null,
      holding: false,
    };
    if (note.startTime < startTime) {
      // Skipped: settled without a judgement and never drawn.
      rt.head = "max";
      if (isLn) {
        rt.tail = "max";
        rt.broken = false;
      }
      hidden.add(note.id);
    }
    column.push(rt);
    byId.set(note.id, rt);
  }
  /** Per column, the first note that still has something to judge. */
  const cursor = columns.map(() => 0);

  const done = (rt: NoteRuntime) =>
    rt.head !== null && (!rt.isLn || rt.tail !== null);
  const endOf = (rt: NoteRuntime) => rt.note.endTime ?? rt.note.startTime;

  const advance = (column: number) => {
    const list = columns[column];
    while (cursor[column] < list.length && done(list[cursor[column]])) {
      cursor[column] += 1;
    }
  };

  const result = (
    rt: NoteRuntime,
    part: HitResult["part"],
    time: number,
    target: number,
    judgement: ManiaJudgement,
  ): PlaytestEvent => ({
    kind: "judgement",
    result: {
      noteId: rt.note.id,
      column: rt.note.column,
      time,
      hitError: time - target,
      judgement,
      part,
    },
  });

  const breakHold = (rt: NoteRuntime, time: number, out: PlaytestEvent[]) => {
    if (rt.broken !== null) return;
    rt.broken = true;
    dropped.add(rt.note.id);
    out.push({ kind: "comboBreak", noteId: rt.note.id, column: rt.note.column, time });
  };

  const stopHolding = (rt: NoteRuntime) => {
    rt.holding = false;
    holding.delete(rt.note.id);
  };

  /** Settles a long note's tail and hold together, as its drawable does. */
  const settleTail = (
    rt: NoteRuntime,
    judgement: ManiaJudgement,
    time: number,
    out: PlaytestEvent[],
  ) => {
    const capped =
      !HIT(rt.head) || rt.broken === true ? capAt50(judgement) : judgement;
    rt.tail = capped;
    out.push(result(rt, "ln-tail", time, endOf(rt), capped));
    if (HIT(capped)) {
      if (rt.broken === null) rt.broken = false;
      hidden.add(rt.note.id);
    } else {
      breakHold(rt, time, out);
    }
    stopHolding(rt);
  };

  const judgeHead = (
    rt: NoteRuntime,
    judgement: ManiaJudgement,
    time: number,
    out: PlaytestEvent[],
  ) => {
    rt.head = judgement;
    out.push(result(rt, rt.isLn ? "ln-head" : "rice", time, rt.note.startTime, judgement));
    if (!rt.isLn && HIT(judgement)) hidden.add(rt.note.id);
    if (rt.isLn && !HIT(judgement)) dropped.add(rt.note.id);
  };

  /** Missing everything earlier in the column that a hit leaves behind. */
  const missBefore = (column: number, rt: NoteRuntime, time: number, out: PlaytestEvent[]) => {
    const list = columns[column];
    for (let i = cursor[column]; i < rt.index; i++) {
      const earlier = list[i];
      if (endOf(earlier) >= rt.note.startTime) break;
      if (earlier.head === null) judgeHead(earlier, "miss", time, out);
      if (earlier.isLn && earlier.tail === null) {
        earlier.tail = "miss";
        out.push(result(earlier, "ln-tail", time, endOf(earlier), "miss"));
        breakHold(earlier, time, out);
        stopHolding(earlier);
      }
    }
  };

  const tryPress = (
    rt: NoteRuntime,
    time: number,
    out: PlaytestEvent[],
  ): boolean => {
    const column = rt.note.column;
    if (!rt.isLn) {
      const judgement = judgeHitError(time - rt.note.startTime, windows);
      if (!judgement) return false;
      judgeHead(rt, judgement, time, out);
      missBefore(column, rt, time, out);
      return true;
    }
    const end = endOf(rt);
    // Past the tail's window the hold can no longer begin.
    if (time > end && time - end > release.hit50) return false;
    if (time - rt.note.startTime >= -windows.miss) rt.holding = true;
    // Grabbing a note again after a miss or a break keeps it scrolling; the
    // press carries on to later notes, as osu!'s does.
    if (rt.head !== null) return false;
    const judgement = judgeHitError(time - rt.note.startTime, windows);
    if (!judgement) return false;
    judgeHead(rt, judgement, time, out);
    if (rt.holding && HIT(judgement)) holding.add(rt.note.id);
    missBefore(column, rt, time, out);
    return true;
  };

  return {
    hidden,
    holding,
    dropped,

    press(column, time, targetId) {
      const out: PlaytestEvent[] = [];
      if (targetId !== undefined) {
        const rt = byId.get(targetId);
        if (rt && rt.note.column === column && !done(rt)) tryPress(rt, time, out);
        advance(column);
        return out;
      }
      const list = columns[column];
      if (!list) return out;
      for (let i = cursor[column]; i < list.length; i++) {
        const rt = list[i];
        if (rt.note.startTime - time > windows.miss) break;
        if (done(rt)) continue;
        const next = list[i + 1];
        // Note lock: once the next note has started, this one is out of reach.
        if (next && time >= next.note.startTime) continue;
        if (tryPress(rt, time, out)) break;
      }
      advance(column);
      return out;
    },

    release(column, time, targetId) {
      const out: PlaytestEvent[] = [];
      const list = columns[column];
      if (!list) return out;
      for (let i = cursor[column]; i < list.length; i++) {
        const rt = list[i];
        if (rt.note.startTime > time + windows.miss) break;
        if (!rt.holding || done(rt)) continue;
        if (targetId !== undefined && rt.note.id !== targetId) continue;
        const judgement = judgeHitError(time - endOf(rt), release);
        if (judgement) {
          settleTail(rt, judgement, time, out);
        } else {
          // Let go too early to count: the hold is broken, the tail waits.
          breakHold(rt, time, out);
          stopHolding(rt);
        }
      }
      advance(column);
      return out;
    },

    update(time) {
      const out: PlaytestEvent[] = [];
      for (let column = 0; column < columns.length; column++) {
        const list = columns[column];
        for (let i = cursor[column]; i < list.length; i++) {
          const rt = list[i];
          if (rt.note.startTime > time) break;
          if (rt.head === null && time - rt.note.startTime > windows.hit50) {
            judgeHead(rt, "miss", time, out);
          }
          if (rt.isLn && rt.tail === null && time - endOf(rt) > release.hit50) {
            rt.tail = "miss";
            out.push(result(rt, "ln-tail", time, endOf(rt), "miss"));
            breakHold(rt, time, out);
            stopHolding(rt);
          }
        }
        advance(column);
      }
      return out;
    },
  };
}
