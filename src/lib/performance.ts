import type { ManiaNote } from "../types";

const STAR_OFFSET = 0.15;
const STAR_FLOOR = 0.05;
const STAR_EXPONENT = 2.2;
const BASE_MULTIPLIER = 8.0;
const LENGTH_BONUS_CAP = 1500;

export function totalHitObjects(notes: ManiaNote[]): number {
  let total = 0;
  for (const n of notes) total += n.endTime !== undefined ? 2 : 1;
  return total;
}

export function maniaMaxPP(starRating: number, notes: ManiaNote[]): number {
  if (notes.length === 0 || starRating <= 0) return 0;

  const difficulty = Math.pow(
    Math.max(starRating - STAR_OFFSET, STAR_FLOOR),
    STAR_EXPONENT,
  );
  const lengthBonus =
    1 + 0.1 * Math.min(1, totalHitObjects(notes) / LENGTH_BONUS_CAP);

  return BASE_MULTIPLIER * difficulty * lengthBonus;
}
