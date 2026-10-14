import { useEffect, useState } from "react";
import { useT, type MessageKey } from "../../lib/i18n";
import { reportUser, type ProfileCard, type ReportReason } from "../../lib/social";
import { Button } from "../ui/Controls";
import { Dropdown } from "../ui/Dropdown";
import { Modal } from "../ui/Modal";
import { errorText, useNotice } from "./socialUtils";

const REASONS: { value: ReportReason; label: MessageKey }[] = [
  { value: "spam", label: "social.reasonSpam" },
  { value: "harassment", label: "social.reasonHarassment" },
  { value: "inappropriate", label: "social.reasonInappropriate" },
  { value: "impersonation", label: "social.reasonImpersonation" },
  { value: "other", label: "social.reasonOther" },
];

/** Sends a report to Cascade's admins. Reports are private to them. */
export function ReportDialog({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: ProfileCard;
  onClose: () => void;
}) {
  const t = useT();
  const notice = useNotice();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("spam");
    setDetails("");
    setError(null);
  }, [open]);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await reportUser(user.id, reason, details.trim());
      notice({ tone: "success", text: t("social.reportSent") });
      onClose();
    } catch (e) {
      setError(errorText(e, t("social.actionFailed")));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("social.reportTitle", { name: user.username })}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="accent" onClick={() => void submit()} disabled={sending}>
            {sending ? t("common.loading") : t("social.sendReport")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-400">{t("social.reportHint")}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-300">{t("social.reportReason")}</span>
          <Dropdown
            className="w-full"
            aria-label={t("social.reportReason")}
            value={reason}
            onChange={setReason}
            options={REASONS.map((r) => ({ value: r.value, label: t(r.label) }))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-300">{t("social.reportDetails")}</span>
          <textarea
            value={details}
            maxLength={1000}
            rows={4}
            onChange={(e) => setDetails(e.target.value)}
            className="resize-none rounded-md bg-black/25 px-3 py-2 text-sm text-slate-100 ring-1 ring-inset ring-white/[0.08] outline-none transition placeholder:text-slate-500 hover:ring-white/[0.14] focus:bg-black/35 focus:ring-accent/70"
          />
          <span className="self-end text-[11px] tabular-nums text-slate-500">{details.length}/1000</span>
        </label>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </div>
    </Modal>
  );
}
