import { describe, expect, it } from "vitest";
import { RATING_QUESTIONS, summarizeRatings, type FeedbackRating } from "./feedbackRatings";

const rating = (question: string, score: number): FeedbackRating => ({
  id: `${question}-${score}-${Math.random()}`,
  user_id: null,
  author_username: null,
  author_osu_id: null,
  question,
  score,
  comment: null,
  app_version: null,
  platform: null,
  created_at: "2026-10-12T00:00:00Z",
});

describe("summarizeRatings", () => {
  it("gives every question its count, average and spread, in asking order", () => {
    const summaries = summarizeRatings([rating("recommend", 9), rating("recommend", 7), rating("workflow", 3)]);
    expect(summaries.map((s) => s.question)).toEqual(RATING_QUESTIONS.map((q) => q.id));
    expect(summaries[0]).toMatchObject({ count: 2, average: 8 });
    expect(summaries[0].distribution).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 1, 0]);
    expect(summaries[1]).toMatchObject({ count: 0, average: null });
    expect(summaries[2].distribution[2]).toBe(1);
  });

  it("keeps answers to a question this build doesn't know, after the known ones", () => {
    const summaries = summarizeRatings([rating("future", 5)]);
    expect(summaries.at(-1)).toMatchObject({ question: "future", count: 1, average: 5 });
  });
});
