import type { ManiaNote } from "../types";

/**
 * osu!mania performance points (pp).
 *
 * Faithful port of the osu!(lazer) ManiaPerformanceCalculator. The amount of pp
 * a map awards depends on how well it is played, so the headline number editors
 * care about is the *maximum*: the pp earned by a perfect (SS, all-"perfect")
 * no-mod play. That is what `maniaMaxPP` returns.
 *
 * lazer's formula (ManiaPerformanceCalculator.cs):
 *
 *   pp = difficultyValue * multiplier
 *
 *   difficultyValue = 8.0
 *     * pow(max(starRating - 0.15, 0.05), 2.2)   // star rating → pp curve
 *     * max(0, 5 * accuracy - 4)                  // accuracy scaling: nothing
 *                                                 //   below 80%, full at 100%
 *     * (1 + 0.1 * min(1, totalHits / 1500))      // length bonus, capped
 *
 *   multiplier = 1, except 0.75 with NoFail and 0.5 with Easy.
 *
 * `accuracy` is lazer's weighted "custom accuracy"
 *   (320·perfect + 300·great + 200·good + 100·ok + 50·meh) / (320·totalHits).
 * For an SS every hit is a perfect, so accuracy = 1 and (5·acc − 4) = 1.
 *
 * `totalHits` counts each judgement: a normal note is one, a long note is two
 * (its head and its tail are judged separately).
 *
 * Sources (current master):
 *   Difficulty/ManiaPerformanceCalculator.cs
 */

const STAR_OFFSET = 0.15;
const STAR_FLOOR = 0.05;
const STAR_EXPONENT = 2.2;
const BASE_MULTIPLIER = 8.0;
const LENGTH_BONUS_CAP = 1500;

/** Number of judgements in the map: holds are judged at head and tail. */
export function totalHitObjects(notes: ManiaNote[]): number {
  let total = 0;
  for (const n of notes) total += n.endTime !== undefined ? 2 : 1;
  return total;
}

/**
 * Maximum pp the map awards - a perfect (SS), no-mod play.
 * Mirrors lazer with accuracy fixed at 1.0.
 */
export function maniaMaxPP(starRating: number, notes: ManiaNote[]): number {
  if (notes.length === 0 || starRating <= 0) return 0;

  const difficulty = Math.pow(
    Math.max(starRating - STAR_OFFSET, STAR_FLOOR),
    STAR_EXPONENT,
  );
  const lengthBonus =
    1 + 0.1 * Math.min(1, totalHitObjects(notes) / LENGTH_BONUS_CAP);

  // accuracy = 1 for an SS → (5·acc − 4) = 1; no-mod → multiplier = 1.
  return BASE_MULTIPLIER * difficulty * lengthBonus;
}
