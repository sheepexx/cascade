import { describe, expect, it, vi, afterEach } from "vitest";
import { detectOnsetsFromChannels } from "./bpmDetect";
import { suggestGhostNotes } from "./ghostNotes";
import { jumpSnapshotHistory, describeSnapshotChange } from "./editorHistory";
import { batchApplyDifficulties } from "./batchApply";
import { analyzePatterns, patternQualityScore } from "./patternQuality";
import { compareToCorpus, patternCorpus } from "./patternCorpus";
import { calibrationResult, calibrationTap } from "./audioCalibration";
import { encodeNativePcm } from "./nativeAudio";
import { makeDifficulty, makeGreenPoint, makeRedPoint, DEFAULT_SONG_META, type ManiaNote } from "../types";

const note = (startTime: number, column = 0, endTime?: number): ManiaNote => ({ id: `${startTime}_${column}`, startTime, column, endTime });
const pulses = (sampleRate: number, times: number[]) => {
  const channel = new Float32Array(sampleRate * 3);
  for (const time of times) for (let i = 0; i < sampleRate * 0.01; i++) channel[Math.round(time * sampleRate / 1000) + i] = Math.exp(-i / (sampleRate * 0.002)) * Math.cos(i * 0.8);
  return channel;
};
afterEach(() => vi.unstubAllGlobals());

describe("onset suggestions", () => {
  it.each([22050, 44100, 48000])("locates isolated attacks at %i Hz", rate => {
    const times = [0, 503, 999, 1632, 2701];
    const found = detectOnsetsFromChannels([pulses(rate, times)], rate);
    expect(found).toHaveLength(times.length);
    found.forEach((onset, i) => { expect(Math.abs(onset.timeMs - times[i])).toBeLessThanOrEqual(6); expect(onset.strength).toBeGreaterThan(0.4); });
  });
  it("does not cancel anti-phase stereo", () => {
    const left = pulses(48000, [500, 1000]);
    expect(detectOnsetsFromChannels([left, left.map(n => -n)], 48000)).toHaveLength(2);
  });
  it("ignores silence and invalid sample rates", () => {
    expect(detectOnsetsFromChannels([new Float32Array(50000)], 48000)).toEqual([]);
    expect(detectOnsetsFromChannels([], 48000)).toEqual([]);
    expect(detectOnsetsFromChannels([pulses(48000, [500])], NaN)).toEqual([]);
  });
  it("snaps source time to rate-adjusted map time, deduplicates rows and avoids holds", () => {
    const found = suggestGhostNotes([500, 504, 1000, 1400, 1900].map(timeMs => ({ timeMs, strength: 1 })), {
      notes: [note(500, 2), note(0, 0, 900)], timingPoints: [makeRedPoint(0, 120)], snapDivisor: 4,
      timeScale: 2, keyCount: 4, threshold: 0.5, start: 100, end: 800,
    });
    expect(found.map(n => n.startTime)).toEqual([250, 750]);
    expect(found.every(n => n.column !== 0)).toBe(true);
  });
  it("returns no ghosts where every lane is held", () => {
    expect(suggestGhostNotes([{ timeMs: 500, strength: 1 }], { notes: [0, 1, 2, 3].map(c => note(0, c, 1000)), timingPoints: [makeRedPoint(0)], snapDivisor: 4, timeScale: 1, keyCount: 4, threshold: 0, start: 0, end: 1000 })).toEqual([]);
  });
  it("keeps proposed lanes stable after accepting earlier ghosts", () => {
    const onsets = [500, 1000, 1500].map(timeMs => ({ timeMs, strength: 1 }));
    const options = { notes: [] as ManiaNote[], timingPoints: [makeRedPoint(0)], snapDivisor: 4, timeScale: 1, keyCount: 4, threshold: 0, start: 0, end: 2000 };
    const before = suggestGhostNotes(onsets, options);
    const after = suggestGhostNotes(onsets, { ...options, notes: [before[0]] });
    expect(after.map(n => n.column)).toEqual(before.slice(1).map(n => n.column));
  });
});

