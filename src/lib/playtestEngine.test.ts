import { describe, expect, it } from "vitest";
import type { ManiaNote } from "../types";
import { maniaJudgementWindows } from "./playtestJudgements";
import { createPlaytestEngine, type PlaytestEvent } from "./playtestEngine";

// OD 8: MAX 16.5, 300 40.5, 200 73.5, 100 103.5, 50 127.5, miss 164.5.
const windows = maniaJudgementWindows(8);

const rice = (id: string, column: number, startTime: number): ManiaNote => ({
  id,
  column,
  startTime,
});
const hold = (id: string, column: number, startTime: number, endTime: number): ManiaNote => ({
  id,
  column,
  startTime,
  endTime,
});

const engine = (notes: ManiaNote[], startTime = -Infinity) =>
  createPlaytestEngine({ notes, keyCount: 4, windows, startTime });

const judgements = (events: PlaytestEvent[]) =>
  events.flatMap((e) =>
    e.kind === "judgement" ? [`${e.result.noteId}:${e.result.part}:${e.result.judgement}`] : [],
  );
const breaks = (events: PlaytestEvent[]) =>
  events.filter((e) => e.kind === "comboBreak").map((e) => e.noteId);

describe("rice notes", () => {
  it("judges a press by its distance from the note and hides the note", () => {
    const e = engine([rice("a", 0, 1000)]);
    expect(judgements(e.press(0, 1010))).toEqual(["a:rice:max"]);
    expect(e.hidden.has("a")).toBe(true);
  });

  it("gives an early miss between the 50 and miss windows", () => {
    const e = engine([rice("a", 0, 1000)]);
    expect(judgements(e.press(0, 1000 - 140))).toEqual(["a:rice:miss"]);
  });

  it("ignores a press earlier than the miss window", () => {
    const e = engine([rice("a", 0, 1000)]);
    expect(e.press(0, 1000 - 170)).toEqual([]);
  });

  it("misses a note once it is later than the 50 window, not the miss window", () => {
    const e = engine([rice("a", 0, 1000)]);
    expect(e.update(1000 + 127)).toEqual([]);
    expect(judgements(e.update(1000 + 128))).toEqual(["a:rice:miss"]);
  });

  it("only listens to its own column", () => {
    const e = engine([rice("a", 0, 1000)]);
    expect(e.press(1, 1000)).toEqual([]);
  });
});

describe("note lock", () => {
  it("gives a late press to the earlier note, not the nearer later one", () => {
    const e = engine([rice("a", 0, 1000), rice("b", 0, 1100)]);
    expect(judgements(e.press(0, 1090))).toEqual(["a:rice:100"]);
    expect(judgements(e.press(0, 1105))).toEqual(["b:rice:max"]);
  });

  it("stops a note being hit once the next one has started, and misses it", () => {
    const e = engine([rice("a", 0, 1000), rice("b", 0, 1100)]);
    expect(judgements(e.press(0, 1100))).toEqual(["b:rice:max", "a:rice:miss"]);
  });
});

describe("long notes", () => {
  it("judges the head on press and the tail on release", () => {
    const e = engine([hold("h", 0, 1000, 2000)]);
    expect(judgements(e.press(0, 1005))).toEqual(["h:ln-head:max"]);
    expect(e.holding.has("h")).toBe(true);
    expect(judgements(e.release(0, 2050))).toEqual(["h:ln-tail:300"]);
    expect(e.holding.has("h")).toBe(false);
    expect(e.hidden.has("h")).toBe(true);
  });

  it("gives releases 1.5x the windows", () => {
    const e = engine([hold("h", 0, 1000, 2000)]);
    e.press(0, 1000);
    // 60 ms late is a 200 on a press but a 300 on a release at OD 8.
    expect(judgements(e.release(0, 2060))).toEqual(["h:ln-tail:300"]);
  });

  it("breaks combo when let go early and misses the tail later", () => {
    const e = engine([hold("h", 0, 1000, 2000)]);
    e.press(0, 1000);
    const early = e.release(0, 1500);
    expect(judgements(early)).toEqual([]);
    expect(breaks(early)).toEqual(["h"]);
    expect(e.dropped.has("h")).toBe(true);
    expect(judgements(e.update(2000 + 192))).toEqual(["h:ln-tail:miss"]);
  });

  it("caps the tail at 50 when a broken hold is grabbed again", () => {
    const e = engine([hold("h", 0, 1000, 2000)]);
    e.press(0, 1000);
    e.release(0, 1400);
    e.press(0, 1500);
    expect(e.holding.has("h")).toBe(false);
    expect(judgements(e.release(0, 2000))).toEqual(["h:ln-tail:50"]);
  });

  it("caps the tail at 50 when the head was missed", () => {
    const e = engine([hold("h", 0, 1000, 2000)]);
    expect(judgements(e.update(1200))).toEqual(["h:ln-head:miss"]);
    e.press(0, 1300);
    expect(judgements(e.release(0, 2000))).toEqual(["h:ln-tail:50"]);
  });

  it("misses a tail held too long past its end", () => {
    const e = engine([hold("h", 0, 1000, 2000)]);
    e.press(0, 1000);
    expect(e.update(2000 + 191)).toEqual([]);
    const late = e.update(2000 + 192);
    expect(judgements(late)).toEqual(["h:ln-tail:miss"]);
    expect(breaks(late)).toEqual(["h"]);
  });
});

describe("runs started mid-map", () => {
  it("settles notes before the start without judging or drawing them", () => {
    const e = engine([rice("a", 0, 500), rice("b", 0, 1500)], 1000);
    expect(e.hidden.has("a")).toBe(true);
    expect(e.update(5000).map((x) => (x.kind === "judgement" ? x.result.noteId : ""))).toEqual(["b"]);
  });
});

describe("autoplay presses", () => {
  it("judges the targeted note directly, still missing what it skips", () => {
    const e = engine([rice("a", 0, 1000), rice("b", 0, 1000 + 20)]);
    expect(judgements(e.press(0, 1020, "b"))).toEqual(["b:rice:max", "a:rice:miss"]);
  });
});
