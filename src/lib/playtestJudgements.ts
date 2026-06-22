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
  /** Unstable rate: 10x the standard deviation (ms) of hit errors. */
  unstableRate: number;
  judgements: JudgementCounts;
  hitResults: HitResult[];
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

/**
 * osu!mania (stable) hit windows, in milliseconds, as a half-window each side of
 * a note's exact time. These are the canonical osu!mania stable values, derived
 * straight from the map's Overall Difficulty (OD):
 *
 *   300g (MAX): 16.5            (a fixed, OD-independent "perfect" window)
 *   300       : 64  - 3 * OD
 *   200       : 97  - 3 * OD
 *   100       : 127 - 3 * OD
 *   50        : 151 - 3 * OD
 *   miss      : 188 - 3 * OD    (hit-but-too-late cutoff; beyond this a press
 *                                doesn't register against the note at all)
 *
 * Higher OD tightens every window except 300g, so the same input is judged more
 * harshly on a harder map — exactly as the player set it in the difficulty.
 *
 * Keeping the formula here makes later tuning explicit and avoids burying
 * judgement timing in input code.
 */
export function maniaJudgementWindows(od: number): JudgementWindows {
  const clamped = Math.max(0, Math.min(10, od));
  return {
    max: 16.5,
    hit300: 64 - 3 * clamped,
    hit200: 97 - 3 * clamped,
    hit100: 127 - 3 * clamped,
    hit50: 151 - 3 * clamped,
    miss: 188 - 3 * clamped,
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
