import type { Difficulty, ManiaNote, TimingPoint } from "../types";
import { activeTimingAt, beatLength, redPoints, sortedPoints } from "./timing";
import { computeStarRating } from "./starRating";
import type { AiModDetail, AiModSeverity } from "./aimod";

export type CriteriaFinding = {
  rule: string;
  severity: AiModSeverity;
  guideline: boolean;
  message: string;
  diffId?: string;
  time?: number;
  details?: AiModDetail[];
};

export const LEGAL_KEY_COUNTS = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18];

export const TIER_ORDER = ["Easy", "Normal", "Hard", "Insane", "Expert", "Expert+"] as const;
export type Tier = (typeof TIER_ORDER)[number];

const SNAP_TOLERANCE = 1.08;
const CHORD_MS = 10;
const SV_TOLERANCE = 0.02;
const SCROLL_TOLERANCE = 0.05;
const KEY_MODE_NAME = /(^|[^0-9a-z])\d{1,2}\s?k([^a-z]|$)/i;

const MAX_SIMULTANEOUS_PRESSES = 6;
const MIN_LN_BEATS = 1 / 12;

const HP_OD_CEILING: Partial<Record<Tier, number>> = { Easy: 7, Normal: 7.5, Hard: 8 };
const LN_HOLD_BEATS: Partial<Record<Tier, number>> = { Easy: 1, Normal: 0.5, Hard: 0.25 };
const LN_RELEASE_BEATS: Partial<Record<Tier, number>> = { Easy: 1, Normal: 0.5 };
const FAST_SNAP_DENOMINATOR: Partial<Record<Tier, number>> = { Easy: 4, Normal: 6, Hard: 8 };
const RUN_SNAP: Partial<Record<Tier, { denominator: number; max: number }>> = {
  Easy: { denominator: 2, max: 5 },
  Normal: { denominator: 4, max: 5 },
};
const ANCHOR_LIMIT: Partial<Record<Tier, number>> = { Normal: 3, Hard: 5 };
const JACK_LIMIT: Partial<Record<Tier, number>> = { Normal: 2, Hard: 3 };
const LN_OVERLAP_BEATS: Partial<Record<Tier, number>> = { Easy: 1, Normal: 0.5 };
const LONG_SV_RANGE: Partial<Record<Tier, [number, number]>> = {
  Normal: [0.9, 1.05],
  Hard: [0.8, 1.1],
  Insane: [0.7, 1.1],
  Expert: [0.6, 1.1],
  "Expert+": [0.6, 1.1],
};
const CHORD_LIMIT: Partial<Record<Tier, Record<number, number>>> = {
  Easy: { 4: 2, 7: 2 },
  Normal: { 4: 2, 7: 3 },
  Hard: { 4: 3, 7: 4 },
};

const TRILL_LIMIT_HARD = 9;

type Chord = { time: number; columns: number[]; beat: number };

const objectRef = (note: ManiaNote) => ({ time: Math.round(note.startTime), column: note.column });

const TIER_THRESHOLDS: Record<number, number[]> = {
  4: [1.72, 2.6, 3.44, 5.06, 5.4],
  5: [1.4, 2.54, 3.42, 5.06, 5.4],
  6: [1.6, 2.42, 3.74, 5.06, 5.4],
  7: [1.6, 2.38, 3.64, 5.06, 5.4],
  8: [1.54, 1.98, 3.58, 5.06, 5.4],
  9: [1.32, 1.94, 3.76, 5.06, 5.4],
  10: [1.5, 2.12, 3.54, 5.06, 5.4],
};
const TIER_THRESHOLDS_DEFAULT = [1.6, 2.42, 3.6, 5.06, 5.4];

export function maniaTier(starRating: number, keyCount: number): Tier {
  const thresholds = TIER_THRESHOLDS[keyCount] ?? TIER_THRESHOLDS_DEFAULT;
  let index = 0;
  while (index < thresholds.length && starRating >= thresholds[index]) index++;
  return TIER_ORDER[index];
}

