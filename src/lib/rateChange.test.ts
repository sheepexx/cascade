import { describe, it, expect } from "vitest";
import {
  makeDifficulty,
  makeGreenPoint,
  makeRedPoint,
  type Difficulty,
  type ManiaNote,
} from "../types";
import {
  applyRateToNotes,
  applyRateToTimingPoints,
  createRateDifficulty,
  describeRateChange,
  dominantBpm,
  formatRate,
  isRateDifficulty,
  parseBpmInput,
  parseRateInput,
  quantizeRate,
  rateDifficultyName,
  rateForBpm,
  scaledBpmLabel,
  scaledDuration,
  toAudioTime,
  toMapTime,
  uniqueDifficultyName,
} from "./rateChange";

function note(id: string, column: number, startTime: number, endTime?: number): ManiaNote {
  return endTime === undefined
    ? { id, column, startTime }
    : { id, column, startTime, endTime };
}

function baseDifficulty(): Difficulty {
  const d = makeDifficulty("Insane", 4);
  d.hpDrainRate = 8.2;
  d.overallDifficulty = 8.7;
  d.previewTime = 30000;
  d.bookmarks = [1200, 2400];
  d.timingPoints = [makeRedPoint(0, 100)];
  d.notes = [note("a", 0, 1200), note("b", 1, 2400, 3600)];
  return d;
}

describe("time transformation", () => {
  it("compresses times and raises BPM at 1.20x", () => {
    const notes = applyRateToNotes([note("a", 0, 1200)], 1.2);
    expect(notes[0].startTime).toBe(1000);

    const points = applyRateToTimingPoints([makeRedPoint(0, 100)], 1.2);
    expect(points[0].bpm).toBeCloseTo(120, 10);
  });

  it("stretches times and lowers BPM at 0.75x", () => {
    const notes = applyRateToNotes([note("a", 0, 1500)], 0.75);
    expect(notes[0].startTime).toBe(2000);

    const points = applyRateToTimingPoints([makeRedPoint(0, 120)], 0.75);
    expect(points[0].bpm).toBeCloseTo(90, 10);
  });

  it("transforms both ends of a hold note", () => {
    const [hold] = applyRateToNotes([note("h", 2, 1200, 2400)], 1.2);
    expect(hold.startTime).toBe(1000);
    expect(hold.endTime).toBe(2000);
  });

  it("leaves rice notes without an endTime", () => {
    const [rice] = applyRateToNotes([note("r", 0, 1200)], 1.2);
    expect(rice.endTime).toBeUndefined();
  });

  it("transforms every timing point in a multi-section map", () => {
    const points = applyRateToTimingPoints(
      [
        makeRedPoint(0, 100),
        makeRedPoint(12000, 150),
        makeGreenPoint(24000, 1.4),
        makeRedPoint(36000, 200),
      ],
      1.2,
    );

    expect(points.map((p) => p.time)).toEqual([0, 10000, 20000, 30000]);
    expect(points[0].bpm).toBeCloseTo(120, 10);
    expect(points[1].bpm).toBeCloseTo(180, 10);
    expect(points[3].bpm).toBeCloseTo(240, 10);
    // SV is a dimensionless multiplier and must survive untouched.
    expect(points[2].sv).toBeCloseTo(1.4, 10);
    expect(points[2].uninherited).toBe(false);
  });

  it("preserves timing point metadata other than time and bpm", () => {
    const source = makeRedPoint(4000, 180, {
      meter: 7,
      volume: 65,
      kiai: true,
      sampleSet: 2,
      sampleIndex: 3,
      omitFirstBarline: true,
    });
    const [scaled] = applyRateToTimingPoints([source], 1.5);

    expect(scaled.meter).toBe(7);
    expect(scaled.volume).toBe(65);
    expect(scaled.kiai).toBe(true);
    expect(scaled.sampleSet).toBe(2);
    expect(scaled.sampleIndex).toBe(3);
    expect(scaled.omitFirstBarline).toBe(true);
  });
});

