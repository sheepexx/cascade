import type { Difficulty, ManiaNote } from "../types";
import { activeTimingAt } from "./timing";
import { monotoneRuns, toRows } from "./patternRows";
import type { AiModDetail, AiModObject, AiModSeverity } from "./aimod";

export type PatternRule = "jack-spike" | "hand-imbalance" | "anchor-overuse" | "ln-gap" | "repetitive-pattern";
export type PatternFinding = { rule: PatternRule; message: string; details: AiModDetail[]; count: number; coverage?: number };
export type PatternFeatures = { nps: number; lnRatio: number; jackFraction: number; handShare: number; anchorFraction: number; lnGapFraction: number };

export const WINDOW_FEATURE_KEYS = ["nps", "jack", "hand", "anchor", "ln", "chord"] as const;
export type WindowFeatureKey = (typeof WINDOW_FEATURE_KEYS)[number];
export type WindowFeatures = Record<WindowFeatureKey, number>;
export type PatternWindow = WindowFeatures & { time: number; span: number; notes: number };

export const MIN_WINDOW_NOTES = 8;

const GROUP_GAP_MS = 2000;
export const MONOTONE_MIN_BEATS = 32;
export const MONOTONE_MIN_ROWS = 40;

type Spot = { time: number; column: number; value: number; context: number; objects: AiModObject[] };

function groupSpots(spots: Spot[], describe: (group: Spot[]) => string): AiModDetail[] {
  const sorted = spots.slice().sort((a, b) => a.time - b.time);
  const details: AiModDetail[] = [];
  let group: Spot[] = [];
  const flush = () => {
    if (!group.length) return;
    const first = group[0], last = group[group.length - 1];
    details.push({
      time: first.time,
      label: describe(group),
      ...(group.length > 1 ? { endTime: last.time } : { objects: first.objects }),
    });
    group = [];
  };
  for (const spot of sorted) {
    if (group.length && spot.time - group[group.length - 1].time > GROUP_GAP_MS) flush();
    group.push(spot);
  }
  flush();
  return details;
}

