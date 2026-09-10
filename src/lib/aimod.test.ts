import { describe, it, expect } from "vitest";
import { makeDifficulty, makeRedPoint, type ManiaNote } from "../types";
import {
  nearestSnap,
  isUnsnapped,
  resnapNotes,
  countUnsnapped,
  runAiMod,
  formatAiModObjects,
  formatAiModTime,
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

  it("drops the readiness score for ranking criteria breaches alone", () => {
    const d = baseDiff();
    d.notes = Array.from({ length: 15 }, (_, i) => [note(i * 2000, 0), note(i * 2000, 1), note(i * 2000, 2)]).flat();
    d.notes.push(note(40_000, 3));
    const report = runAiMod({ meta, difficulties: [d], audioFiles: files, bgFiles: bg });
    expect(report.issues.filter((i) => i.category === "Patterns")).toHaveLength(0);
    expect(report.issues.filter((i) => i.category === "Criteria" || i.category === "Guidelines").length).toBeGreaterThan(0);
    expect(report.quality.difficulties[0].score).toBeLessThan(100);
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

  function report(diff: ReturnType<typeof baseDiff>, audioDurationMs?: number) {
    return runAiMod({
      meta,
      difficulties: [diff],
      audioFiles: files,
      bgFiles: bg,
      audioDurationMs,
    });
  }

  function find(
    r: ReturnType<typeof runAiMod>,
    pattern: RegExp,
  ) {
    return r.issues.find((i) => pattern.test(i.message));
  }

  it("flags objects in the same column closer than 30ms", () => {
    const d = baseDiff();
    d.notes = [note(0), note(22), note(30_500, 3)];
    const issue = find(report(d), /Concurrent hit objects/);
    expect(issue?.severity).toBe("error");
    expect(issue?.count).toBe(1);
    expect(issue?.details?.[0].label).toBe("Within 22 ms of one another.");
    expect(issue?.details?.[0].objects).toEqual([
      { time: 0, column: 0 },
      { time: 22, column: 0 },
    ]);
  });

  it("measures the gap from the end of a hold, not its head", () => {
    const d = baseDiff();
    d.notes = [note(0, 0, 22), note(500), note(30_500, 3)];
    const issue = find(report(d), /Concurrent hit objects/);
    expect(issue).toBeUndefined();
  });

  it("keeps overlapping objects in the same column an error", () => {
    const d = baseDiff();
    d.notes = [note(0, 0, 250), note(125), note(30_500, 3)];
    const issue = find(report(d), /Concurrent hit objects/);
    expect(issue?.severity).toBe("error");
    expect(issue?.details?.[0].label).toBe("Overlapping by 125 ms.");
  });

  it("leaves objects in different columns alone", () => {
    const d = baseDiff();
    d.notes = [note(0, 0), note(0, 1), note(10, 2), note(30_500, 3)];
    expect(find(report(d), /Concurrent hit objects/)).toBeUndefined();
  });

  it("flags long notes shorter than 30ms", () => {
    const d = baseDiff();
    d.notes = [note(0, 0, 22), note(30_500, 3)];
    const issue = find(report(d), /Too short long notes/);
    expect(issue?.severity).toBe("warning");
    expect(issue?.details?.[0].label).toBe("Long note held for only 22 ms.");
    expect(issue?.message).toContain("less than 30ms");
  });

  it("accepts a long note exactly 30ms long", () => {
    const d = baseDiff();
    d.notes = [note(0, 0, 30), note(30_500, 3)];
    expect(find(report(d), /Too short long notes/)).toBeUndefined();
  });

  it("errors on a long note that ends before it starts", () => {
    const d = baseDiff();
    d.notes = [note(500, 0, 400), note(30_500, 3)];
    const issue = find(report(d), /end before they start/);
    expect(issue?.severity).toBe("error");
    expect(issue?.details?.[0].label).toBe("Long note ends 100 ms before it starts.");
  });

  it("flags objects past the end of the audio", () => {
    const d = baseDiff();
    const issue = find(report(d, 30_000), /past the end of the audio/);
    expect(issue?.count).toBe(1);
    expect(issue?.details?.[0].label).toBe(
      "Ends 500 ms past the end of the audio.",
    );
  });

  it("measures the end of the audio in map time for rate difficulties", () => {
    const d = baseDiff();
    d.audioRate = 0.5;
    expect(find(report(d, 30_000), /past the end of the audio/)).toBeUndefined();
  });

  it("flags objects placed before the audio starts", () => {
    const d = baseDiff();
    d.notes = [note(-125, 0), ...d.notes];
    const issue = find(report(d), /before the start of the audio/);
    expect(issue?.severity).toBe("error");
    expect(issue?.details?.[0].label).toBe("Starts 125 ms before the audio.");
  });

  it("lists every unsnapped object with how far off it is", () => {
    const d = baseDiff();
    d.notes = [note(0), note(127, 1), note(30_500, 3)];
    const issue = find(report(d), /aren't snapped/);
    expect(issue?.count).toBe(1);
    expect(issue?.details?.[0]).toEqual({
      time: 127,
      objects: [{ time: 127, column: 1 }],
      label: "Unsnapped by 2 ms (nearest 1/4).",
    });
  });

  it("flags duplicate timing points and unusable BPM", () => {
    const d = baseDiff();
    d.timingPoints = [makeRedPoint(0, 120), makeRedPoint(0, 0)];
    const r = report(d);
    expect(find(r, /invalid BPM/)?.severity).toBe("error");
    expect(find(r, /Duplicate timing points/)?.severity).toBe("warning");
  });

  it("flags two difficulties sharing a name", () => {
    const a = baseDiff();
    const b = baseDiff();
    const r = runAiMod({
      meta,
      difficulties: [a, b],
      audioFiles: files,
      bgFiles: bg,
    });
    expect(r.issues.filter((i) => /share the name/.test(i.message)).length).toBe(1);
  });
});

describe("aimod formatting", () => {
  it("prints osu-style timestamps", () => {
    expect(formatAiModTime(92212)).toBe("01:32:212");
    expect(formatAiModTime(241987)).toBe("04:01:987");
    expect(formatAiModTime(-125)).toBe("-00:00:125");
  });

  it("prints object references with 1-based columns", () => {
    expect(
      formatAiModObjects([
        { time: 92212, column: 0 },
        { time: 92256, column: 3 },
      ]),
    ).toBe("(92212|1,92256|4)");
    expect(formatAiModObjects()).toBe("");
  });
});