describe("history navigation", () => {
  it("jumps backwards then forwards without reversing redo order", () => {
    const first = jumpSnapshotHistory(["a", "b"], "c", ["e", "d"], 1)!;
    expect(first).toEqual({ past: ["a"], present: "b", future: ["e", "d", "c"] });
    expect(jumpSnapshotHistory(first.past, first.present, first.future, 4)).toEqual({ past: ["a", "b", "c", "d"], present: "e", future: [] });
  });
  it.each([-1, 3, 0.5, NaN])("rejects invalid position %s", index => expect(jumpSnapshotHistory([1], 2, [], index)).toBeNull());
  it("describes a batch change without naming it a note edit", () => {
    const d = makeDifficulty();
    const before = { meta: DEFAULT_SONG_META, timingPoints: [], difficulties: [d] };
    expect(describeSnapshotChange(before, { ...before, difficulties: [{ ...d, timingPoints: [makeRedPoint(200)] }] })).toContain("Edit timing");
  });
});

describe("batch apply", () => {
  it("converts timing and preview through source and target rates while preserving notes, SV and identity", () => {
    const source = { ...makeDifficulty("source"), audioRate: 1.5, previewTime: 2000, timingPoints: [makeRedPoint(300, 180), makeGreenPoint(500, 2)] };
    const target = { ...makeDifficulty("target"), audioRate: 1, beatmapId: 123, notes: [note(500)], timingPoints: [makeRedPoint(0), makeGreenPoint(400, 3)] };
    const untouched = makeDifficulty("untouched");
    const out = batchApplyDifficulties([source, target, untouched], { sourceId: source.id, targetIds: [target.id], options: { timing: "red", preview: true, difficultySettings: false } });
    expect(out[0]).toBe(source); expect(out[2]).toBe(untouched);
    expect(out[1].notes).toBe(target.notes); expect(out[1].beatmapId).toBe(123);
    expect(out[1].previewTime).toBe(3000);
    expect(out[1].timingPoints.find(p => p.uninherited)).toMatchObject({ time: 450, bpm: 120 });
    expect(out[1].timingPoints.find(p => !p.uninherited)).toBe(target.timingPoints[1]);
    expect(out[1].timingPoints.find(p => p.uninherited)?.id).not.toBe(source.timingPoints[0].id);
  });
  it("can replace all timing but keeps unset preview unset", () => {
    const source = { ...makeDifficulty(), timingPoints: [makeRedPoint(0), makeGreenPoint(500, 2)] };
    const target = { ...makeDifficulty(), audioRate: 2 };
    const out = batchApplyDifficulties([source, target], { sourceId: source.id, targetIds: [target.id], options: { timing: "all", preview: true, difficultySettings: true } });
    expect(out[1].timingPoints.find(p => !p.uninherited)).toMatchObject({ time: 250, sv: 2 }); expect(out[1].previewTime).toBe(-1);
  });
});

describe("pattern review", () => {
  it("flags an isolated speed spike but accepts a uniform jack stream", () => {
    const d = makeDifficulty();
    expect(analyzePatterns({ ...d, notes: [0, 250, 500, 750, 800, 1050, 1300, 1550].map(t => note(t)) }).findings.some(f => f.rule === "jack-spike")).toBe(true);
    expect(analyzePatterns({ ...d, notes: Array.from({ length: 40 }, (_, i) => note(i * 100)) }).findings.some(f => f.rule === "jack-spike")).toBe(false);
  });
  it("detects sustained imbalance and anchors without flooding each note", () => {
    const d = { ...makeDifficulty(), notes: Array.from({ length: 100 }, (_, i) => note(i * 40, i % 5 ? 0 : 1)) };
    const { findings } = analyzePatterns(d);
    expect(findings.map(f => f.rule)).toContain("hand-imbalance"); expect(findings.map(f => f.rule)).toContain("anchor-overuse");
    expect(findings.find(f => f.rule === "hand-imbalance")!.details.length).toBeLessThan(4);
  });
  it("excludes a 7K centre lane from hand imbalance", () => {
    const d = { ...makeDifficulty("7K", 7), notes: Array.from({ length: 80 }, (_, i) => note(i * 25, i % 4 < 2 ? 3 : i % 4 === 2 ? 0 : 6)) };
    expect(analyzePatterns(d).findings.some(f => f.rule === "hand-imbalance")).toBe(false);
  });
  it("flags tight LN release gaps but avoids duplicate overlap findings", () => {
    const d = makeDifficulty();
    expect(analyzePatterns({ ...d, notes: [note(0, 0, 500), note(540, 0)] }).findings.map(f => f.rule)).toEqual(["ln-gap"]);
    expect(analyzePatterns({ ...d, notes: [note(0, 0, 500), note(490, 0)] }).findings.map(f => f.rule)).not.toContain("ln-gap");
  });
  it("does not give an empty map a perfect quality score", () => expect(patternQualityScore(0, [])).toBeNull());
});

