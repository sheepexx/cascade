import { describe, it, expect } from "vitest";
import {
  FREE_SNAP,
  makeRedPoint,
  makeGreenPoint,
  type TimingPoint,
} from "../types";
import {
  beatLength,
  activeTimingAt,
  bpmAt,
  effectiveSvAt,
  volumeAt,
  kiaiAt,
  kiaiRanges,
  snapTime,
  stableTickMs,
  nearestStableSnap,
  toStableTick,
  snapIntervalAt,
  snapTickDivisor,
  stepToSnap,
  gridLinesInRange,
  formatTime,
  parseTimestamp,
  noteSnapDivisor,
  notesFollowingTiming,
} from "./timing";
import type { ManiaNote } from "../types";

describe("beatLength", () => {
  it("converts BPM to ms per beat", () => {
    expect(beatLength(120)).toBe(500);
    expect(beatLength(60)).toBe(1000);
  });
});

describe("activeTimingAt / bpmAt", () => {
  const points = [makeRedPoint(0, 120), makeRedPoint(1000, 240)];

  it("returns the last red point at or before the time", () => {
    expect(activeTimingAt(500, points).bpm).toBe(120);
    expect(activeTimingAt(1000, points).bpm).toBe(240);
    expect(activeTimingAt(1500, points).bpm).toBe(240);
  });

  it("falls back to the earliest red point before all points", () => {
    expect(activeTimingAt(-500, points).bpm).toBe(120);
  });

  it("bpmAt defaults to 120 with no points", () => {
    expect(bpmAt(0, [])).toBe(120);
  });
});

describe("effectiveSvAt", () => {
  it("uses the most recent green point's SV", () => {
    const points = [makeRedPoint(0, 120), makeGreenPoint(100, 2)];
    expect(effectiveSvAt(50, points)).toBe(1);
    expect(effectiveSvAt(100, points)).toBe(2);
    expect(effectiveSvAt(200, points)).toBe(2);
  });

  it("resets SV to 1.0 at a red point (osu! semantics)", () => {
    const points = [
      makeRedPoint(0, 120),
      makeGreenPoint(100, 2),
      makeRedPoint(200, 180),
    ];
    expect(effectiveSvAt(250, points)).toBe(1);
  });
});

describe("volumeAt / kiaiAt", () => {
  it("tracks the most recent volume", () => {
    const points = [
      makeRedPoint(0, 120, { volume: 100 }),
      makeGreenPoint(500, 1, { volume: 40 }),
    ];
    expect(volumeAt(0, points)).toBe(100);
    expect(volumeAt(600, points)).toBe(40);
  });

  it("tracks the most recent kiai flag", () => {
    const points = [
      makeRedPoint(0, 120),
      makeGreenPoint(500, 1, { kiai: true }),
      makeGreenPoint(1000, 1, { kiai: false }),
    ];
    expect(kiaiAt(250, points)).toBe(false);
    expect(kiaiAt(700, points)).toBe(true);
    expect(kiaiAt(1200, points)).toBe(false);
  });
});

describe("timing lookups on dense maps", () => {
  // The lookups binary search; a straight scan is what they must agree with.
  const lastAtOrBefore = (list: TimingPoint[], time: number) =>
    [...list]
      .sort((a, b) => a.time - b.time)
      .filter((p) => p.time <= time)
      .pop();

  const points = [
    makeRedPoint(0, 120),
    makeGreenPoint(250, 0.5, { volume: 60, kiai: true }),
    makeGreenPoint(250, 1.5, { volume: 70, kiai: false }),
    makeRedPoint(500, 180, { volume: 90 }),
    ...Array.from({ length: 400 }, (_, i) =>
      makeGreenPoint(600 + i * 10, 1 + (i % 7) / 10, {
        volume: 20 + (i % 50),
        kiai: i % 3 === 0,
      }),
    ),
    makeRedPoint(4000, 200),
    makeRedPoint(4000, 210),
  ];
  const times = [-100, 0, 1, 249, 250, 251, 500, 605, 610, 3990, 3999, 4000, 9000];

  it("agrees with a scan for the last point at or before each time", () => {
    const reds = points.filter((p) => p.uninherited);
    for (const time of times) {
      const last = lastAtOrBefore(points, time);
      expect(effectiveSvAt(time, points)).toBe(
        !last || last.uninherited ? 1 : last.sv,
      );
      expect(volumeAt(time, points)).toBe(last ? last.volume : 100);
      expect(kiaiAt(time, points)).toBe(last ? last.kiai : false);
      expect(activeTimingAt(time, points)).toBe(
        lastAtOrBefore(reds, time) ?? reds[0],
      );
    }
  });

  it("lets the later of two points at the same time win", () => {
    expect(effectiveSvAt(250, points)).toBe(1.5);
    expect(activeTimingAt(4000, points).bpm).toBe(210);
  });
});

