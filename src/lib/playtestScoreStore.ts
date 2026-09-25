import type { PlaytestEvent } from "./playtestEngine";
import {
  emptyJudgementCounts,
  type HitResult,
  type PlaytestState,
} from "./playtestJudgements";
import { accuracyFromCounts, addJudgement, scoreFromCounts } from "./playtestScoring";

const RECENT_RESULTS = 64;

/**
 * The running score of a playtest, kept outside React state. Judgements land
 * many times a second; putting each in the editor's state re-rendered the
 * whole editor per note, which cost frames and delayed input at exactly the
 * dense moments that matter. Only the HUD subscribes to this.
 *
 * Scoring itself is Cascade's own (see playtestScoring); this only tallies.
 */
export type PlaytestScoreStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PlaytestState;
  reset(startTime: number): void;
  apply(events: readonly PlaytestEvent[]): void;
};

function initialState(startTime: number): PlaytestState {
  return {
    active: true,
    startTime,
    score: 0,
    combo: 0,
    maxCombo: 0,
    accuracy: 100,
    unstableRate: 0,
    judgements: emptyJudgementCounts(),
    hitResults: [],
    judgedCount: 0,
    meanError: 0,
  };
}

export function createPlaytestScoreStore(): PlaytestScoreStore {
  let state = initialState(0);
  let errors = { n: 0, sum: 0, sumSq: 0 };
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    reset(startTime) {
      state = initialState(startTime);
      errors = { n: 0, sum: 0, sumSq: 0 };
      for (const listener of listeners) listener();
    },
    apply(events) {
      if (events.length === 0) return;
      let { combo, maxCombo, judgements, judgedCount = 0 } = state;
      const fresh: HitResult[] = [];
      for (const event of events) {
        if (event.kind === "comboBreak") {
          combo = 0;
          continue;
        }
        const { result } = event;
        judgements = addJudgement(judgements, result.judgement);
        judgedCount += 1;
        fresh.push(result);
        if (result.judgement === "miss") {
          combo = 0;
        } else {
          combo = Math.min(combo + 1, 99999);
          errors.n += 1;
          errors.sum += result.hitError;
          errors.sumSq += result.hitError * result.hitError;
        }
        maxCombo = Math.max(maxCombo, combo);
      }
      const mean = errors.n ? errors.sum / errors.n : 0;
      const unstableRate = errors.n
        ? Math.sqrt(Math.max(0, errors.sumSq / errors.n - mean * mean)) * 10
        : 0;
      state = {
        ...state,
        combo,
        maxCombo,
        judgements,
        judgedCount,
        hitResults: fresh.length
          ? [...state.hitResults, ...fresh].slice(-RECENT_RESULTS)
          : state.hitResults,
        accuracy: accuracyFromCounts(judgements),
        score: scoreFromCounts(judgements),
        unstableRate,
        meanError: mean,
      };
      for (const listener of listeners) listener();
    },
  };
}