describe("ranked corpus comparison", () => {
  const spread = (length: number, columns: (i: number) => number) => Array.from({ length }, (_, i) => note(i * 125, columns(i)));
  it("ships buckets covering the common key modes", () => {
    expect(patternCorpus.source.difficulties).toBeGreaterThan(100);
    expect(patternCorpus.source.mappers).toBeGreaterThan(20);
    for (const keyCount of [4, 7]) expect(patternCorpus.buckets.some(b => b.keyCount === keyCount)).toBe(true);
  });
  it("has no bucket for an unrepresented key mode or a map too short to window", () => {
    const wide = { ...makeDifficulty("18K", 18), notes: spread(120, i => i % 18) };
    expect(compareToCorpus(18, analyzePatterns(wide).windows).bucket).toBeNull();
    const short = { ...makeDifficulty(), notes: spread(6, i => i % 4) };
    expect(compareToCorpus(4, analyzePatterns(short).windows).bucket).toBeNull();
  });
  it("flags a lane anchored far past the ranked range", () => {
    const anchored = { ...makeDifficulty(), notes: spread(120, i => (i % 10 < 7 ? 0 : 1 + (i % 3))) };
    const { bucket, outliers } = compareToCorpus(4, analyzePatterns(anchored).windows);
    expect(bucket).not.toBeNull();
    expect(outliers.map(o => o.key)).toContain("anchor");
    expect(outliers.find(o => o.key === "anchor")!.percentile).toBeGreaterThanOrEqual(0.9);
  });
  it("leaves an even stream inside the ranked range", () => {
    const even = { ...makeDifficulty(), notes: spread(120, i => [0, 1, 2, 3][i % 4]) };
    const { bucket, outliers } = compareToCorpus(4, analyzePatterns(even).windows);
    expect(bucket).not.toBeNull();
    expect(outliers).toEqual([]);
  });
});

describe("audio calibration", () => {
  it("ignores warm-up and distant taps", () => {
    expect(calibrationTap(2000)).toBeNull(); expect(calibrationTap(3250)).toBeNull();
    expect(calibrationTap(3035)).toEqual({ beat: 4, errorMs: 35 });
  });
  it("uses the correct negative compensation for late taps, excluding outliers", () => {
    const result = calibrationResult([...Array.from({ length: 14 }, (_, i) => 30 + i % 3), -180, 180])!;
    expect(result.offsetMs).toBe(-31); expect(result.discarded).toBe(2); expect(result.reliable).toBe(true);
  });
  it("refuses too few or inconsistent taps", () => {
    expect(calibrationResult([1, 2, 3])).toBeNull();
    expect(calibrationResult(Array.from({ length: 16 }, (_, i) => i % 2 ? 90 : -90))?.reliable).toBe(false);
  });
  it("encodes mono PCM as stereo with an exact binary header", () => {
    const pcm = encodeNativePcm({ length: 2, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array([0.5, -0.5]) } as unknown as AudioBuffer, 42, 0.25);
    expect(new DataView(pcm.buffer).getUint32(0, true)).toBe(42);
    expect([...new Float32Array(pcm.buffer, 16)]).toEqual([0.5, 0.5, -0.5, -0.5]);
  });
});