describe("kiaiRanges", () => {
  it("pairs a kiai-on point with the next kiai-off point", () => {
    const points = [
      makeRedPoint(0, 120),
      makeGreenPoint(1000, 1, { kiai: true }),
      makeGreenPoint(2000, 1, { kiai: false }),
    ];
    expect(kiaiRanges(points, 5000)).toEqual([{ start: 1000, end: 2000 }]);
  });

  it("closes an open kiai section at the song end", () => {
    const points = [makeRedPoint(0, 120, { kiai: true })];
    expect(kiaiRanges(points, 5000)).toEqual([{ start: 0, end: 5000 }]);
  });
});

describe("snapTime / snapIntervalAt", () => {
  const points = [makeRedPoint(0, 120)];

  it("computes the snap cell length for a divisor", () => {
    expect(snapIntervalAt(0, points, 4)).toBe(125);
    expect(snapIntervalAt(0, points, 1)).toBe(500);
  });

  it("snaps to the nearest grid line", () => {
    expect(snapTime(60, points, 4)).toBe(0);
    expect(snapTime(70, points, 4)).toBe(125);
    expect(snapTime(130, points, 4)).toBe(125);
  });

  it("leaves the time alone on free snap", () => {
    expect(snapTime(60, points, FREE_SNAP)).toBe(60);
    expect(snapTime(130, points, FREE_SNAP)).toBe(130);
    expect(snapTime(7.4, points, FREE_SNAP)).toBe(7);
  });

  it("falls back to a 1/16 cell for free snap steps and LN ticks", () => {
    expect(snapTickDivisor(FREE_SNAP)).toBe(16);
    expect(snapTickDivisor(4)).toBe(4);
    expect(snapIntervalAt(0, points, FREE_SNAP)).toBe(31.25);
  });

  it("floors a tick between milliseconds the way osu! stable does", () => {
    // 1/3 of a 500ms beat is 166.67; stable places it on 166, not 167.
    expect(snapTime(170, points, 3)).toBe(166);
    expect(snapTime(420, points, 6)).toBe(416);
    expect(snapTime(130, points, 4)).toBe(125);
  });
});

describe("osu! stable ticks", () => {
  const points = [makeRedPoint(0, 120)];

  it("floors to the millisecond without losing a whole tick to float error", () => {
    expect(stableTickMs(166.667)).toBe(166);
    expect(stableTickMs(999.9999999)).toBe(1000);
    expect(stableTickMs(1000)).toBe(1000);
  });

  it("finds the stable snap and how far a time is from it", () => {
    expect(nearestStableSnap(166, points)).toMatchObject({ snapped: 166, unsnap: 0, divisor: 3 });
    expect(nearestStableSnap(167, points)).toMatchObject({ snapped: 166, unsnap: 1 });
    expect(nearestStableSnap(127, points)).toMatchObject({ snapped: 125, unsnap: 2 });
  });

  it("counts a decimal red line's own floored millisecond as snapped", () => {
    const pts = [makeRedPoint(0, 120), makeRedPoint(1000.6, 200)];
    expect(nearestStableSnap(1000, pts)).toMatchObject({ snapped: 1000, unsnap: 0 });
  });

  it("moves times within a millisecond of a tick onto it and leaves the rest", () => {
    expect(toStableTick(167, points)).toBe(166);
    expect(toStableTick(165, points)).toBe(166);
    expect(toStableTick(166.4, points)).toBe(166);
    expect(toStableTick(300, points)).toBe(300);
    expect(toStableTick(7.4, [])).toBe(7);
  });
});

describe("stepToSnap", () => {
  const points = [makeRedPoint(0, 120)];

  it("advances by one cell when already on a line", () => {
    expect(stepToSnap(0, points, 4, 1)).toBe(125);
    expect(stepToSnap(250, points, 4, -1)).toBe(125);
  });

  it("lands on the nearest line in the step direction when off-grid", () => {
    expect(stepToSnap(60, points, 4, 1)).toBe(125);
    expect(stepToSnap(60, points, 4, -1)).toBe(0);
  });

  it("moves by a cell without snapping on free snap", () => {
    expect(stepToSnap(60, points, FREE_SNAP, 1)).toBe(91);
    expect(stepToSnap(60, points, FREE_SNAP, -1)).toBe(29);
  });
});

