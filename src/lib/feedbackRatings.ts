import type { MessageKey } from "./i18n/core";
import { isDesktopApp } from "./pwa";
import { getSupabase } from "./supabase";

/**
 * The few things worth asking every mapper, each on a 1-10 scale with a
 * follow-up in their own words. The editor asks one at a time, rarely, in
 * this order, and never the same one twice (lib/feedbackInvite decides when).
 * The ids are stored with each answer; the database only accepts these.
 */
export const RATING_QUESTIONS = [
  {
    id: "recommend",
    question: "rating.recommend.question",
    low: "rating.recommend.low",
    high: "rating.recommend.high",
    followUp: "rating.recommend.followUp",
  },
  {
    id: "reliability",
    question: "rating.reliability.question",
    low: "rating.reliability.low",
    high: "rating.reliability.high",
    followUp: "rating.reliability.followUp",
  },
  {
    id: "workflow",
    question: "rating.workflow.question",
    low: "rating.workflow.low",
    high: "rating.workflow.high",
    followUp: "rating.workflow.followUp",
  },
  {
    id: "missing",
    question: "rating.missing.question",
    low: "rating.missing.low",
    high: "rating.missing.high",
    followUp: "rating.missing.followUp",
  },
] as const satisfies readonly {
  id: string;
  question: MessageKey;
  low: MessageKey;
  high: MessageKey;
  followUp: MessageKey;
}[];

export type RatingQuestionId = (typeof RATING_QUESTIONS)[number]["id"];
export type RatingQuestion = (typeof RATING_QUESTIONS)[number];

export const MAX_RATING_COMMENT = 2000;

export function ratingQuestion(id: string): RatingQuestion | null {
  return RATING_QUESTIONS.find((q) => q.id === id) ?? null;
}

export async function submitRating(input: {
  question: RatingQuestionId;
  score: number;
  comment: string;
}): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("submit_feedback_rating", {
    p_question: input.question,
    p_score: input.score,
    p_comment: input.comment.slice(0, MAX_RATING_COMMENT),
    p_app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null,
    p_platform: isDesktopApp() ? "desktop" : "web",
  });
  if (error) throw new Error(error.message);
}

/** The questions this account has answered, on any device. */
export async function answeredRatingQuestions(userId: string): Promise<Set<string>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("feedback_ratings")
    .select("question")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { question: string }[]).map((row) => row.question));
}

export type FeedbackRating = {
  id: string;
  user_id: string | null;
  author_username: string | null;
  author_osu_id: number | null;
  question: string;
  score: number;
  comment: string | null;
  app_version: string | null;
  platform: string | null;
  created_at: string;
};

/** For the admin panel: every rating, or one account's. */
export async function listRatings(userId?: string): Promise<FeedbackRating[]> {
  const supabase = await getSupabase();
  let query = supabase
    .from("feedback_ratings")
    .select("id,user_id,author_username,author_osu_id,question,score,comment,app_version,platform,created_at")
    .order("created_at", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedbackRating[];
}

export type RatingSummary = {
  question: string;
  count: number;
  average: number | null;
  /** How many answered each score, index 0 for 1 through 9 for 10. */
  distribution: number[];
};

/** Count, average and spread per question, in the order the questions are asked. */
export function summarizeRatings(ratings: readonly FeedbackRating[]): RatingSummary[] {
  const ids = [
    ...RATING_QUESTIONS.map((q) => q.id as string),
    ...new Set(ratings.map((r) => r.question).filter((id) => !ratingQuestion(id))),
  ];
  return ids.map((question) => {
    const scores = ratings
      .filter((r) => r.question === question)
      .map((r) => r.score)
      .filter((s) => Number.isInteger(s) && s >= 1 && s <= 10);
    const distribution = Array.from({ length: 10 }, (_, i) => scores.filter((s) => s === i + 1).length);
    return {
      question,
      count: scores.length,
      average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      distribution,
    };
  });
}
