import { describe, it, expect } from "vitest";
import { makeRedPoint, makeGreenPoint } from "../types";
import {
  beatLength,
  activeTimingAt,
  bpmAt,
  effectiveSvAt,
  volumeAt,
  kiaiAt,
  kiaiRanges,
  snapTime,
  snapIntervalAt,
  stepToSnap,
  gridLinesInRange,
  formatTime,
  parseTimestamp,
} from "./timing";

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

  it("switches tempo at the next red point", () => {
    const points = [makeRedPoint(0, 120), makeRedPoint(500, 240)];
    const lines = gridLinesInRange(0, 1000, points, 1).map((l) => l.time);
    expect(lines).toEqual([0, 500, 750, 1000]);
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
