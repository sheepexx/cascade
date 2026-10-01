import { describe, expect, it } from "vitest";
import { analyzePatterns, readinessScore } from "./patternQuality";
import { compareToCorpus, patternCorpus } from "./patternCorpus";
import { makeDifficulty, makeRedPoint, type ManiaNote } from "../types";

const note = (startTime: number, column = 0, endTime?: number): ManiaNote => ({ id: `${startTime}_${column}`, startTime, column, endTime });

describe("repetitive pattern review", () => {
  const timingPoints = [makeRedPoint(0, 150)];
  const climb = (count: number) => {
    const columns = [0];
    for (let i = 1; i < count; i++) columns.push((columns[i - 1] + (i % 3 === 0 ? 2 : 1)) % 7);
    return columns;
  };
  it("flags stairs that keep climbing even when they skip lanes", () => {
    const notes = climb(1500).map((c, i) => note(i * 100, c));
    const finding = analyzePatterns({ ...makeDifficulty("7K", 7), timingPoints, notes }).findings.find(f => f.rule === "repetitive-pattern")!;
    expect(finding.coverage).toBeGreaterThan(0.9);
    expect(finding.details[0].label).toContain("rolling");
    expect(readinessScore(notes.length, [finding])).toBeLessThanOrEqual(40);
  });
  it("flags an exact pattern repeated for minutes", () => {
    const notes = Array.from({ length: 1200 }, (_, i) => note(i * 100, [0, 2, 1, 3][i % 4]));
    const finding = analyzePatterns({ ...makeDifficulty(), timingPoints, notes }).findings.find(f => f.rule === "repetitive-pattern")!;
    expect(finding.details[0].label).toContain("4-step pattern");
  });
  it("lets a short run of stairs pass", () => {
    let seed = 3;
    const lanes = [...climb(96), ...Array.from({ length: 400 }, () => (seed = (seed * 16807) % 2147483647) % 7)];
    const notes = lanes.map((c, i) => note(i * 100, c));
    expect(analyzePatterns({ ...makeDifficulty("7K", 7), timingPoints, notes }).findings.map(f => f.rule)).not.toContain("repetitive-pattern");
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
  it("groups nearby jack spikes into one passage and keeps distant ones apart", () => {
    const stream = (from: number) => [0, 250, 500, 550, 800, 1050, 1300, 1350, 1600, 1850].map(t => note(from + t));
    const { findings } = analyzePatterns({ ...makeDifficulty(), notes: [...stream(0), ...stream(20_000)] });
    const jack = findings.find(f => f.rule === "jack-spike")!;
    expect(jack.details).toHaveLength(2);
    expect(jack.count).toBeGreaterThan(jack.details.length);
    expect(jack.details[0].endTime).toBeGreaterThan(jack.details[0].time);
    expect(jack.details[1].time).toBeGreaterThanOrEqual(20_000);
  });
  it("does not give an empty map a perfect quality score", () => expect(readinessScore(0, [])).toBeNull());
  it("leaves a clean map at 100 and drops it for criteria breaches", () => {
    expect(readinessScore(500, [])).toBe(100);
    expect(readinessScore(500, [], [{ severity: "warning", occurrences: 1 }])).toBe(93);
    expect(readinessScore(500, [], [{ severity: "error", occurrences: 1 }])).toBe(86);
  });
  it("weights a criteria breach by how widespread it is, up to a cap", () => {
    const once = readinessScore(500, [], [{ severity: "warning", occurrences: 1 }])!;
    const often = readinessScore(500, [], [{ severity: "warning", occurrences: 20 }])!;
    expect(often).toBeLessThan(once);
    expect(readinessScore(500, [], [{ severity: "warning", occurrences: 5000 }])).toBe(86);
  });
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
  it("merges overlapping flagged windows into ordered, disjoint passages", () => {
    const anchored = { ...makeDifficulty(), notes: spread(120, i => (i % 10 < 7 ? 0 : 1 + (i % 3))) };
    const outlier = compareToCorpus(4, analyzePatterns(anchored).windows).outliers.find(o => o.key === "anchor")!;
    expect(outlier.spans.reduce((n, s) => n + s.windows, 0)).toBeGreaterThan(outlier.spans.length);
    for (const span of outlier.spans) {
      expect(span.end).toBeGreaterThan(span.start);
      expect(span.peak).toBeGreaterThan(outlier.threshold);
    }
    for (let i = 1; i < outlier.spans.length; i++) expect(outlier.spans[i].start).toBeGreaterThan(outlier.spans[i - 1].end);
  });
  it("leaves an even stream inside the ranked range", () => {
    const even = { ...makeDifficulty(), notes: spread(120, i => [0, 1, 2, 3][i % 4]) };
    const { bucket, outliers } = compareToCorpus(4, analyzePatterns(even).windows);
    expect(bucket).not.toBeNull();
    expect(outliers).toEqual([]);
  });
});
