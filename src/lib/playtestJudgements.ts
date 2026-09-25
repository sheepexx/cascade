export type ManiaJudgement = "max" | "300" | "200" | "100" | "50" | "miss";

export type JudgementCounts = Record<ManiaJudgement, number>;

export type JudgementWindows = {
  max: number;
  hit300: number;
  hit200: number;
  hit100: number;
  hit50: number;
  miss: number;
};

export type HitResult = {
  noteId: string;
  column: number;
  time: number;
  hitError: number;
  judgement: ManiaJudgement;
  part: "rice" | "ln-head" | "ln-tail";
};

export type PlaytestState = {
  active: boolean;
  startTime: number;
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  unstableRate: number;
  judgements: JudgementCounts;
  hitResults: HitResult[];
  judgedCount?: number;
  meanError?: number;
  currentHealth?: number;
};

export const EMPTY_JUDGEMENT_COUNTS: JudgementCounts = {
  max: 0,
  "300": 0,
  "200": 0,
  "100": 0,
  "50": 0,
  miss: 0,
};

/** A window's width at OD 0, 5 and 10, as osu!'s DifficultyRange takes it. */
type WindowRange = readonly [od0: number, od5: number, od10: number];

// osu!lazer's ManiaHitWindows (osu.Game.Rulesets.Mania/Scoring). MAX now
// narrows with OD like the rest; stable's fixed 16 ms only survives in
// lazer's Classic mod.
const MAX_RANGE: WindowRange = [22.4, 19.4, 13.9];
const HIT300_RANGE: WindowRange = [64, 49, 34];
const HIT200_RANGE: WindowRange = [97, 82, 67];
const HIT100_RANGE: WindowRange = [127, 112, 97];
const HIT50_RANGE: WindowRange = [151, 136, 121];
const MISS_RANGE: WindowRange = [188, 173, 158];

/** IBeatmapDifficultyInfo.DifficultyRange: linear from OD 0 to 5 and 5 to 10. */
function difficultyRange(od: number, [od0, od5, od10]: WindowRange): number {
  if (od > 5) return od5 + ((od10 - od5) * (od - 5)) / 5;
  if (od < 5) return od5 + ((od5 - od0) * (od - 5)) / 5;
  return od5;
}

/**
 * osu!mania's hit windows for an OD, in song time. `rate` is the playback
 * rate: the song-time windows widen with it so the real-time windows a player
 * has to hit stay the same, which is what ManiaHitWindows.SpeedMultiplier
 * does. Each window is floored and given half a millisecond, as osu! does,
 * so a whole-millisecond error on the edge still counts.
 */
export function maniaJudgementWindows(od: number, rate = 1): JudgementWindows {
  const clamped = Math.max(0, Math.min(10, Number.isFinite(od) ? od : 0));
  const k = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const window = (range: WindowRange) =>
    Math.floor(difficultyRange(clamped, range) * k) + 0.5;
  return {
    max: window(MAX_RANGE),
    hit300: window(HIT300_RANGE),
    hit200: window(HIT200_RANGE),
    hit100: window(HIT100_RANGE),
    hit50: window(HIT50_RANGE),
    miss: window(MISS_RANGE),
  };
}

export const MIN_PLAYTEST_RATE = 0.75;
export const MAX_PLAYTEST_RATE = 2;

export function clampPlaytestRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.max(MIN_PLAYTEST_RATE, Math.min(MAX_PLAYTEST_RATE, rate));
}

/**
 * Scale hit windows for a playback rate. Judging happens in song-time, so to
 * keep the real-time precision a player needs constant (as osu! rate mods do)
 * the song-time windows widen with the rate: at 1.5x a 50 ms real window spans
 * 75 ms of song-time.
 */
export function scaleWindows(
  windows: JudgementWindows,
  rate: number,
): JudgementWindows {
  const k = clampPlaytestRate(rate);
  if (k === 1) return windows;
  return {
    max: windows.max * k,
    hit300: windows.hit300 * k,
    hit200: windows.hit200 * k,
    hit100: windows.hit100 * k,
    hit50: windows.hit50 * k,
    miss: windows.miss * k,
  };
}

/** TailNote.RELEASE_WINDOW_LENIENCE: long note releases get 1.5x the windows. */
export const RELEASE_WINDOW_SCALE = 1.5;

export function maniaReleaseWindows(od: number, rate = 1): JudgementWindows {
  const w = maniaJudgementWindows(od, rate);
  return {
    max: w.max * RELEASE_WINDOW_SCALE,
    hit300: w.hit300 * RELEASE_WINDOW_SCALE,
    hit200: w.hit200 * RELEASE_WINDOW_SCALE,
    hit100: w.hit100 * RELEASE_WINDOW_SCALE,
    hit50: w.hit50 * RELEASE_WINDOW_SCALE,
    miss: w.miss * RELEASE_WINDOW_SCALE,
  };
}

export function judgeHitError(
  hitError: number,
  windows: JudgementWindows,
): ManiaJudgement | null {
  const abs = Math.abs(hitError);
  if (abs <= windows.max) return "max";
  if (abs <= windows.hit300) return "300";
  if (abs <= windows.hit200) return "200";
  if (abs <= windows.hit100) return "100";
  if (abs <= windows.hit50) return "50";
  if (abs <= windows.miss) return "miss";
  return null;
}

export function emptyJudgementCounts(): JudgementCounts {
  return { ...EMPTY_JUDGEMENT_COUNTS };
}
