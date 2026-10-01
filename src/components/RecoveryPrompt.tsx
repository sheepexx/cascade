import { TimedNotification } from "./ui/TimedNotification";
import { useLocale } from "../lib/i18n";
import { formatRecoveryTime, type RecoveryHead } from "../lib/recovery";

/**
 * Offers back the work a crash, a closed tab or a reload left unsaved. It
 * stays until it is answered; "Not now" keeps the work in the backup list.
 */
export function RecoveryPrompt({
  offer,
  busy,
  onRestore,
  onDismiss,
}: {
  offer: RecoveryHead | null;
  busy: boolean;
  onRestore: () => void;
  onDismiss: () => void;
}) {
  const { t, locale } = useLocale();
  const title = offer?.title.trim() || t("app.unnamed");
  return (
    <TimedNotification
      open={!!offer}
      durationMs={null}
      resetKey={offer?.projectId ?? null}
      showProgress={false}
      className="pointer-events-auto flex w-full max-w-full items-start gap-3 rounded-xl border border-accent/30 bg-ink-800/95 px-4 py-3 text-sm text-slate-200 shadow-2xl backdrop-blur-xl"
    >
      <span
        aria-hidden
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 8v4l3 2" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-100">{t("recovery.title")}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
          {t("recovery.body", {
            title,
            time: offer ? formatRecoveryTime(offer.updatedAt, locale) : "",
          })}
        </span>
        <span className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onRestore}
            disabled={busy}
            className="rounded-md bg-accent/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-soft/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? t("recovery.restoring") : t("recovery.restore")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {t("recovery.dismiss")}
          </button>
        </span>
      </span>
    </TimedNotification>
  );
}
