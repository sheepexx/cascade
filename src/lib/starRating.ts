import type { ManiaNote } from "../types";

// Star rating, ported from osu!'s own mania difficulty calculator so a map
// shows the stars osu! gives it (ppy/osu, osu.Game.Rulesets.Mania/Difficulty,
// calculator version 20241007).
// Copyright (c) ppy Pty Ltd <contact@ppy.sh>. Licensed under the MIT Licence:
// https://github.com/ppy/osu/blob/master/LICENCE

const SECTION_LENGTH = 400;
const DECAY_WEIGHT = 0.9;
const INDIVIDUAL_DECAY_BASE = 0.125;
const OVERALL_DECAY_BASE = 0.3;
const RELEASE_THRESHOLD = 30;
const RELEASE_MULTIPLIER = 0.27;
const DIFFICULTY_MULTIPLIER = 0.018;

type HitObject = { start: number; end: number; column: number };

/** osu-framework's Precision.DefinitelyBigger, with the 1 ms tolerance mania uses. */
const definitelyBigger = (a: number, b: number): boolean => a - 1 > b;

const applyDecay = (value: number, deltaTime: number, decayBase: number): number =>
  value * Math.pow(decayBase, deltaTime / 1000);

const logistic = (x: number, midpointOffset: number, multiplier: number): number =>
  1 / (1 + Math.exp(multiplier * (midpointOffset - x)));

/**
 * The star rating osu! gives a difficulty. `clockRate` speeds it up or slows
 * it down the way Double Time (1.5) and Half Time (0.75) do; rate difficulties
 * already carry their rate in their note times.
 */
export function computeStarRating(
  notes: ManiaNote[],
  keyCount: number,
  clockRate = 1,
): number {
  if (notes.length < 2 || keyCount <= 0) return 0;
  const rate = Number.isFinite(clockRate) && clockRate > 0 ? clockRate : 1;

  // The hit objects osu! reads from Cascade's export: whole milliseconds, in
  // time order, with notes at the same time in the order the difficulty holds
  // them. Its decoder keeps that order, and it can change the result.
  const objects: HitObject[] = [...notes]
    .sort((a, b) => a.startTime - b.startTime)
    .map((note) => {
      const start = Math.round(note.startTime);
      return {
        start,
        end:
          note.endTime !== undefined && note.endTime > note.startTime
            ? Math.round(note.endTime)
            : start,
        column: Math.max(0, Math.min(keyCount - 1, note.column)),
      };
    })
    .sort((a, b) => a.start - b.start);
  // osu! then sorts again with the old .NET quicksort, which is not stable.
  // How it shuffles notes at the same time changes which releases count as
  // close together, so the shuffle is reproduced exactly.
  legacySort(objects, (a, b) => a.start - b.start);

  const individualStrains = new Array<number>(keyCount).fill(0);
  // The latest object in each column, with rate-adjusted times.
  const previous: ({ start: number; end: number } | null)[] = new Array(
    keyCount,
  ).fill(null);
  let highestIndividualStrain = 0;
  let overallStrain = 1;
  let currentStrain = 0;

  const peaks: number[] = [];
  let sectionPeak = 0;
  let sectionEnd = 0;

  // The first object only times the second; it adds no strain of its own.
  for (let i = 1; i < objects.length; i++) {
    const object = objects[i];
    const last = objects[i - 1];
    const startTime = object.start / rate;
    const endTime = object.end / rate;
    const deltaTime = (object.start - last.start) / rate;
    const column = object.column;

    if (i === 1) {
      sectionEnd = Math.ceil(startTime / SECTION_LENGTH) * SECTION_LENGTH;
    }
    while (startTime > sectionEnd) {
      peaks.push(sectionPeak);
      const sinceLast = sectionEnd - last.start / rate;
      sectionPeak =
        applyDecay(highestIndividualStrain, sinceLast, INDIVIDUAL_DECAY_BASE) +
        applyDecay(overallStrain, sinceLast, OVERALL_DECAY_BASE);
      sectionEnd += SECTION_LENGTH;
    }

    // A note ending inside a hold that started earlier is harder to hit.
    let individualHoldFactor = 1;
    for (const held of previous) {
      if (
        held &&
        definitelyBigger(held.end, endTime) &&
        definitelyBigger(startTime, held.start)
      ) {
        individualHoldFactor = 1.25;
        break;
      }
    }

    // A hold released while another is still down is awkward, unless another
    // note lets go at nearly the same moment.
    let isOverlapping = false;
    let overallHoldFactor = 1;
    let closestEndTime = Math.abs(endTime - startTime);
    for (const held of previous) {
      if (!held) continue;
      isOverlapping ||=
        definitelyBigger(held.end, startTime) &&
        definitelyBigger(endTime, held.end) &&
        definitelyBigger(startTime, held.start);
      if (definitelyBigger(held.end, endTime) && definitelyBigger(startTime, held.start)) {
        overallHoldFactor = 1.25;
      }
      closestEndTime = Math.min(closestEndTime, Math.abs(endTime - held.end));
    }
    const holdAddition = isOverlapping
      ? logistic(closestEndTime, RELEASE_THRESHOLD, RELEASE_MULTIPLIER)
      : 0;

    const inColumn = previous[column];
    const columnStrainTime = inColumn ? startTime - inColumn.start : startTime;
    individualStrains[column] = applyDecay(
      individualStrains[column],
      columnStrainTime,
      INDIVIDUAL_DECAY_BASE,
    );
    individualStrains[column] += 2 * individualHoldFactor;

    // Notes in a chord take the hardest column, so their order can't matter.
    highestIndividualStrain =
      deltaTime <= 1
        ? Math.max(highestIndividualStrain, individualStrains[column])
        : individualStrains[column];

    overallStrain = applyDecay(overallStrain, deltaTime, OVERALL_DECAY_BASE);
    overallStrain += (1 + holdAddition) * overallHoldFactor;

    currentStrain += highestIndividualStrain + overallStrain - currentStrain;
    sectionPeak = Math.max(currentStrain, sectionPeak);
    previous[column] = { start: startTime, end: endTime };
  }
  peaks.push(sectionPeak);

  let difficulty = 0;
  let weight = 1;
  for (const peak of peaks.filter((p) => p > 0).sort((a, b) => b - a)) {
    difficulty += peak * weight;
    weight *= DECAY_WEIGHT;
  }

  return difficulty * DIFFICULTY_MULTIPLIER;
}

