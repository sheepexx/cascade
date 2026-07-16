import type { ManiaNote } from "../types";

const SECTION_MS = 400;
const INDIVIDUAL_DECAY_BASE = 0.125;
const OVERALL_DECAY_BASE = 0.3;
const RELEASE_THRESHOLD = 30;
const LOGISTIC_MULTIPLIER = 0.27;
const DECAY_WEIGHT = 0.9;
const DIFFICULTY_MULTIPLIER = 0.018;

const applyDecay = (value: number, deltaMs: number, base: number): number =>
  value * Math.pow(base, deltaMs / 1000);

const definitelyBigger = (a: number, b: number): boolean => a > b + 1;

const logistic = (x: number, midpoint: number, mult: number): number =>
  1 / (1 + Math.exp(mult * (midpoint - x)));

export function computeStarRating(
  notes: ManiaNote[],
  keyCount: number,
): number {
  if (notes.length < 2 || keyCount <= 0) return 0;

  const objs = notes
    .map((n) => ({
      start: n.startTime,
      end: n.endTime ?? n.startTime,
      col: Math.max(0, Math.min(keyCount - 1, n.column)),
    }))
    .sort((a, b) => a.start - b.start || a.col - b.col);

  const individualStrains = new Array(keyCount).fill(0);
  const startTimes = new Array(keyCount).fill(0);
  const endTimes = new Array(keyCount).fill(0);
  const hasPrev = new Array(keyCount).fill(false);
  let highestIndividualStrain = 0;
  let overallStrain = 1;
  let currentStrain = 0;
  let prevStart = objs[0].start;

  const strainValueOf = (
    cur: { start: number; end: number; col: number },
    deltaTime: number,
  ): number => {
    const { start, end, col } = cur;

    let individualHoldFactor = 1.0;
    for (let i = 0; i < keyCount; i++) {
      if (!hasPrev[i]) continue;
      if (
        definitelyBigger(endTimes[i], end) &&
        definitelyBigger(start, startTimes[i])
      )
        individualHoldFactor = 1.25;
    }

    let overallHoldFactor = 1.0;
    let isOverlapping = false;
    let closestEnd = Math.abs(end - start);
    for (let i = 0; i < keyCount; i++) {
      if (!hasPrev[i]) continue;
      isOverlapping ||=
        definitelyBigger(endTimes[i], start) &&
        definitelyBigger(end, endTimes[i]);
      if (definitelyBigger(endTimes[i], end)) overallHoldFactor = 1.25;
      closestEnd = Math.min(closestEnd, Math.abs(end - endTimes[i]));
    }
    const holdAddition = isOverlapping
      ? logistic(closestEnd, RELEASE_THRESHOLD, LOGISTIC_MULTIPLIER)
      : 0;

    individualStrains[col] = applyDecay(
      individualStrains[col],
      start - startTimes[col],
      INDIVIDUAL_DECAY_BASE,
    );
    individualStrains[col] += 2.0 * individualHoldFactor;

    highestIndividualStrain =
      deltaTime <= 1
        ? Math.max(highestIndividualStrain, individualStrains[col])
        : individualStrains[col];

    overallStrain = applyDecay(overallStrain, deltaTime, OVERALL_DECAY_BASE);
    overallStrain += (1 + holdAddition) * overallHoldFactor;

    startTimes[col] = start;
    endTimes[col] = end;
    hasPrev[col] = true;
    return highestIndividualStrain + overallStrain - currentStrain;
  };

  const initialStrain = (time: number): number =>
    applyDecay(highestIndividualStrain, time - prevStart, INDIVIDUAL_DECAY_BASE) +
    applyDecay(overallStrain, time - prevStart, OVERALL_DECAY_BASE);

  const peaks: number[] = [];
  let sectionPeak = 0;
  let sectionEnd = 0;
  let started = false;

  for (let i = 1; i < objs.length; i++) {
    const cur = objs[i];
    const deltaTime = cur.start - objs[i - 1].start;

    if (!started) {
      sectionEnd = Math.ceil(cur.start / SECTION_MS) * SECTION_MS;
      started = true;
    }
    while (cur.start > sectionEnd) {
      peaks.push(sectionPeak);
      sectionPeak = initialStrain(sectionEnd);
      sectionEnd += SECTION_MS;
    }

    currentStrain += strainValueOf(cur, deltaTime);
    sectionPeak = Math.max(sectionPeak, currentStrain);
    prevStart = cur.start;
  }
  peaks.push(sectionPeak);

  const sortedPeaks = peaks.filter((p) => p > 0).sort((a, b) => b - a);
  let difficulty = 0;
  let weight = 1;
  for (const peak of sortedPeaks) {
    difficulty += peak * weight;
    weight *= DECAY_WEIGHT;
  }

  return difficulty * DIFFICULTY_MULTIPLIER;
}

type Stop = { star: number; color: [number, number, number] };

const SPECTRUM: Stop[] = [
  { star: 0.1, color: hex("#4290fb") },
  { star: 1.25, color: hex("#4fc0ff") },
  { star: 2.0, color: hex("#4fffd5") },
  { star: 2.5, color: hex("#7cff4f") },
  { star: 3.3, color: hex("#f6f05c") },
  { star: 4.2, color: hex("#ff8068") },
  { star: 4.9, color: hex("#ff4e6f") },
  { star: 5.8, color: hex("#c645b8") },
  { star: 6.7, color: hex("#6563de") },
  { star: 7.7, color: hex("#2d2be0") },
  { star: 9.0, color: hex("#442ad4") },
  { star: 9.6, color: hex("#8a2fc8") },
  { star: 10.2, color: hex("#c437ae") },
  { star: 10.8, color: hex("#f04d9b") },
];

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function starColor(star: number): string {
  if (star <= 0.05) return "#aaaaaa";
  if (star <= SPECTRUM[0].star) return rgb(SPECTRUM[0].color);
  const last = SPECTRUM[SPECTRUM.length - 1];
  if (star >= last.star) return rgb(last.color);

  for (let i = 0; i < SPECTRUM.length - 1; i++) {
    const a = SPECTRUM[i];
    const b = SPECTRUM[i + 1];
    if (star >= a.star && star <= b.star) {
      const t = (star - a.star) / (b.star - a.star);
      return rgb([
        Math.round(lerp(a.color[0], b.color[0], t)),
        Math.round(lerp(a.color[1], b.color[1], t)),
        Math.round(lerp(a.color[2], b.color[2], t)),
      ]);
    }
  }
  return rgb(last.color);
}

function rgb([r, g, b]: [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function starTier(star: number): string {
  if (star < 2.0) return "Easy";
  if (star < 2.7) return "Normal";
  if (star < 4.0) return "Hard";
  if (star < 5.3) return "Insane";
  if (star < 6.5) return "Expert";
  return "Expert+";
}