function tierOf(difficulty: Difficulty): Tier {
  return maniaTier(computeStarRating(difficulty.notes, difficulty.keyCount), difficulty.keyCount);
}

function tierAtMost(tier: Tier, limit: Tier): boolean {
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(limit);
}

function buildChords(notes: ManiaNote[], points: TimingPoint[]): Chord[] {
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime || a.column - b.column);
  const chords: Chord[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].startTime - sorted[i].startTime <= CHORD_MS) j++;
    const columns = sorted.slice(i, j).map((n) => n.column);
    chords.push({ time: sorted[i].startTime, columns, beat: beatLength(activeTimingAt(sorted[i].startTime, points).bpm) });
    i = j;
  }
  return chords;
}

function atLeastSnap(gap: number, beat: number, denominator: number): boolean {
  return gap > 0 && Number.isFinite(beat) && beat > 0 && gap <= (beat / denominator) * SNAP_TOLERANCE;
}

function nearSnap(gap: number, beat: number, denominator: number): boolean {
  if (!(gap > 0) || !(beat > 0)) return false;
  const target = beat / denominator;
  return gap >= target / SNAP_TOLERANCE && gap <= target * SNAP_TOLERANCE;
}

function baseBpmOf(points: TimingPoint[], endTime: number): number {
  const reds = redPoints(points);
  if (reds.length === 0) return 0;
  const durations = new Map<number, number>();
  for (let i = 0; i < reds.length; i++) {
    const span = Math.max(0, (i + 1 < reds.length ? reds[i + 1].time : endTime) - reds[i].time);
    durations.set(reds[i].bpm, (durations.get(reds[i].bpm) ?? 0) + span);
  }
  let best = reds[0].bpm;
  let bestSpan = -1;
  for (const [bpm, span] of durations) {
    if (span > bestSpan) {
      best = bpm;
      bestSpan = span;
    }
  }
  return best;
}

type ScrollSection = { time: number; end: number; effective: number; sv: number; bpm: number; beat: number; meter: number; notes: number };

function scrollSections(difficulty: Difficulty, endTime: number): ScrollSection[] {
  const points = sortedPoints(difficulty.timingPoints);
  const base = baseBpmOf(points, endTime);
  if (!(base > 0)) return [];
  const boundaries = points.filter((p) => p.uninherited || p.sv !== undefined);
  if (boundaries.length === 0) return [];
  const starts = difficulty.notes.map((n) => n.startTime).sort((a, b) => a - b);
  const countBetween = (from: number, to: number) => {
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] < from) lo = mid + 1;
      else hi = mid;
    }
    let count = 0;
    for (let i = lo; i < starts.length && starts[i] < to; i++) count++;
    return count;
  };
  const sections: ScrollSection[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const time = boundaries[i].time;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].time : endTime;
    if (end <= time) continue;
    const active = activeTimingAt(time, points);
    const sv = boundaries[i].uninherited ? svAt(time, points) : boundaries[i].sv;
    sections.push({
      time,
      end,
      sv,
      bpm: active.bpm,
      beat: beatLength(active.bpm),
      meter: active.meter > 0 ? active.meter : 4,
      effective: (sv * active.bpm) / base,
      notes: countBetween(time, end),
    });
  }
  return sections;
}

function svAt(time: number, points: TimingPoint[]): number {
  let sv = 1;
  for (const p of sortedPoints(points)) {
    if (p.time > time) break;
    if (p.uninherited) sv = 1;
    else sv = p.sv;
  }
  return sv;
}

function mappedSpan(difficulty: Difficulty): { start: number; end: number; drain: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const n of difficulty.notes) {
    if (n.startTime < start) start = n.startTime;
    const finish = n.endTime ?? n.startTime;
    if (finish > end) end = finish;
  }
  if (!Number.isFinite(start)) return { start: 0, end: 0, drain: 0 };
  return { start, end, drain: end - start };
}

