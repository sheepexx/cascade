import { describe, expect, it } from "vitest";
import { makeRedPoint, type ManiaNote } from "../types";
import {
  formatOsuClock,
  formatOsuTimestamp,
  notesAtOsuTimestamp,
  osuEditLink,
  parseOsuTimestamp,
} from "./osuTimestamp";

const notes = (pairs: [number, number][]): ManiaNote[] =>
  pairs.map(([startTime, column], i) => ({ id: `n${i}`, startTime, column }));

describe("formatOsuTimestamp", () => {
  it("copies notes the way osu! stable's editor does", () => {
    const selected = notes([
      [71974, 4], [72259, 6], [72545, 5], [72831, 4], [73116, 5], [73402, 6],
    ]);
    expect(formatOsuTimestamp(selected, [])).toBe(
      "01:11:974 (71974|4,72259|6,72545|5,72831|4,73116|5,73402|6) - ",
    );
  });

  it("orders by time, then left to right on a row", () => {
    const selected = notes([[21076, 6], [20901, 6], [21076, 5], [20901, 5]]);
    expect(formatOsuTimestamp(selected, [])).toBe(
      "00:20:901 (20901|5,20901|6,21076|5,21076|6) - ",
    );
  });

  it("writes each note on the millisecond the export would", () => {
    // 1/3 at 120 BPM: stable floors the 166.67 ms tick to 166.
    const points = [makeRedPoint(0, 120)];
    expect(formatOsuTimestamp(notes([[167, 0]]), points)).toBe(
      "00:00:166 (166|0) - ",
    );
  });

  it("has nothing to copy without notes", () => {
    expect(formatOsuTimestamp([], [])).toBeNull();
  });

  it("pads the clock", () => {
    expect(formatOsuClock(0)).toBe("00:00:000");
    expect(formatOsuClock(600_005)).toBe("10:00:005");
    expect(formatOsuClock(-500)).toBe("-00:00:500");
  });
});

describe("osuEditLink", () => {
  it("links the timestamp without stable's trailing dash", () => {
    const stamp = formatOsuTimestamp(
      notes([[20901, 5], [20901, 6], [21076, 5]]),
      [],
    )!;
    expect(osuEditLink(stamp)).toBe(
      "osu://edit/00:20:901%20(20901|5,20901|6,21076|5)",
    );
  });
});

describe("parseOsuTimestamp", () => {
  it("reads a raw copy with a modding comment after it", () => {
    expect(parseOsuTimestamp("01:11:974 (71974|4,72259|6) - unsnapped")).toEqual({
      time: 71974,
      notes: [
        { time: 71974, column: 4 },
        { time: 72259, column: 6 },
      ],
    });
  });

  it("reads an osu://edit link", () => {
    expect(
      parseOsuTimestamp("osu://edit/00:20:901%20(20901|5,20901|6)"),
    ).toEqual({
      time: 20901,
      notes: [
        { time: 20901, column: 5 },
        { time: 20901, column: 6 },
      ],
    });
  });

  it("reads a bare time, and combo numbers from other modes as just the time", () => {
    expect(parseOsuTimestamp("01:20:000")).toEqual({ time: 80000, notes: [] });
    expect(parseOsuTimestamp("00:12:034 (5,6) - ")).toEqual({
      time: 12034,
      notes: [],
    });
  });

  it("rejects text that is not a timestamp", () => {
    expect(parseOsuTimestamp("")).toBeNull();
    expect(parseOsuTimestamp("hello 01:11:974 (71974|4)")).toBeNull();
    expect(parseOsuTimestamp("1:11.974")).toBeNull();
    expect(parseOsuTimestamp("01:60:000")).toBeNull();
  });
});

describe("notesAtOsuTimestamp", () => {
  const points = [makeRedPoint(0, 120)];
  const map = notes([[167, 0], [500, 1], [500, 2], [1000, 3]]);

  it("finds the named notes on their column and millisecond", () => {
    const stamp = parseOsuTimestamp("00:00:500 (500|1,500|2,1000|3)")!;
    expect(notesAtOsuTimestamp(stamp, map, points).map((n) => n.id)).toEqual([
      "n1", "n2", "n3",
    ]);
  });

  it("matches a note by where it sits or where the export puts it", () => {
    expect(
      notesAtOsuTimestamp(parseOsuTimestamp("00:00:166 (166|0)")!, map, points),
    ).toHaveLength(1);
    expect(
      notesAtOsuTimestamp(parseOsuTimestamp("00:00:167 (167|0)")!, map, points),
    ).toHaveLength(1);
  });

  it("skips notes that are not there", () => {
    const stamp = parseOsuTimestamp("00:00:500 (500|3,500|6)")!;
    expect(notesAtOsuTimestamp(stamp, map, points)).toEqual([]);
  });
});