describe("createRateDifficulty", () => {
  it("copies gameplay difficulty values verbatim", () => {
    const source = baseDifficulty();
    const rated = createRateDifficulty(source, { rate: 1.2 });

    expect(rated.overallDifficulty).toBe(source.overallDifficulty);
    expect(rated.hpDrainRate).toBe(source.hpDrainRate);
    expect(rated.keyCount).toBe(source.keyCount);
  });

  it("never mutates the original difficulty", () => {
    const source = baseDifficulty();
    const snapshot = JSON.parse(JSON.stringify(source)) as Difficulty;

    const rated = createRateDifficulty(source, { rate: 1.2 });

    expect(source).toEqual(snapshot);
    expect(rated.id).not.toBe(source.id);
    expect(rated.notes).not.toBe(source.notes);
    expect(rated.timingPoints).not.toBe(source.timingPoints);
    expect(rated.bookmarks).not.toBe(source.bookmarks);
    // Cloned identities, so later edits to the copy cannot leak back.
    expect(rated.notes[0].id).not.toBe(source.notes[0].id);
    expect(rated.timingPoints[0].id).not.toBe(source.timingPoints[0].id);
  });

  it("scales notes, timing, preview time and bookmarks together", () => {
    const rated = createRateDifficulty(baseDifficulty(), { rate: 1.2 });

    expect(rated.notes[0].startTime).toBe(1000);
    expect(rated.notes[1].startTime).toBe(2000);
    expect(rated.notes[1].endTime).toBe(3000);
    expect(rated.timingPoints[0].bpm).toBeCloseTo(120, 10);
    expect(rated.previewTime).toBe(25000);
    expect(rated.bookmarks).toEqual([1000, 2000]);
  });

  it("leaves an unset preview time alone", () => {
    const source = baseDifficulty();
    source.previewTime = -1;
    expect(createRateDifficulty(source, { rate: 1.2 }).previewTime).toBe(-1);
  });

  it("records the rate the audio must be played at", () => {
    const rated = createRateDifficulty(baseDifficulty(), { rate: 1.2 });
    expect(rated.audioRate).toBe(1.2);
  });

  it("compounds the rate when rating an already-rated difficulty", () => {
    const once = createRateDifficulty(baseDifficulty(), { rate: 1.2 });
    const twice = createRateDifficulty(once, { rate: 1.5 });

    // Times stay relative to the one shared audio file.
    expect(twice.audioRate).toBeCloseTo(1.8, 10);
    expect(twice.notes[0].startTime).toBe(667);
  });

  it("includes the resulting BPM in the name by default", () => {
    // Source is 100 BPM, so 1.2x lands on 120.
    expect(createRateDifficulty(baseDifficulty(), { rate: 1.2 }).name).toBe(
      "Insane x1.2 (120 BPM)",
    );
  });

  it("names the copy after the source and rate", () => {
    const rated = createRateDifficulty(baseDifficulty(), {
      rate: 1.2,
      showBpm: false,
    });
    expect(rated.name).toBe("Insane x1.2");
  });

  it("uses only the rate as the name when asked", () => {
    expect(
      createRateDifficulty(baseDifficulty(), {
        rate: 1.2,
        onlyRateAsName: true,
        showBpm: false,
      }).name,
    ).toBe("x1.2");
    expect(
      createRateDifficulty(baseDifficulty(), { rate: 1.2, onlyRateAsName: true }).name,
    ).toBe("x1.2 (120 BPM)");
  });

  it("numbers duplicate names automatically", () => {
    const source = baseDifficulty();
    const taken = ["Insane", "Insane x1.2", "Insane x1.2 (2)"];

    expect(
      createRateDifficulty(source, {
        rate: 1.2,
        showBpm: false,
        existingNames: taken,
      }).name,
    ).toBe("Insane x1.2 (3)");
    expect(
      createRateDifficulty(source, {
        rate: 1.2,
        onlyRateAsName: true,
        showBpm: false,
        existingNames: ["x1.2"],
      }).name,
    ).toBe("x1.2 (2)");
  });

  it("records the pitch choice only when preserving", () => {
    expect(createRateDifficulty(baseDifficulty(), { rate: 1.2 }).preservePitch).toBeUndefined();
    expect(
      createRateDifficulty(baseDifficulty(), { rate: 1.2, preservePitch: true })
        .preservePitch,
    ).toBe(true);
  });
});