function checkGeneralRules(difficulty: Difficulty, tier: Tier, chords: Chord[], findings: CriteriaFinding[]) {
  const diffId = difficulty.id;

  if (!LEGAL_KEY_COUNTS.includes(difficulty.keyCount)) {
    findings.push({
      rule: "rc-key-count",
      severity: "error",
      guideline: false,
      message: `[${difficulty.name}] ${difficulty.keyCount}K is not a rankable key mode. Ranked beatmaps may only use 4-10, 12, 14, 16 or 18 keys.`,
      diffId,
    });
  }

  const used = new Set(difficulty.notes.map((n) => n.column));
  const empty: number[] = [];
  for (let c = 0; c < difficulty.keyCount; c++) if (!used.has(c)) empty.push(c + 1);
  if (empty.length > 0 && difficulty.notes.length > 0) {
    findings.push({
      rule: "rc-empty-column",
      severity: "error",
      guideline: false,
      message: `[${difficulty.name}] Column${empty.length === 1 ? "" : "s"} ${empty.join(", ")} contain no notes. No column can be left empty; lower the key count in Song Setup instead.`,
      diffId,
    });
  }

  if (tierAtMost(tier, "Insane")) {
    const crowded = chords
      .filter((c) => c.columns.length > MAX_SIMULTANEOUS_PRESSES)
      .map((c) => ({
        time: c.time,
        objects: c.columns.map((column) => ({ time: Math.round(c.time), column })),
        label: `${c.columns.length} notes pressed at once.`,
      }));
    if (crowded.length > 0) {
      findings.push({
        rule: "rc-simultaneous-presses",
        severity: "error",
        guideline: false,
        message: `[${difficulty.name}] More than ${MAX_SIMULTANEOUS_PRESSES} notes pressed at once on an ${tier} difficulty.`,
        diffId,
        details: crowded,
      });
    }
  }
}

function checkScrollRules(difficulty: Difficulty, tier: Tier, endTime: number, findings: CriteriaFinding[]) {
  if (!tierAtMost(tier, "Normal")) return;
  const sections = scrollSections(difficulty, endTime);
  const details: AiModDetail[] = [];
  for (const section of sections) {
    if (section.notes === 0) continue;
    if (Math.abs(section.effective - 1) <= SCROLL_TOLERANCE) continue;
    details.push({
      time: section.time,
      label:
        Math.abs(section.sv - 1) <= SV_TOLERANCE
          ? `Scroll runs at ${section.effective.toFixed(2)}x here because ${Math.round(section.bpm)} BPM is not normalised.`
          : `Slider velocity ${section.sv.toFixed(2)}x puts scroll at ${section.effective.toFixed(2)}x.`,
    });
  }
  if (details.length > 0) {
    findings.push({
      rule: "rc-scroll-speed",
      severity: "error",
      guideline: false,
      message: `[${difficulty.name}] Scroll speed changes are not allowed on ${tier}. Slider velocity may only be used to normalise variable BPM.`,
      diffId: difficulty.id,
      details,
    });
  }
}