const median = (values: number[]) => { const v = values.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
const ref = (n: ManiaNote) => ({ time: n.startTime, column: n.column });

export function analyzePatterns(difficulty: Difficulty): { findings: PatternFinding[]; features: PatternFeatures; windows: PatternWindow[] } {
  const notes = difficulty.notes.filter(n => Number.isFinite(n.startTime) && n.column >= 0 && n.column < difficulty.keyCount).slice().sort((a, b) => a.startTime - b.startTime);
  const jacks: Spot[] = [], gaps: Spot[] = [];
  const hands: AiModDetail[] = [], anchors: AiModDetail[] = [];
  const lanes = Array.from({ length: difficulty.keyCount }, (_, c) => notes.filter(n => n.column === c));
  const jackNotes = new Set<ManiaNote>();
  let jackPairs = 0, longNotes = 0;
  for (const lane of lanes) {
    for (let i = 0; i < lane.length; i++) {
      const n = lane[i], prev = lane[i - 1];
      if (n.endTime !== undefined) longNotes++;
      if (!prev) continue;
      const beat = 60000 / activeTimingAt(n.startTime, difficulty.timingPoints).bpm;
      const gap = n.startTime - prev.startTime;
      if (gap > 0 && gap <= beat / 4 + 1) { jackPairs++; jackNotes.add(n); }
      if (gap >= 30 && gap <= Math.min(110, beat / 4 + 1) && prev.endTime === undefined) {
        const context: number[] = [];
        for (let j = Math.max(1, i - 3); j < Math.min(lane.length, i + 4); j++) {
          const delta = lane[j].startTime - lane[j - 1].startTime;
          if (j !== i && delta > 0 && delta < beat * 4) context.push(delta);
        }
        const baseline = median(context);
        if (context.length >= 3 && baseline >= gap * 2) jacks.push({ time: prev.startTime, column: n.column, value: gap, context: baseline, objects: [ref(prev), ref(n)] });
      }
      if (prev.endTime !== undefined) {
        const releaseGap = n.startTime - prev.endTime;
        if (releaseGap >= 30 && releaseGap < Math.min(90, beat / 8)) gaps.push({ time: prev.endTime, column: n.column, value: releaseGap, context: beat, objects: [ref(prev), ref(n)] });
      }
    }
  }

  const chorded = new Uint8Array(notes.length);
  for (let i = 0; i < notes.length;) {
    let j = i + 1;
    while (j < notes.length && notes[j].startTime - notes[i].startTime <= 10) j++;
    if (j - i >= 2) for (let k = i; k < j; k++) chorded[k] = 1;
    i = j;
  }

  const half = Math.floor(difficulty.keyCount / 2);
  const counts = new Array<number>(difficulty.keyCount).fill(0);
  const windows: PatternWindow[] = [];
  let left = 0, right = 0, from = 0, to = 0, windowCount = 0, anchorWindows = 0, maxShare = 0.5;
  let jackInWindow = 0, lnInWindow = 0, chordInWindow = 0;
  let lastHand = -Infinity, lastAnchor = -Infinity;
  const start = notes[0]?.startTime ?? 0, end = notes[notes.length - 1]?.startTime ?? start;
  const track = (index: number, delta: number) => {
    const n = notes[index], c = n.column;
    counts[c] += delta;
    if (c < half) left += delta; else if (c >= difficulty.keyCount - half) right += delta;
    if (jackNotes.has(n)) jackInWindow += delta;
    if (n.endTime !== undefined) lnInWindow += delta;
    if (chorded[index]) chordInWindow += delta;
  };
  for (let time = start; time <= end;) {
    const beat = 60000 / activeTimingAt(time, difficulty.timingPoints).bpm;
    const window = Math.max(1000, Math.min(8000, Number.isFinite(beat) ? beat * 4 : 2000));
    while (from < to && notes[from].startTime < time) track(from++, -1);
    while (to > from && notes[to - 1].startTime >= time + window) track(--to, -1);
    while (to < notes.length && notes[to].startTime < time + window) track(to++, 1);
    const total = to - from;
    if (total >= MIN_WINDOW_NOTES) {
      const sides = left + right;
      windows.push({
        time, span: window, notes: total,
        nps: (total * 1000) / window,
        jack: jackInWindow / total,
        hand: sides >= 8 ? Math.max(left, right) / sides : 0.5,
        anchor: Math.max(...counts) / total,
        ln: lnInWindow / total,
        chord: chordInWindow / total,
      });
    }
    if (total >= 24) {
      windowCount++;
      const share = left + right >= 20 ? Math.max(left, right) / (left + right) : 0.5;
      maxShare = Math.max(maxShare, share);
      if (half > 0 && share > 0.75 && time >= lastHand + window) {
        hands.push({ time, label: `${Math.round(share * 100)}% of ${left + right} side-lane attacks use the ${left > right ? "left" : "right"} hand across ${(window / 1000).toFixed(1)}s. Centre lanes are excluded; check whether the strain fits the music.` });
        lastHand = time;
      }
      const max = Math.max(...counts), column = counts.indexOf(max);
      if (difficulty.keyCount >= 4 && max >= 12 && max / total >= Math.max(0.35, 2 / difficulty.keyCount)) {
        anchorWindows++;
        if (time >= lastAnchor + window) {
          anchors.push({ time, label: `Lane ${column + 1} carries ${max}/${total} attacks across ${(window / 1000).toFixed(1)}s. Consider varying the anchor if this emphasis is unintentional.` });
          lastAnchor = time;
        }
      }
    }
    time += window / 2;
  }
  const jackDetails = groupSpots(jacks, group => group.length === 1
    ? `Lane ${group[0].column + 1}: ${Math.round(group[0].value)} ms repeat versus ${Math.round(group[0].context)} ms nearby. Check whether this sudden jack is intended.`
    : `${group.length} sudden jacks, tightest ${Math.round(Math.min(...group.map(s => s.value)))} ms versus about ${Math.round(median(group.map(s => s.context)))} ms nearby.`);
  const gapDetails = groupSpots(gaps, group => group.length === 1
    ? `Lane ${group[0].column + 1}: only ${Math.round(group[0].value)} ms to release and press again. Check the release rhythm.`
    : `${group.length} tight releases, shortest ${Math.round(Math.min(...group.map(s => s.value)))} ms. Check the release rhythm.`);
  const rows = toRows(notes, difficulty.keyCount);
  const monotone: AiModDetail[] = [];
  let monotoneMs = 0;
  for (const run of monotoneRuns(rows.map(r => r.mask), difficulty.keyCount)) {
    const from = rows[run.from].time, to = rows[run.to].time;
    const beats = Math.round((to - from) / (60000 / (activeTimingAt(from, difficulty.timingPoints)?.bpm ?? 120)));
    if (!(beats >= MONOTONE_MIN_BEATS) || run.to - run.from + 1 < MONOTONE_MIN_ROWS) continue;
    monotoneMs += to - from;
    monotone.push({ time: from, endTime: to, label: run.kind === "repeat"
      ? `The same ${run.period}-step pattern repeats for ${beats} beats. Vary it where the music changes.`
      : `Notes keep rolling in one direction across the lanes for ${beats} beats. Vary the movement with the music.` });
  }
  const findings: PatternFinding[] = [
    { rule: "jack-spike", message: "Abrupt jack speed spikes", details: jackDetails, count: jacks.length },
    { rule: "hand-imbalance", message: "Sustained hand imbalance", details: hands, count: hands.length },
    { rule: "anchor-overuse", message: "Heavy anchor repetition", details: anchors, count: anchors.length },
    { rule: "ln-gap", message: "Tight long-note release gaps", details: gapDetails, count: gaps.length },
    { rule: "repetitive-pattern", message: "Long repetitive patterns", details: monotone, count: monotone.length, coverage: monotoneMs / Math.max(1, end - start) },
  ].filter(f => f.details.length > 0) as PatternFinding[];
  return { findings, windows, features: { nps: notes.length / Math.max(1, (end - start) / 1000), lnRatio: longNotes / Math.max(1, notes.length), jackFraction: jackPairs / Math.max(1, notes.length), handShare: maxShare, anchorFraction: anchorWindows / Math.max(1, windowCount), lnGapFraction: gaps.length / Math.max(1, longNotes) } };
}

export type CriteriaPenalty = { severity: AiModSeverity; occurrences: number };

export function readinessScore(noteCount: number, findings: PatternFinding[], criteria: CriteriaPenalty[] = []): number | null {
  if (noteCount < 32) return null;
  const spread = (occurrences: number) => occurrences / Math.max(100, noteCount) * 1000;
  const pattern = findings.map(f => f.rule === "repetitive-pattern"
    ? Math.min(70, 5 + 65 * (f.coverage ?? 0) ** 1.5)
    : Math.min(25, 5 + spread(f.count) * (f.rule === "ln-gap" || f.rule === "jack-spike" ? 2 : 1)));
  const rules = criteria.map(c => c.severity === "error"
    ? Math.min(25, 12 + spread(c.occurrences))
    : Math.min(14, 5 + spread(c.occurrences)));
  return Math.max(0, Math.round(100 - [...pattern, ...rules].reduce((a, b) => a + b, 0)));
}
