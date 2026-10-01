import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, Field } from "../ui/Controls";
import { useAuth } from "../../lib/auth";
import { submitFeedback } from "../../lib/feedback";
import { useT } from "../../lib/i18n";
import { trackDiscord } from "../../lib/discordLink";
import { DISCORD_INVITE } from "../../lib/siteAssets";

export function FeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<null | "saving" | "done" | "error">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBody("");
    setStatus(null);
    setError(null);
  }, [open]);

  const send = async () => {
    if (!user || !body.trim()) return;
    setStatus("saving");
    setError(null);
    try {
      await submitFeedback({
        userId: user.id,
        username: user.username,
        osuId: user.osu_id,
        body: body.trim(),
      });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("feedback.failed"));
      setStatus("error");
    }
  };

  return (
    <Modal
      open={open}
      title={t("feedback.title")}
      onClose={onClose}
      width="max-w-lg"
      footer={
        status === "done" ? (
          <Button variant="accent" onClick={onClose}>
            {t("common.done")}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              variant="accent"
              onClick={() => void send()}
              disabled={!user || !body.trim() || status === "saving"}
            >
              {status === "saving" ? t("feedback.sending") : t("app.sendFeedback")}
            </Button>
          </>
        )
      }
    >
      {!user ? (
        <div className="flex flex-col gap-3 text-sm text-slate-400">
          <p>{t("feedback.signIn")}</p>
          <p>
            {t("feedback.noAccount")}{" "}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackDiscord("feedback")}
              className="font-medium text-slate-200 underline decoration-ink-500 underline-offset-2 transition hover:text-white"
            >
              {t("startModal.joinDiscord")}
            </a>
          </p>
        </div>
      ) : status === "done" ? (
        <p className="text-sm text-slate-300">{t("feedback.sent")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label={t("feedback.message")}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={7}
              className="resize-none rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/10 outline-none transition focus:border-accent/70 focus:ring-1 focus:ring-accent/40"
            />
          </Field>
          <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>
              {t("feedback.preferChat")}{" "}
              <a
                href={DISCORD_INVITE}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackDiscord("feedback")}
                className="font-medium text-slate-300 underline decoration-ink-500 underline-offset-2 transition hover:text-white"
              >
                {t("startModal.joinDiscord")}
              </a>
            </span>
            <span>{body.length}/4000</span>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