function checkLongNotes(difficulty: Difficulty, tier: Tier, points: TimingPoint[], findings: CriteriaFinding[]) {
  const diffId = difficulty.id;
  const holds = difficulty.notes.filter((n) => n.endTime !== undefined && n.endTime > n.startTime);
  const tooShort: AiModDetail[] = [];
  const globalShort: AiModDetail[] = [];
  const minBeats = LN_HOLD_BEATS[tier];
  for (const n of holds) {
    const beat = beatLength(activeTimingAt(n.startTime, points).bpm);
    if (!(beat > 0)) continue;
    const beats = (n.endTime! - n.startTime) / beat;
    if (beats < MIN_LN_BEATS) {
      globalShort.push({ time: n.startTime, objects: [objectRef(n)], label: `Held for 1/${Math.round(1 / Math.max(beats, 1e-6))} of a beat.` });
    } else if (minBeats !== undefined && beats < minBeats) {
      tooShort.push({ time: n.startTime, objects: [objectRef(n)], label: `Held for ${beats.toFixed(2)} beats.` });
    }
  }
  if (globalShort.length > 0) {
    findings.push({
      rule: "rc-ln-minimum",
      severity: "warning",
      guideline: true,
      message: `[${difficulty.name}] Long notes should be held for at least 1/12 of a beat.`,
      diffId,
      details: globalShort,
    });
  }
  if (tooShort.length > 0) {
    findings.push({
      rule: "rc-ln-hold",
      severity: "warning",
      guideline: true,
      message: `[${difficulty.name}] Long notes on ${tier} should be held for at least ${minBeats === 1 ? "one beat" : `1/${Math.round(1 / minBeats!)} of a beat`}.`,
      diffId,
      details: tooShort,
    });
  }

  const releaseBeats = LN_RELEASE_BEATS[tier];
  if (releaseBeats !== undefined && holds.length > 1) {
    const ends = holds.map((n) => ({ time: n.endTime!, column: n.column })).sort((a, b) => a.time - b.time);
    const tight: AiModDetail[] = [];
    for (let i = 1; i < ends.length; i++) {
      const gap = ends[i].time - ends[i - 1].time;
      const beat = beatLength(activeTimingAt(ends[i].time, points).bpm);
      if (!(beat > 0) || gap <= 0) continue;
      if (gap < (beat * releaseBeats) / SNAP_TOLERANCE) {
        tight.push({
          time: ends[i - 1].time,
          objects: [{ time: Math.round(ends[i - 1].time), column: ends[i - 1].column }, { time: Math.round(ends[i].time), column: ends[i].column }],
          label: `Releases ${Math.round(gap)} ms apart (${(gap / beat).toFixed(2)} beats).`,
        });
      }
    }
    if (tight.length > 0) {
      findings.push({
        rule: "rc-ln-release-gap",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Long note releases on ${tier} should be at least ${releaseBeats === 1 ? "one beat" : "1/2 of a beat"} apart.`,
        diffId,
        details: tight,
      });
    }
  }

  const overlapBeats = LN_OVERLAP_BEATS[tier];
  if (overlapBeats !== undefined) {
    const sorted = [...difficulty.notes].sort((a, b) => a.startTime - b.startTime);
    const inside: AiModDetail[] = [];
    for (const hold of holds) {
      const beat = beatLength(activeTimingAt(hold.startTime, points).bpm);
      if (!(beat > 0)) continue;
      if (hold.endTime! - hold.startTime < beat * overlapBeats * 0.95) continue;
      for (const other of sorted) {
        if (other === hold) continue;
        if (other.startTime <= hold.startTime + CHORD_MS) continue;
        if (other.startTime >= hold.endTime! - CHORD_MS) continue;
        inside.push({ time: other.startTime, objects: [objectRef(hold), objectRef(other)], label: `Note in column ${other.column + 1} lands inside the hold starting at column ${hold.column + 1}.` });
      }
    }
    if (inside.length > 0) {
      findings.push({
        rule: "rc-ln-overlap",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Objects should not be placed during a ${overlapBeats === 1 ? "1/1" : "1/2"} long note's hold on ${tier}.`,
        diffId,
        details: inside,
      });
    }
  }
}

