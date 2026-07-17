import { describe, it, expect } from "vitest";
import { makeDifficulty, makeRedPoint, type ManiaNote } from "../types";
import {
  nearestSnap,
  isUnsnapped,
  resnapNotes,
  countUnsnapped,
  runAiMod,
} from "./aimod";

function note(startTime: number, column = 0, endTime?: number): ManiaNote {
  return { id: `n_${startTime}_${column}`, column, startTime, endTime };
}

describe("nearestSnap / isUnsnapped", () => {
  const points = [makeRedPoint(0, 120)]; // 1/4 = 125ms

  it("treats on-grid times as snapped", () => {
    expect(isUnsnapped(0, points)).toBe(false);
    expect(isUnsnapped(500, points)).toBe(false); // 1/1
    expect(isUnsnapped(125, points)).toBe(false); // 1/4
    expect(isUnsnapped(250, points)).toBe(false); // 1/2
  });

  it("flags a note drifted off the grid", () => {
    expect(isUnsnapped(127, points)).toBe(true);
    expect(nearestSnap(127, points).snapped).toBe(125);
  });

  it("recognises 1/3 (triplet) snaps", () => {
    // beat = 500ms, 1/3 ≈ 166.67 → rounds to 167, 1/6 → 83
    expect(isUnsnapped(167, points)).toBe(false);
    expect(isUnsnapped(83, points)).toBe(false);
  });

  it("flags a 1/5-only position osu! can't represent", () => {
    // beat 500ms, 3/5 = 300ms lands on no osu divisor grid → unsnapped.
    expect(isUnsnapped(300, points)).toBe(true);
  });

  it("respects the active red point for BPM changes", () => {
    const pts = [makeRedPoint(0, 120), makeRedPoint(1000, 200)]; // 2nd: beat 300
    expect(isUnsnapped(1150, pts)).toBe(false); // 1000 + 150 = 1/2 of 300
    expect(isUnsnapped(1160, pts)).toBe(true);
  });
});

describe("resnapNotes", () => {
  const points = [makeRedPoint(0, 120)];

  it("moves off-grid notes to the nearest snap and counts them", () => {
    const { notes, moved } = resnapNotes([note(127), note(250)], points);
    expect(moved).toBe(1);
    expect(notes[0].startTime).toBe(125);
    expect(notes[1].startTime).toBe(250);
  });

  it("resnaps hold ends while keeping them past the head", () => {
    const { notes } = resnapNotes([note(0, 0, 252)], points);
    expect(notes[0].endTime).toBe(250);
  });

  it("respects a max shift so intentional off-grid notes survive", () => {
    const { notes, moved } = resnapNotes([note(140)], points, 3);
    // nearest snap is 125 (15ms away) > 3ms tolerance → left alone
    expect(moved).toBe(0);
    expect(notes[0].startTime).toBe(140);
  });

  it("clears the drift that makes .sm imports read as unsnapped", () => {
    // Timing point rounded to 0, notes carrying a -0.3ms offset then rounded.
    const drifted = [note(124), note(249), note(374)];
    expect(countUnsnapped(drifted, points)).toBe(3);
    const { notes } = resnapNotes(drifted, points);
    expect(countUnsnapped(notes, points)).toBe(0);
  });
});

describe("runAiMod", () => {
  function baseDiff() {
    const d = makeDifficulty("Normal", 4);
    d.notes = [note(0), note(125, 1), note(250, 2), note(30_500, 3)];
    d.backgroundFilename = "bg.jpg";
    d.previewTime = 1000;
    return d;
  }
  const meta = { title: "T", artist: "A", creator: "C", tags: "x" };
  const files = { "a.mp3": { name: "a.mp3", url: "", blob: new Blob() } };
  const bg = { "bg.jpg": { name: "bg.jpg", url: "", blob: new Blob() } };

  it("passes a clean map with only minor warnings", () => {
    const report = runAiMod({
      meta,
      difficulties: [baseDiff()],
      audioFiles: files,
      bgFiles: bg,
    });
    expect(report.errors).toBe(0);
  });

  it("reports unsnapped objects in the Compose category", () => {
    const d = baseDiff();
    d.notes = [note(0), note(127, 1)];
    const report = runAiMod({
      meta,
      difficulties: [d],
      audioFiles: files,
      bgFiles: bg,
    });
    const compose = report.issues.filter((i) => i.category === "Compose");
    expect(compose.some((i) => /snapped/i.test(i.message))).toBe(true);
  });

  it("flags missing metadata as errors", () => {
    const report = runAiMod({
      meta: { title: "", artist: "", creator: "" },
      difficulties: [baseDiff()],
      audioFiles: files,
      bgFiles: bg,
    });
    expect(report.errors).toBeGreaterThanOrEqual(3);
    expect(report.issues.filter((i) => i.category === "Meta").length).toBeGreaterThanOrEqual(3);
  });

  it("flags a too-short drain time", () => {
    const d = baseDiff();
    d.notes = [note(0), note(125, 1), note(250, 2)];
    const report = runAiMod({
      meta,
      difficulties: [d],
      audioFiles: files,
      bgFiles: bg,
    });
    expect(report.issues.some((i) => /Drain time/.test(i.message))).toBe(true);
  });
});