/**
 * The unstable quicksort .NET Framework 4 used for Array.Sort, which osu!
 * still uses for mania. Port of osu!'s LegacySortHelper, which comes from
 * Microsoft's reference source (MIT).
 */
function legacySort<T>(keys: T[], compare: (a: T, b: T) => number): void {
  if (keys.length === 0) return;
  depthLimitedQuickSort(keys, 0, keys.length - 1, compare, 32);
}

function depthLimitedQuickSort<T>(
  keys: T[],
  left: number,
  right: number,
  compare: (a: T, b: T) => number,
  depthLimit: number,
): void {
  do {
    if (depthLimit === 0) {
      heapsort(keys, left, right, compare);
      return;
    }

    let i = left;
    let j = right;
    const middle = i + ((j - i) >> 1);
    swapIfGreater(keys, compare, i, middle);
    swapIfGreater(keys, compare, i, j);
    swapIfGreater(keys, compare, middle, j);
    const pivot = keys[middle];

    do {
      while (compare(keys[i], pivot) < 0) i++;
      while (compare(pivot, keys[j]) < 0) j--;
      if (i > j) break;
      if (i < j) swap(keys, i, j);
      i++;
      j--;
    } while (i <= j);

    depthLimit--;
    if (j - left <= right - i) {
      if (left < j) depthLimitedQuickSort(keys, left, j, compare, depthLimit);
      left = i;
    } else {
      if (i < right) depthLimitedQuickSort(keys, i, right, compare, depthLimit);
      right = j;
    }
  } while (left < right);
}

function heapsort<T>(
  keys: T[],
  lo: number,
  hi: number,
  compare: (a: T, b: T) => number,
): void {
  const n = hi - lo + 1;
  for (let i = n >> 1; i >= 1; i--) downHeap(keys, i, n, lo, compare);
  for (let i = n; i > 1; i--) {
    swap(keys, lo, lo + i - 1);
    downHeap(keys, 1, i - 1, lo, compare);
  }
}

function downHeap<T>(
  keys: T[],
  i: number,
  n: number,
  lo: number,
  compare: (a: T, b: T) => number,
): void {
  const d = keys[lo + i - 1];
  while (i <= n >> 1) {
    let child = 2 * i;
    if (child < n && compare(keys[lo + child - 1], keys[lo + child]) < 0) {
      child++;
    }
    if (!(compare(d, keys[lo + child - 1]) < 0)) break;
    keys[lo + i - 1] = keys[lo + child - 1];
    i = child;
  }
  keys[lo + i - 1] = d;
}

function swap<T>(keys: T[], a: number, b: number): void {
  if (a === b) return;
  const tmp = keys[a];
  keys[a] = keys[b];
  keys[b] = tmp;
}

function swapIfGreater<T>(
  keys: T[],
  compare: (a: T, b: T) => number,
  a: number,
  b: number,
): void {
  if (a !== b && compare(keys[a], keys[b]) > 0) swap(keys, a, b);
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
  { star: 7.7, color: hex("#18158e") },
  { star: 9.0, color: hex("#000000") },
];

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorAt(star: number): [number, number, number] {
  if (star <= 0.05) return [170, 170, 170];
  if (star <= SPECTRUM[0].star) return SPECTRUM[0].color;
  const last = SPECTRUM[SPECTRUM.length - 1];
  if (star >= last.star) return last.color;

  for (let i = 0; i < SPECTRUM.length - 1; i++) {
    const a = SPECTRUM[i];
    const b = SPECTRUM[i + 1];
    if (star >= a.star && star <= b.star) {
      const t = (star - a.star) / (b.star - a.star);
      return [
        Math.round(lerp(a.color[0], b.color[0], t)),
        Math.round(lerp(a.color[1], b.color[1], t)),
        Math.round(lerp(a.color[2], b.color[2], t)),
      ];
    }
  }
  return last.color;
}

export function starColor(star: number): string {
  if (star <= 0.05) return "#aaaaaa";
  return rgb(colorAt(star));
}

export function starTextOn(star: number): string {
  const [r, g, b] = colorAt(star);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.35 ? "#1b1b1b" : "#f2c14e";
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