function checkRhythm(difficulty: Difficulty, tier: Tier, chords: Chord[], findings: CriteriaFinding[]) {
  const diffId = difficulty.id;

  const fast = FAST_SNAP_DENOMINATOR[tier];
  if (fast !== undefined) {
    const details: AiModDetail[] = [];
    let runStart = -1;
    let runLength = 0;
    for (let i = 1; i <= chords.length; i++) {
      const linked = i < chords.length && atLeastSnap(chords[i].time - chords[i - 1].time, chords[i - 1].beat, fast);
      if (linked) {
        if (runLength === 0) runStart = i - 1;
        runLength++;
      } else {
        if (runLength >= 2) {
          details.push({ time: chords[runStart].time, label: `${runLength + 1} notes at 1/${fast} or faster.` });
        }
        runLength = 0;
      }
    }
    if (details.length > 0) {
      findings.push({
        rule: "rc-fast-snap",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Consecutive 1/${fast} or faster snappings should not be used on ${tier}.`,
        diffId,
        details,
      });
    }
  }

  const run = RUN_SNAP[tier];
  if (run !== undefined) {
    const details: AiModDetail[] = [];
    let runStart = -1;
    let runLength = 0;
    const flush = () => {
      if (runLength + 1 > run.max) {
        details.push({ time: chords[runStart].time, label: `${runLength + 1} consecutive 1/${run.denominator} notes.` });
      }
      runLength = 0;
    };
    for (let i = 1; i <= chords.length; i++) {
      const linked = i < chords.length && nearSnap(chords[i].time - chords[i - 1].time, chords[i - 1].beat, run.denominator);
      if (linked) {
        if (runLength === 0) runStart = i - 1;
        runLength++;
      } else flush();
    }
    if (details.length > 0) {
      findings.push({
        rule: "rc-run-length",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Avoid more than ${run.max} consecutive 1/${run.denominator} notes on ${tier}.`,
        diffId,
        details,
      });
    }
  }

  const chordLimit = CHORD_LIMIT[tier]?.[difficulty.keyCount >= 6 ? 7 : 4];
  if (chordLimit !== undefined) {
    const details = chords
      .filter((c) => c.columns.length > chordLimit)
      .map((c) => ({ time: c.time, objects: c.columns.map((column) => ({ time: Math.round(c.time), column })), label: `${c.columns.length}-note chord.` }));
    if (details.length > 0) {
      findings.push({
        rule: "rc-chord-size",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Avoid chords with more than ${chordLimit} notes on ${difficulty.keyCount}K ${tier}.`,
        diffId,
        details,
      });
    }
  }
}

function checkColumnPatterns(difficulty: Difficulty, tier: Tier, chords: Chord[], findings: CriteriaFinding[]) {
  const diffId = difficulty.id;

  const anchorLimit = ANCHOR_LIMIT[tier];
  if (anchorLimit !== undefined) {
    const details: AiModDetail[] = [];
    const runs = new Map<number, { length: number; start: number }>();
    const reported = new Set<number>();
    for (let i = 0; i < chords.length; i++) {
      const linked = i > 0 && atLeastSnap(chords[i].time - chords[i - 1].time, chords[i - 1].beat, 2);
      if (!linked) runs.clear();
      const present = new Set(chords[i].columns);
      for (const column of [...runs.keys()]) if (!present.has(column)) runs.delete(column);
      for (const column of present) {
        const current = runs.get(column) ?? { length: 0, start: chords[i].time };
        current.length++;
        runs.set(column, current);
        if (current.length >= anchorLimit && !reported.has(current.start)) {
          reported.add(current.start);
          details.push({ time: current.start, objects: [{ time: Math.round(current.start), column }], label: `Column ${column + 1} repeats for ${current.length} consecutive notes.` });
        }
      }
    }
    if (details.length > 0) {
      findings.push({
        rule: "rc-anchor",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Avoid anchors of ${anchorLimit} or more notes on ${tier}.`,
        diffId,
        details,
      });
    }
  }

  const jackLimit = JACK_LIMIT[tier];
  if (jackLimit !== undefined) {
    const details: AiModDetail[] = [];
    const byColumn = new Map<number, number[]>();
    for (const chord of chords) for (const column of chord.columns) {
      const list = byColumn.get(column);
      if (list) list.push(chord.time);
      else byColumn.set(column, [chord.time]);
    }
    for (const [column, times] of byColumn) {
      let runStart = -1;
      let runLength = 1;
      for (let i = 1; i <= times.length; i++) {
        const beat = beatLength(activeTimingAt(times[i - 1], difficulty.timingPoints).bpm);
        const linked = i < times.length && atLeastSnap(times[i] - times[i - 1], beat, 4);
        if (linked) {
          if (runLength === 1) runStart = i - 1;
          runLength++;
        } else {
          if (runLength >= jackLimit) {
            details.push({ time: times[runStart], objects: [{ time: Math.round(times[runStart]), column }], label: `${runLength} notes in column ${column + 1} at 1/4 or faster.` });
          }
          runLength = 1;
        }
      }
    }
    if (details.length > 0) {
      details.sort((a, b) => a.time - b.time);
      findings.push({
        rule: "rc-jack",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] ${jackLimit === 2 ? "Avoid 1/4 minijacks and other jack patterns" : "1/4 jack usage is discouraged"} on ${tier}.`,
        diffId,
        details,
      });
    }
  }

  if (tier === "Hard") {
    const details: AiModDetail[] = [];
    let length = 0;
    let start = 0;
    for (let i = 1; i < chords.length; i++) {
      const prev = chords[i - 1];
      const cur = chords[i];
      const alternating =
        prev.columns.length === 1 && cur.columns.length === 1 && prev.columns[0] !== cur.columns[0] &&
        atLeastSnap(cur.time - prev.time, prev.beat, 4) &&
        (length < 2 || cur.columns[0] === chords[i - 2].columns[0]);
      if (alternating) {
        if (length === 0) start = prev.time;
        length = length === 0 ? 2 : length + 1;
      } else {
        if (length > TRILL_LIMIT_HARD) details.push({ time: start, label: `${length} note trill.` });
        length = 0;
      }
    }
    if (length > TRILL_LIMIT_HARD) details.push({ time: start, label: `${length} note trill.` });
    if (details.length > 0) {
      findings.push({
        rule: "rc-trill",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Avoid more than ${TRILL_LIMIT_HARD} consecutive notes in a trill on Hard.`,
        diffId,
        details,
      });
    }
  }
}

