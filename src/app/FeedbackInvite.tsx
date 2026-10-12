import { useEffect, useRef, useState } from "react";
import { Toast, type ToastAction } from "../components/ui/Toast";
import { useT } from "../lib/i18n";
import {
  FeedbackInviteTimer,
  loadFeedbackInvite,
  mayInviteFeedback,
  nextRatingQuestion,
  recordFeedbackInviteDismissed,
  recordFeedbackInviteShown,
  recordFeedbackOptOut,
  recordFeedbackSent,
} from "../lib/feedbackInvite";
import {
  answeredRatingQuestions,
  MAX_RATING_COMMENT,
  ratingQuestion,
  submitRating,
  type RatingQuestionId,
} from "../lib/feedbackRatings";

let invitedThisSession = false;

/** A dialog, menu or list someone has open, wherever it came from. */
function somethingOpen(): boolean {
  return !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]');
}

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * An occasional, quiet invitation to share feedback (rules in
 * lib/feedbackInvite). While a 1-10 question hasn't been asked yet it is
 * that question, with an optional follow-up; otherwise it offers the
 * feedback dialog. It shows once the editor has been idle for a while after
 * a finished export or save, never while the mapper is busy, and goes away by
 * itself if they get busy again before touching it. It has no timer: it
 * stays until it is answered or closed, and closing it counts as "Not now".
 */
export function FeedbackInvite({
  busy,
  activity,
  taskKey,
  troubled,
  userId,
  onShare,
}: {
  /** Editing aside, anything the mapper is in the middle of. */
  busy: boolean;
  /** Changes with every edit. */
  activity: unknown;
  /** Goes up after each successful export or save. */
  taskKey: number;
  /** A crash was restored or a save failed this session. */
  troubled: boolean;
  /** The signed-in account, whose answered questions aren't asked again. */
  userId: string | null;
  onShare: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<RatingQuestionId | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = useRef(false);
  /** Questions this account answered anywhere; null until known. */
  const accountAnswers = useRef<ReadonlySet<string> | null>(new Set());
  const timerRef = useRef<FeedbackInviteTimer | null>(null);
  timerRef.current ??= new FeedbackInviteTimer(
    {
      setTimeout: (run, ms) => window.setTimeout(run, ms),
      clearTimeout: (id) => window.clearTimeout(id),
    },
    () => {
      if (invitedThisSession) return "skip";
      if (somethingOpen()) return "wait";
      const now = Date.now();
      const record = loadFeedbackInvite(now);
      if (!record || !mayInviteFeedback(record, now)) return "skip";
      const question = nextRatingQuestion(record, accountAnswers.current);
      if (!recordFeedbackInviteShown(now, undefined, question)) return "skip";
      invitedThisSession = true;
      setRating(question);
      setOpen(true);
      return "shown";
    },
  );

  useEffect(() => {
    if (!userId) {
      accountAnswers.current = new Set();
      return;
    }
    // Unknown until checked: no question is asked that might be a repeat.
    accountAnswers.current = null;
    let live = true;
    answeredRatingQuestions(userId)
      .then((ids) => {
        if (live) accountAnswers.current = ids;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    const timer = timerRef.current;
    const onInput = () => timer?.activity();
    window.addEventListener("keydown", onInput, true);
    window.addEventListener("pointerdown", onInput, true);
    window.addEventListener("wheel", onInput, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", onInput, true);
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("wheel", onInput, true);
      timer?.dispose();
    };
  }, []);

  // Once a score is picked the mapper is answering; it doesn't vanish on them.
  const engaged = score !== null;
  useEffect(() => {
    timerRef.current?.setBusy(busy);
    if (busy && !engaged) setOpen(false);
  }, [busy, engaged]);
  useEffect(() => {
    if (troubled) timerRef.current?.trouble();
  }, [troubled]);
  useEffect(() => {
    if (taskKey > 0) timerRef.current?.taskSucceeded();
  }, [taskKey]);
  useEffect(() => {
    timerRef.current?.activity();
  }, [activity]);
  useEffect(() => {
    if (!thanks) return;
    const timer = window.setTimeout(() => setOpen(false), 2500);
    return () => window.clearTimeout(timer);
  }, [thanks]);

  const notNow: ToastAction = {
    label: t("feedbackInvite.notNow"),
    onClick: () => {
      answered.current = true;
      recordFeedbackInviteDismissed();
    },
  };
  const never: ToastAction = {
    label: t("feedbackInvite.never"),
    onClick: () => {
      answered.current = true;
      recordFeedbackOptOut();
    },
  };
  const question = rating ? ratingQuestion(rating) : null;

  const send = async () => {
    if (!rating || score === null) return;
    answered.current = true;
    setSending(true);
    setError(null);
    try {
      await submitRating({ question: rating, score, comment: comment.trim() });
      recordFeedbackSent();
      setThanks(true);
    } catch (err) {
      setError(t("rating.failed", { detail: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSending(false);
    }
  };

  const actions: ToastAction[] = !question
    ? [
        {
          label: t("feedbackInvite.share"),
          primary: true,
          onClick: () => {
            answered.current = true;
            onShare();
          },
        },
        notNow,
        never,
      ]
    : thanks
      ? []
      : score === null
        ? [notNow, never]
        : [
            {
              label: sending ? t("rating.sending") : t("rating.send"),
              primary: true,
              disabled: sending,
              keepOpen: true,
              onClick: () => void send(),
            },
            notNow,
          ];

  return (
    <Toast
      open={open}
      tone={thanks ? "success" : "info"}
      title={thanks ? null : question ? t(question.question) : t("feedbackInvite.title")}
      message={thanks ? t("rating.thanks") : question ? null : t("feedbackInvite.body")}
      durationMs={null}
      showProgress={false}
      resetKey="feedback-invite"
      actions={actions}
      onClose={() => {
        if (!answered.current) recordFeedbackInviteDismissed();
      }}
      onDismiss={() => setOpen(false)}
    >
      {question && !thanks && (
        <div className="mt-2">
          <div role="group" aria-label={t("rating.scale")} className="flex gap-1">
            {SCORES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={score === value}
                aria-label={t("rating.score", { score: value })}
                onClick={() => setScore(value)}
                className={`h-7 min-w-0 flex-1 rounded-md border text-xs font-semibold tabular-nums outline-none transition-colors duration-[var(--motion-quick)] focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  score === value
                    ? "border-accent bg-accent text-ink-900"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between gap-3 text-[10px] text-slate-400" aria-hidden>
            <span>{t(question.low)}</span>
            <span>{t(question.high)}</span>
          </div>
          {score !== null && (
            <label className="mt-2 block text-xs text-slate-300">
              {t(question.followUp)}{" "}
              <span className="text-slate-500">({t("rating.optional")})</span>
              <textarea
                value={comment}
                maxLength={MAX_RATING_COMMENT}
                rows={2}
                onChange={(event) => setComment(event.target.value)}
                className="mt-1 block w-full resize-none rounded-md border border-white/10 bg-ink-900/70 p-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="mt-1.5 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </Toast>
  );
}
