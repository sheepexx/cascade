import { useEffect, useRef, useState } from "react";
import { Toast } from "../components/ui/Toast";
import { useT } from "../lib/i18n";
import {
  FeedbackInviteTimer,
  loadFeedbackInvite,
  mayInviteFeedback,
  recordFeedbackInviteDismissed,
  recordFeedbackInviteShown,
  recordFeedbackOptOut,
} from "../lib/feedbackInvite";

let invitedThisSession = false;

/** A dialog, menu or list someone has open, wherever it came from. */
function somethingOpen(): boolean {
  return !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]');
}

/**
 * An occasional, quiet invitation to share feedback (rules in
 * lib/feedbackInvite). It shows once the editor has been idle for a while
 * after a finished export or save, never while the mapper is busy, and goes
 * away by itself if they get busy again. It has no timer: it stays until it
 * is answered or closed, and closing it counts as "Not now".
 */
export function FeedbackInvite({
  busy,
  activity,
  taskKey,
  troubled,
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
  onShare: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const answered = useRef(false);
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
      if (!mayInviteFeedback(loadFeedbackInvite(now), now)) return "skip";
      if (!recordFeedbackInviteShown(now)) return "skip";
      invitedThisSession = true;
      setOpen(true);
      return "shown";
    },
  );

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

  useEffect(() => {
    timerRef.current?.setBusy(busy);
    if (busy) setOpen(false);
  }, [busy]);
  useEffect(() => {
    if (troubled) timerRef.current?.trouble();
  }, [troubled]);
  useEffect(() => {
    if (taskKey > 0) timerRef.current?.taskSucceeded();
  }, [taskKey]);
  useEffect(() => {
    timerRef.current?.activity();
  }, [activity]);

  return (
    <Toast
      open={open}
      tone="info"
      title={t("feedbackInvite.title")}
      message={t("feedbackInvite.body")}
      durationMs={null}
      showProgress={false}
      resetKey="feedback-invite"
      actions={[
        {
          label: t("feedbackInvite.share"),
          primary: true,
          onClick: () => {
            answered.current = true;
            onShare();
          },
        },
        {
          label: t("feedbackInvite.notNow"),
          onClick: () => {
            answered.current = true;
            recordFeedbackInviteDismissed();
          },
        },
        {
          label: t("feedbackInvite.never"),
          onClick: () => {
            answered.current = true;
            recordFeedbackOptOut();
          },
        },
      ]}
      onClose={() => {
        if (!answered.current) recordFeedbackInviteDismissed();
      }}
      onDismiss={() => setOpen(false)}
    />
  );
}