describe("BPM entry", () => {
  it("finds the rate that reaches a target BPM", () => {
    expect(rateForBpm(120, 144)).toBeCloseTo(1.2, 6);
    expect(rateForBpm(120, 90)).toBeCloseTo(0.75, 6);
    expect(rateForBpm(120, 120)).toBe(1);
  });

  it("rejects targets outside the rate range", () => {
    expect(rateForBpm(120, 30)).toBeNull(); // 0.25x
    expect(rateForBpm(120, 400)).toBeNull(); // 3.33x
    expect(rateForBpm(0, 144)).toBeNull();
    expect(rateForBpm(120, 0)).toBeNull();
  });

  it("keeps enough precision to hit an awkward BPM exactly", () => {
    const rate = rateForBpm(300.727, 190);
    expect(rate).not.toBeNull();
    expect(300.727 * (rate as number)).toBeCloseTo(190, 1);
  });

  it("parses plain and suffixed BPM input", () => {
    expect(parseBpmInput("144")).toBe(144);
    expect(parseBpmInput(" 144 bpm ")).toBe(144);
    expect(parseBpmInput("174.5")).toBe(174.5);
    expect(parseBpmInput("abc")).toBeNull();
    expect(parseBpmInput("-5")).toBeNull();
    expect(parseBpmInput("")).toBeNull();
  });
});

describe("dominantBpm", () => {
  it("returns the only BPM of a single-section map", () => {
    expect(dominantBpm([makeRedPoint(0, 175)], 200000)).toBe(175);
  });

  it("picks the BPM that governs the most time, not the first", () => {
    const points = [
      makeRedPoint(0, 90), // 0-10s   -> 10s
      makeRedPoint(10000, 180), // 10-120s -> 110s
      makeRedPoint(120000, 90), // 120-130s -> 10s (folds into 90's total)
    ];
    expect(dominantBpm(points, 130000)).toBe(180);
  });

  it("sums sections that share a BPM", () => {
    const points = [
      makeRedPoint(0, 150), // 60s
      makeRedPoint(60000, 200), // 20s
      makeRedPoint(80000, 150), // 20s -> 150 totals 80s
    ];
    expect(dominantBpm(points, 100000)).toBe(150);
  });

  it("copes with a missing duration", () => {
    expect(dominantBpm([makeRedPoint(0, 120), makeRedPoint(60000, 140)], null)).toBe(120);
  });
});

describe("scaledBpmLabel", () => {
  it("rounds a single BPM", () => {
    expect(scaledBpmLabel([makeRedPoint(0, 300.727)], 1.2)).toBe("361");
  });

  it("renders a range for multi-BPM maps", () => {
    expect(
      scaledBpmLabel([makeRedPoint(0, 100), makeRedPoint(1000, 200)], 1.2),
    ).toBe("120-240");
  });
});

describe("isRateDifficulty", () => {
  it("flags only difficulties written against a non-1 rate", () => {
    const source = baseDifficulty();
    expect(isRateDifficulty(source)).toBe(false);
    expect(isRateDifficulty({ audioRate: 1 })).toBe(false);
    expect(isRateDifficulty({ audioRate: undefined })).toBe(false);
    expect(isRateDifficulty(null)).toBe(false);
    expect(isRateDifficulty(createRateDifficulty(source, { rate: 1.2 }))).toBe(true);
    expect(isRateDifficulty(createRateDifficulty(source, { rate: 0.75 }))).toBe(true);
  });
});

describe("naming helpers", () => {
  it("drops trailing zeros in rate names", () => {
    expect(formatRate(1.2)).toBe("1.2");
    expect(formatRate(1.5)).toBe("1.5");
    expect(formatRate(1)).toBe("1");
    expect(formatRate(0.9)).toBe("0.9");
    expect(formatRate(1.25)).toBe("1.25");
  });

  it("builds names from a base and a rate", () => {
    expect(rateDifficultyName("Insane", 1.2)).toBe("Insane x1.2");
    expect(rateDifficultyName("Insane", 1.2, { onlyRateAsName: true })).toBe("x1.2");
    expect(rateDifficultyName("  ", 1.2)).toBe("x1.2");
  });

  it("appends a BPM label when one is supplied", () => {
    expect(rateDifficultyName("Insane", 1.2, { bpmLabel: "144" })).toBe(
      "Insane x1.2 (144 BPM)",
    );
    expect(
      rateDifficultyName("Insane", 1.2, { onlyRateAsName: true, bpmLabel: "144" }),
    ).toBe("x1.2 (144 BPM)");
    expect(rateDifficultyName("Insane", 1.2, { bpmLabel: "" })).toBe("Insane x1.2");
  });

  it("only numbers names that actually collide", () => {
    expect(uniqueDifficultyName("Insane x1.2", [])).toBe("Insane x1.2");
    expect(uniqueDifficultyName("Insane x1.2", ["Normal"])).toBe("Insane x1.2");
    expect(uniqueDifficultyName("Insane x1.2", ["Insane x1.2"])).toBe("Insane x1.2 (2)");
  });
});

