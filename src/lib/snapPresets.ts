import { SNAP_DIVISORS } from "../types";

/**
 * Beat divisor presets, after osu!lazer: a short list of divisors to step
 * through with one key, and another key to switch between lists.
 */
export type SnapPresetId = "common" | "triplets" | "custom";

export const SNAP_PRESET_ORDER: SnapPresetId[] = ["common", "triplets", "custom"];

const BUILT_IN: Record<Exclude<SnapPresetId, "custom">, number[]> = {
  common: [1, 2, 4, 8, 16],
  triplets: [1, 3, 6, 12, 24],
};

const MAX_CUSTOM = 12;
const MAX_DIVISOR = SNAP_DIVISORS[SNAP_DIVISORS.length - 1];

/** Reads a list like "1 2 5 10" or "1/5, 1/10": whole divisors the editor offers, sorted, no repeats. */
export function parseCustomDivisors(text: string): number[] {
  const found = new Set<number>();
  for (const part of text.split(/[\s,;]+/)) {
    const value = Number(part.replace(/^1\//, ""));
    if (Number.isInteger(value) && value >= 1 && value <= MAX_DIVISOR) found.add(value);
  }
  return [...found].sort((a, b) => a - b).slice(0, MAX_CUSTOM);
}

export function normalizeCustomDivisors(input: unknown): number[] {
  return Array.isArray(input) ? parseCustomDivisors(input.join(" ")) : [];
}

export function presetDivisors(id: SnapPresetId, custom: number[]): number[] {
  return id === "custom" ? custom : BUILT_IN[id];
}

export function isSnapPresetId(value: unknown): value is SnapPresetId {
  return SNAP_PRESET_ORDER.includes(value as SnapPresetId);
}

/** The next preset, skipping Custom while it's empty. */
export function nextSnapPreset(id: SnapPresetId, custom: number[]): SnapPresetId {
  const usable = SNAP_PRESET_ORDER.filter((p) => presetDivisors(p, custom).length > 0);
  const index = usable.indexOf(id);
  return usable[(index + 1) % usable.length];
}

/** The preset's divisor nearest the current one, preferring the finer on a tie. */
export function closestDivisor(divisors: number[], current: number): number {
  if (!divisors.length) return current;
  if (current <= 0) return divisors[0];
  let best = divisors[0];
  for (const d of divisors) {
    const gap = Math.abs(Math.log2(d) - Math.log2(current));
    const bestGap = Math.abs(Math.log2(best) - Math.log2(current));
    if (gap < bestGap || (gap === bestGap && d > best)) best = d;
  }
  return best;
}

/**
 * One step finer (1) or coarser (-1) within the preset. A divisor outside the
 * preset, or Free snap, moves to the preset's nearest in that direction; the
 * ends of the list hold rather than wrap.
 */
export function stepDivisor(divisors: number[], current: number, direction: 1 | -1): number {
  if (!divisors.length) return current;
  if (current <= 0) return direction === 1 ? divisors[0] : divisors[divisors.length - 1];
  if (direction === 1) return divisors.find((d) => d > current) ?? divisors[divisors.length - 1];
  return [...divisors].reverse().find((d) => d < current) ?? divisors[0];
}