describe("gridLinesInRange", () => {
  it("emits one line per snap cell with a barline at the bar boundary", () => {
    const points = [makeRedPoint(0, 120, { meter: 4 })];
    const lines = gridLinesInRange(0, 1000, points, 4);
    expect(lines.map((l) => l.time)).toEqual([
      0, 125, 250, 375, 500, 625, 750, 875, 1000,
    ]);
    expect(lines.filter((l) => l.barline).map((l) => l.time)).toEqual([0]);
    expect(lines[0].idxInBeat).toBe(0);
    expect(lines[1].idxInBeat).toBe(1);
  });

  it("returns nothing for an empty/inverted range", () => {
    const points = [makeRedPoint(0, 120)];
    expect(gridLinesInRange(1000, 0, points, 4)).toEqual([]);
  });

  it("keeps only the beat and bar lines on free snap", () => {
    const points = [makeRedPoint(0, 120, { meter: 4 })];
    const lines = gridLinesInRange(0, 2000, points, FREE_SNAP);
    expect(lines.map((l) => l.time)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(lines.filter((l) => l.barline).map((l) => l.time)).toEqual([0, 2000]);
  });

  it("switches tempo at the next red point", () => {
    const points = [makeRedPoint(0, 120), makeRedPoint(500, 240)];
    const lines = gridLinesInRange(0, 1000, points, 1).map((l) => l.time);
    expect(lines).toEqual([0, 500, 750, 1000]);
  });

  it("extrapolates the first timing grid backwards", () => {
    const points = [makeRedPoint(1000, 120, { meter: 4 })];
    const lines = gridLinesInRange(0, 1000, points, 1);
    expect(lines.map((line) => line.time)).toEqual([0, 500, 1000]);
    expect(lines.filter((line) => line.barline).map((line) => line.time)).toEqual([
      1000,
    ]);
  });
});

describe("formatTime", () => {
  it("formats milliseconds as mm:ss.mmm", () => {
    expect(formatTime(0)).toBe("0:00.000");
    expect(formatTime(61500)).toBe("1:01.500");
    expect(formatTime(-1500)).toBe("-0:01.500");
  });
});

describe("parseTimestamp", () => {
  it("parses osu-style mm:ss:ms and mm:ss.ms", () => {
    expect(parseTimestamp("01:23:456")).toBe(83456);
    expect(parseTimestamp("1:23.456")).toBe(83456);
  });

  it("parses minutes and seconds without millis", () => {
    expect(parseTimestamp("2:05")).toBe(125000);
    expect(parseTimestamp("0:00")).toBe(0);
  });

  it("reads short milli parts as a fraction of a second", () => {
    expect(parseTimestamp("1:23.4")).toBe(83400);
    expect(parseTimestamp("1:23.45")).toBe(83450);
  });

  it("parses a raw millisecond count", () => {
    expect(parseTimestamp("83456")).toBe(83456);
  });

  it("ignores trailing osu editor selections", () => {
    expect(parseTimestamp("01:23:456 (1|2,3|4) - ")).toBe(83456);
    expect(parseTimestamp("01:23:456(1)")).toBe(83456);
  });

  it("round-trips formatTime output", () => {
    expect(parseTimestamp(formatTime(83456))).toBe(83456);
  });

  it("rejects nonsense", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("hello")).toBeNull();
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("1:23:456:7")).toBeNull();
  });
});

