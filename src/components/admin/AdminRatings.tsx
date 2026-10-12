import { useEffect, useMemo, useState } from "react";
import {
  listRatings,
  ratingQuestion,
  summarizeRatings,
  type FeedbackRating,
  type RatingSummary,
} from "../../lib/feedbackRatings";
import { useT } from "../../lib/i18n";
import { SkeletonRows } from "../ui/Skeleton";
import { formatMoment } from "./format";

function useQuestionText() {
  const t = useT();
  return (id: string) => {
    const question = ratingQuestion(id);
    return question ? t(question.question) : id;
  };
}

/** Ten bars, one per score, on a shared baseline; each names its count on hover. */
function Distribution({ summary }: { summary: RatingSummary }) {
  const peak = Math.max(1, ...summary.distribution);
  return (
    <div>
      <div className="flex h-16 items-end gap-0.5" role="img" aria-label={summary.distribution.map((n, i) => `${i + 1}: ${n}`).join(", ")}>
        {summary.distribution.map((count, i) => (
          <div
            key={i}
            title={`${i + 1}/10: ${count} ${count === 1 ? "rating" : "ratings"}`}
            className="group flex h-full flex-1 items-end"
          >
            <div
              className="w-full rounded-t-[4px] bg-accent/80 transition-colors group-hover:bg-accent"
              style={{ height: count ? `${Math.max(6, (count / peak) * 100)}%` : "2px", opacity: count ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-center text-[10px] tabular-nums text-slate-500" aria-hidden>
        {summary.distribution.map((_, i) => (
          <span key={i} className="flex-1">
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

function Author({ rating }: { rating: FeedbackRating }) {
  if (!rating.user_id) return <span className="text-slate-500">Signed out</span>;
  return rating.author_osu_id ? (
    <a
      href={`https://osu.ppy.sh/users/${rating.author_osu_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-accent hover:underline"
    >
      {rating.author_username ?? "unknown"}
    </a>
  ) : (
    <span>{rating.author_username ?? "unknown"}</span>
  );
}

function RatingRow({ rating, showQuestion, showAuthor }: { rating: FeedbackRating; showQuestion: boolean; showAuthor: boolean }) {
  const questionText = useQuestionText();
  return (
    <li className="flex gap-3 border-t border-ink-600 py-2.5 first:border-t-0 first:pt-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-700 text-sm font-semibold tabular-nums text-slate-100">
        {rating.score}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
          {showAuthor && <Author rating={rating} />}
          <span>{formatMoment(rating.created_at)}</span>
          {rating.app_version && <span>v{rating.app_version}</span>}
          {rating.platform && <span>{rating.platform}</span>}
        </div>
        {showQuestion && <p className="mt-0.5 text-xs text-slate-400">{questionText(rating.question)}</p>}
        {rating.comment ? (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-200">{rating.comment}</p>
        ) : (
          <p className="mt-0.5 text-xs italic text-slate-600">No comment</p>
        )}
      </div>
    </li>
  );
}

/**
 * The 1-10 ratings in the Feedback tab: per question, how many answered, the
 * average and the spread of scores; then the answers to the chosen question,
 * newest first, signed-in and signed-out alike.
 */
export function RatingsOverview() {
  const questionText = useQuestionText();
  const [ratings, setRatings] = useState<FeedbackRating[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    listRatings()
      .then(setRatings)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load ratings."));
  }, []);

  const summaries = useMemo(() => (ratings ? summarizeRatings(ratings) : []), [ratings]);
  const shown = selected ?? summaries.find((s) => s.count > 0)?.question ?? null;
  const answers = ratings?.filter((r) => r.question === shown) ?? [];

  return (
    <section className="mb-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Ratings</h2>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!ratings && !error && <SkeletonRows count={2} lines={2} action={false} label="Loading ratings" />}
      {ratings && ratings.length === 0 && <p className="text-sm text-slate-400">No ratings yet.</p>}
      {ratings && ratings.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summaries.map((summary) => (
              <button
                key={summary.question}
                type="button"
                onClick={() => setSelected(summary.question)}
                aria-pressed={shown === summary.question}
                className={`flex flex-col rounded-lg border p-3 text-left transition-colors ${
                  shown === summary.question
                    ? "border-accent/60 bg-ink-700"
                    : "border-ink-600 bg-ink-900/40 hover:border-ink-500"
                }`}
              >
                <p className="text-xs text-slate-300">{questionText(summary.question)}</p>
                <p className="mt-auto flex items-baseline gap-2 pt-2">
                  <span className="text-2xl font-semibold tabular-nums text-slate-100">
                    {summary.average === null ? "–" : summary.average.toFixed(1)}
                  </span>
                  <span className="text-xs text-slate-500">
                    average · {summary.count} {summary.count === 1 ? "answer" : "answers"}
                  </span>
                </p>
                <div className="mt-2">
                  <Distribution summary={summary} />
                </div>
              </button>
            ))}
          </div>
          {shown && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-medium text-slate-400">
                Answers: {questionText(shown)}
              </h3>
              {answers.length === 0 ? (
                <p className="text-sm text-slate-500">No answers to this question yet.</p>
              ) : (
                <ul>
                  {answers.map((rating) => (
                    <RatingRow key={rating.id} rating={rating} showQuestion={false} showAuthor />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** One account's ratings, on its page in the Users tab. */
export function UserRatingsSection({ userId }: { userId: string }) {
  const [ratings, setRatings] = useState<FeedbackRating[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRatings(null);
    listRatings(userId)
      .then(setRatings)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load ratings."));
  }, [userId]);

  return (
    <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Ratings</h2>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!ratings && !error && <SkeletonRows count={1} lines={2} action={false} label="Loading ratings" />}
      {ratings && ratings.length === 0 && (
        <p className="text-sm text-slate-500">No ratings from this account.</p>
      )}
      {ratings && ratings.length > 0 && (
        <ul>
          {ratings.map((rating) => (
            <RatingRow key={rating.id} rating={rating} showQuestion showAuthor={false} />
          ))}
        </ul>
      )}
    </section>
  );
}