function checkSettings(difficulty: Difficulty, tier: Tier, endTime: number, findings: CriteriaFinding[]) {
  const ceiling = HP_OD_CEILING[tier];
  if (ceiling !== undefined) {
    const over: string[] = [];
    if (difficulty.hpDrainRate > ceiling) over.push(`HP ${difficulty.hpDrainRate}`);
    if (difficulty.overallDifficulty > ceiling) over.push(`OD ${difficulty.overallDifficulty}`);
    if (over.length > 0) {
      findings.push({
        rule: "rc-hp-od",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] ${over.join(" and ")} exceed the ${ceiling} ceiling suggested for ${tier}.`,
        diffId: difficulty.id,
      });
    }
  }

  const range = LONG_SV_RANGE[tier];
  if (range !== undefined) {
    const details: AiModDetail[] = [];
    for (const section of scrollSections(difficulty, endTime)) {
      if (section.notes === 0) continue;
      const measures = (section.end - section.time) / (section.beat * section.meter);
      if (!(measures > 4)) continue;
      if (section.effective >= range[0] - SV_TOLERANCE && section.effective <= range[1] + SV_TOLERANCE) continue;
      details.push({ time: section.time, label: `${section.effective.toFixed(2)}x scroll held for ${measures.toFixed(1)} measures.` });
    }
    if (details.length > 0) {
      findings.push({
        rule: "rc-long-sv",
        severity: "warning",
        guideline: true,
        message: `[${difficulty.name}] Long-term slider velocity on ${tier} should stay between ${range[0].toFixed(2)}x and ${range[1].toFixed(2)}x.`,
        diffId: difficulty.id,
        details,
      });
    }
  }
}

function checkSetRules(difficulties: Difficulty[], tiers: Map<string, Tier>, findings: CriteriaFinding[]) {
  const playable = difficulties.filter((d) => d.notes.length > 0);
  if (playable.length === 0) return;

  const keyCounts = new Set(playable.map((d) => d.keyCount));
  const mustDenote = keyCounts.size > 1 || playable.some((d) => d.keyCount > 10);
  for (const d of playable) {
    const denotes = KEY_MODE_NAME.test(d.name);
    if (mustDenote && !denotes) {
      findings.push({
        rule: "rc-key-mode-name",
        severity: "error",
        guideline: false,
        message: `[${d.name}] Difficulty names must denote their key mode when a mapset mixes key modes or uses more than 10 keys. Name it with a "[${d.keyCount}K]" marker.`,
        diffId: d.id,
      });
    } else if (!mustDenote && denotes) {
      findings.push({
        rule: "rc-key-mode-name",
        severity: "error",
        guideline: false,
        message: `[${d.name}] Difficulty names must not denote a key mode when the mapset uses a single key mode of 10 keys or fewer.`,
        diffId: d.id,
      });
    }
  }

  const shortest = Math.min(...playable.map((d) => mappedSpan(d).drain));
  const requirement =
    shortest < 120_000 ? { limit: "Normal" as Tier, count: 4, label: "2:00" }
      : shortest < 165_000 ? { limit: "Hard" as Tier, count: 3, label: "2:45" }
        : shortest < 210_000 ? { limit: "Insane" as Tier, count: 2, label: "3:30" }
          : null;
  if (requirement) {
    for (const keyCount of keyCounts) {
      const inMode = playable.filter((d) => d.keyCount === keyCount);
      const hasLowEnough = inMode.some((d) => tierAtMost(tiers.get(d.id) ?? "Expert+", requirement.limit));
      if (hasLowEnough || inMode.length >= requirement.count) continue;
      findings.push({
        rule: "rc-spread",
        severity: "error",
        guideline: false,
        message: `[${keyCount}K] Drain time is under ${requirement.label}, so this key mode needs a ${requirement.limit} or lower difficulty, or a spread of at least ${requirement.count} difficulties. It has ${inMode.length} (lowest ${inMode.map((d) => tiers.get(d.id)).sort((a, b) => TIER_ORDER.indexOf(a as Tier) - TIER_ORDER.indexOf(b as Tier))[0]}).`,
      });
    }
  }
}

export function checkRankingCriteria(difficulties: Difficulty[], audioDurationMs?: number): CriteriaFinding[] {
  const findings: CriteriaFinding[] = [];
  const tiers = new Map<string, Tier>();
  for (const difficulty of difficulties) {
    if (difficulty.notes.length === 0) continue;
    const tier = tierOf(difficulty);
    tiers.set(difficulty.id, tier);
    const points = difficulty.timingPoints ?? [];
    if (redPoints(points).length === 0) continue;
    const span = mappedSpan(difficulty);
    const endTime = Math.max(span.end, audioDurationMs ?? 0);
    const chords = buildChords(difficulty.notes, points);
    checkGeneralRules(difficulty, tier, chords, findings);
    checkScrollRules(difficulty, tier, endTime, findings);
    checkLongNotes(difficulty, tier, points, findings);
    checkRhythm(difficulty, tier, chords, findings);
    checkColumnPatterns(difficulty, tier, chords, findings);
    checkSettings(difficulty, tier, endTime, findings);
  }
  checkSetRules(difficulties, tiers, findings);
  return findings;
}

export function difficultyTier(difficulty: Difficulty): Tier {
  return tierOf(difficulty);
}

export const CRITERIA_UNCHECKED = [
  "Whether every note matches an audible sound",
  "Playstyle and N+1 tagging",
  "Musical phrasing pauses in long streams",
  "Bracket, split-jumptrill and chordstream density guidance",
  "Slider velocity gimmick reaction times",
  "Hitsound and keysound balance",
];
