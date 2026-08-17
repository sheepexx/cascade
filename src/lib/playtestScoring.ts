import {
  emptyJudgementCounts,
  type HitResult,
  type JudgementCounts,
  type ManiaJudgement,
} from "./playtestJudgements";

export const JUDGEMENT_WEIGHTS: Record<ManiaJudgement, number> = {
  max: 320,
  "300": 300,
  "200": 200,
  "100": 100,
  "50": 50,
  miss: 0,
};

export const ACCURACY_WEIGHTS: Record<ManiaJudgement, number> = {
  max: 300,
  "300": 300,
  "200": 200,
  "100": 100,
  "50": 50,
  miss: 0,
};

export function addJudgement(
  counts: JudgementCounts,
  judgement: ManiaJudgement,
): JudgementCounts {
  return { ...counts, [judgement]: counts[judgement] + 1 };
}

export function accuracyFromCounts(counts: JudgementCounts): number {
  const total = judgementCount(counts);
  if (total === 0) return 100;
  const weighted = (Object.keys(counts) as ManiaJudgement[]).reduce(
    (sum, j) => sum + counts[j] * ACCURACY_WEIGHTS[j],
    0,
  );
  return (weighted / (total * ACCURACY_WEIGHTS.max)) * 100;
}

export function judgementCount(counts: JudgementCounts): number {
  return (
    counts.max +
    counts["300"] +
    counts["200"] +
    counts["100"] +
    counts["50"] +
    counts.miss
  );
}

export function scoreFromCounts(counts: JudgementCounts): number {
  const total = judgementCount(counts);
  if (total === 0) return 0;
  const weighted = (Object.keys(counts) as ManiaJudgement[]).reduce(
    (sum, judgement) => sum + counts[judgement] * JUDGEMENT_WEIGHTS[judgement],
    0,
  );
  return Math.round((weighted / (total * JUDGEMENT_WEIGHTS.max)) * 1_000_000);
}

export function scoreFromResults(results: HitResult[]): number {
  if (!results.length) return 0;
  const counts = emptyJudgementCounts();
  for (const result of results) counts[result.judgement] += 1;
  return scoreFromCounts(counts);
}

export function initialCounts(): JudgementCounts {
  return emptyJudgementCounts();
}
