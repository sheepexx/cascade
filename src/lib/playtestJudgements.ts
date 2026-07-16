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

export const RELEASE_WINDOW_SCALE = 1.5;

export function maniaReleaseWindows(od: number): JudgementWindows {
  const w = maniaJudgementWindows(od);
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