describe("rate input handling", () => {
  it("snaps float noise onto the 0.05 grid", () => {
    expect(quantizeRate(1.0500000000000003)).toBe(1.05);
    expect(quantizeRate(1.2000000000000002)).toBe(1.2);
  });

  it("clamps out-of-range rates", () => {
    expect(quantizeRate(0.1)).toBe(0.5);
    expect(quantizeRate(9)).toBe(2);
  });

  it("accepts plain, suffixed and percentage input", () => {
    expect(parseRateInput("1.2")).toBe(1.2);
    expect(parseRateInput(" 1.2x ")).toBe(1.2);
    expect(parseRateInput("120%")).toBe(1.2);
  });

  it("rejects invalid or out-of-range input", () => {
    expect(parseRateInput("")).toBeNull();
    expect(parseRateInput("abc")).toBeNull();
    expect(parseRateInput("0.1")).toBeNull();
    expect(parseRateInput("3")).toBeNull();
  });
});

describe("audio/timeline synchronisation", () => {
  it("maps between map time and audio time losslessly", () => {
    expect(toAudioTime(1000, 1.2)).toBeCloseTo(1200, 10);
    expect(toMapTime(1200, 1.2)).toBeCloseTo(1000, 10);
    expect(toMapTime(toAudioTime(4321, 1.35), 1.35)).toBeCloseTo(4321, 10);
  });

  it("lands a scaled note on its own audio position", () => {
    // The note the editor draws at map time T must sound at the audio position
    // it was originally written at — this is what keeps notes, waveform and
    // playhead locked together at any rate.
    const rate = 1.2;
    const [scaled] = applyRateToNotes([note("a", 0, 1200)], rate);
    expect(toAudioTime(scaled.startTime, rate)).toBeCloseTo(1200, 10);
  });

  it("shortens the timeline in step with the audio", () => {
    expect(scaledDuration(210000, 1.2)).toBeCloseTo(175000, 10);
    expect(scaledDuration(210000, 0.75)).toBeCloseTo(280000, 10);
  });

  it("keeps the timeline fraction of a note invariant under rate", () => {
    // The bottom timeline positions notes as startTime / duration, and the
    // waveform by fraction of width, so both agree only if this holds.
    const durationMs = 210000;
    const [scaled] = applyRateToNotes([note("a", 0, 42000)], 1.2);
    expect(scaled.startTime / scaledDuration(durationMs, 1.2)).toBeCloseTo(
      42000 / durationMs,
      6,
    );
  });
});

describe("describeRateChange", () => {
  it("previews name, BPM and song length", () => {
    const preview = describeRateChange(baseDifficulty(), {
      rate: 1.2,
      durationMs: 210000,
    });

    expect(preview.name).toBe("Insane x1.2 (120 BPM)");
    expect(preview.bpmBefore).toBe("100");
    expect(preview.bpmAfter).toBe("120");
    expect(preview.lengthBefore).toBe("3:30");
    expect(preview.lengthAfter).toBe("2:55");
    expect(preview.baseBpm).toBe(100);
    expect(preview.targetBpm).toBeCloseTo(120, 6);
  });

  it("drops the BPM from the name when the option is off", () => {
    const preview = describeRateChange(baseDifficulty(), {
      rate: 1.2,
      showBpm: false,
      durationMs: 210000,
    });
    expect(preview.name).toBe("Insane x1.2");
  });

  it("shows a BPM range for multi-BPM maps", () => {
    const source = baseDifficulty();
    source.timingPoints = [makeRedPoint(0, 100), makeRedPoint(10000, 200)];

    const preview = describeRateChange(source, { rate: 1.2, durationMs: null });
    expect(preview.bpmBefore).toBe("100–200");
    expect(preview.bpmAfter).toBe("120–240");
    expect(preview.lengthBefore).toBeNull();
  });
});