describe("noteSnapDivisor", () => {
  const points = [makeRedPoint(0, 120)];

  it("finds the coarsest divisor a note sits on", () => {
    expect(noteSnapDivisor(1000, points)).toBe(1);
    expect(noteSnapDivisor(250, points)).toBe(2);
    expect(noteSnapDivisor(125, points)).toBe(4);
    expect(noteSnapDivisor(1125, points)).toBe(4);
    expect(noteSnapDivisor(62, points)).toBe(8);
    expect(noteSnapDivisor(31, points)).toBe(16);
    expect(noteSnapDivisor(100, points)).toBe(5);
  });

  it("reads triplets at the millisecond stable floors them to", () => {
    expect(noteSnapDivisor(166, points)).toBe(3);
    expect(noteSnapDivisor(83, points)).toBe(6);
    expect(noteSnapDivisor(41, points)).toBe(12);
  });

  it("accepts a note an older version rounded a millisecond late", () => {
    expect(noteSnapDivisor(167, points)).toBe(3);
  });

  it("returns 0 for notes off every coloured divisor", () => {
    expect(noteSnapDivisor(10, points)).toBe(0);
    expect(noteSnapDivisor(500, [])).toBe(0);
  });

  it("counts a note on the next red line as on the beat", () => {
    const two = [makeRedPoint(0, 120), makeRedPoint(1100.4, 200)];
    expect(noteSnapDivisor(1100, two)).toBe(1);
  });
});

describe("notesFollowingTiming", () => {
  const note = (startTime: number, endTime?: number): ManiaNote =>
    endTime === undefined
      ? { id: `n${startTime}`, column: 0, startTime }
      : { id: `n${startTime}`, column: 0, startTime, endTime };
  const times = (notes: ManiaNote[]) =>
    notes.map((n) => (n.endTime === undefined ? n.startTime : [n.startTime, n.endTime]));
  const retime = (points: TimingPoint[], id: string, patch: Partial<TimingPoint>) =>
    points.map((p) => (p.id === id ? { ...p, ...patch } : p));

  it("moves notes with an offset change", () => {
    const before = [makeRedPoint(1000, 120)];
    const after = retime(before, before[0].id, { time: 1015 });
    const notes = [note(1000), note(1500), note(2000, 2500)];
    expect(times(notesFollowingTiming(notes, before, after))).toEqual([
      1015,
      1515,
      [2015, 2515],
    ]);
  });

  it("keeps notes on the same beat when the BPM changes", () => {
    const before = [makeRedPoint(0, 120)];
    const after = retime(before, before[0].id, { bpm: 240 });
    const notes = [note(1000), note(1000, 2000), note(166)];
    expect(times(notesFollowingTiming(notes, before, after))).toEqual([
      500,
      [500, 1000],
      83,
    ]);
  });

  it("only moves notes under the red line that changed", () => {
    const before = [makeRedPoint(0, 120), makeRedPoint(4000, 120)];
    const after = retime(before, before[1].id, { bpm: 240 });
    const notes = [note(3500), note(4000), note(5000)];
    expect(times(notesFollowingTiming(notes, before, after))).toEqual([
      3500,
      4000,
      4500,
    ]);
  });

  it("moves a note on a red line with a fractional time along with it", () => {
    const before = [makeRedPoint(0, 120), makeRedPoint(4000.6, 120)];
    const after = retime(before, before[1].id, { time: 4010.6 });
    const notes = [note(4000), note(4500)];
    expect(times(notesFollowingTiming(notes, before, after))).toEqual([
      4010,
      4510,
    ]);
  });

  it("leaves notes alone when their red line is removed or only SV changes", () => {
    const red = makeRedPoint(0, 120);
    const second = makeRedPoint(2000, 180);
    const notes = [note(1000), note(2500)];
    expect(notesFollowingTiming(notes, [red, second], [red])).toBe(notes);
    const green = makeGreenPoint(500, 1);
    expect(
      notesFollowingTiming(notes, [red, green], [red, { ...green, sv: 2 }]),
    ).toBe(notes);
  });

  it("ends up where one direct edit would after typing a BPM digit by digit", () => {
    const start = [makeRedPoint(250, 180)];
    const id = start[0].id;
    const notes = [note(250), note(361), note(583), note(1250, 1916), note(10250)];
    const direct = notesFollowingTiming(notes, start, retime(start, id, { bpm: 200 }));
    let points = start;
    let stepped = notes;
    for (const bpm of [18, 1, 2, 20, 200]) {
      const next = retime(points, id, { bpm });
      stepped = notesFollowingTiming(stepped, points, next);
      points = next;
    }
    expect(times(stepped)).toEqual(times(direct));
  });

  it("keeps a hold's length when its tail would land in front of its head", () => {
    const before = [makeRedPoint(0, 120), makeRedPoint(2000, 120)];
    const after = retime(before, before[1].id, { time: 1000 });
    const moved = notesFollowingTiming([note(1500, 2500)], before, after);
    expect(times(moved)).toEqual([[1500, 2500]]);
  });
});
