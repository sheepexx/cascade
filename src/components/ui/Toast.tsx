import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../../lib/i18n";
import { CloseIcon } from "./Icons";
import { TimedNotification } from "./TimedNotification";

export type ToastTone = "info" | "success" | "warning" | "error" | "progress";

export type ToastAction = {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  /** Leave the toast up after the action, e.g. while an update installs. */
  keepOpen?: boolean;
};

const TONES: Record<ToastTone, { shell: string; progress: string; icon: string }> = {
  info: {
    shell: "border-white/10 bg-ink-800/95 text-slate-200 backdrop-blur-xl",
    progress: "bg-accent",
    icon: "bg-accent/15 text-accent",
  },
  progress: {
    shell: "border-white/10 bg-ink-800/95 text-slate-200 backdrop-blur-xl",
    progress: "bg-accent",
    icon: "",
  },
  success: {
    shell: "border-emerald-500/40 bg-emerald-950/90 text-emerald-200",
    progress: "bg-emerald-400",
    icon: "bg-emerald-400/15 text-emerald-300",
  },
  warning: {
    shell: "border-amber-400/40 bg-ink-800/95 text-amber-100 backdrop-blur-xl",
    progress: "bg-amber-400",
    icon: "bg-amber-400/15 text-amber-300",
  },
  error: {
    shell: "border-red-500/40 bg-red-950/90 text-red-200",
    progress: "bg-red-400",
    icon: "bg-red-400/15 text-red-300",
  },
};

const DEFAULT_DURATION: Record<ToastTone, number | null> = {
  info: 4500,
  success: 3500,
  warning: null,
  error: 6500,
  progress: null,
};

/**
 * A notice in the stack at the bottom of the window. The tone sets its colour,
 * icon and how long it stays; errors are announced at once to screen readers.
 * `details` sits behind a toggle with a copy button, and the countdown holds
 * while it is open or while the pointer or focus is on the toast.
 */
export function Toast({
  open = true,
  tone,
  title,
  message,
  details,
  actions = [],
  icon,
  durationMs,
  resetKey = null,
  closable,
  onDismiss,
  onClose,
  children,
}: {
  open?: boolean;
  tone: ToastTone;
  title?: ReactNode;
  message?: ReactNode;
  details?: string | null;
  actions?: ToastAction[];
  /** Replaces the tone's icon; `null` shows none. */
  icon?: ReactNode | null;
  /** `null` stays until dismissed. Defaults by tone. */
  durationMs?: number | null;
  resetKey?: string | number | null;
  closable?: boolean;
  /** After the toast has gone, however it went. */
  onDismiss?: () => void;
  /** When the reader closes it or uses an action, as opposed to a timeout. */
  onClose?: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setExpanded(false);
    setCopied(false);
  }, [resetKey]);

  const style = TONES[tone];
  const canClose = closable ?? tone !== "progress";
  const duration = durationMs === undefined ? DEFAULT_DURATION[tone] : durationMs;
  const shownIcon =
    icon === undefined ? (tone === "progress" ? <Spinner /> : <ToneIcon tone={tone} className={style.icon} />) : icon;

  const copy = () => {
    if (!details) return;
    void navigator.clipboard
      ?.writeText(details)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <TimedNotification
      open={open}
      durationMs={duration}
      onDismiss={onDismiss}
      resetKey={resetKey}
      paused={expanded}
      live={tone === "error" ? "assertive" : "polite"}
      progressClassName={style.progress}
      className={`pointer-events-auto max-w-full rounded-lg border py-2 pb-3 pl-3 text-sm shadow-lg ${
        canClose ? "pr-9" : "pr-4"
      } ${style.shell}`}
    >
      {({ dismiss }) => (
        <div className="flex items-start gap-2.5">
          {shownIcon}
          <div className="min-w-0 flex-1 py-0.5">
            {title && <div className="font-semibold leading-5">{title}</div>}
            {message && (
              <div className={title ? "mt-0.5 text-xs leading-4 opacity-80" : "leading-5"}>
                {message}
              </div>
            )}
            {children}
            {(actions.length > 0 || details) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      action.onClick();
                      if (action.keepOpen) return;
                      onClose?.();
                      dismiss();
                    }}
                    className={
                      action.primary
                        ? "rounded-md bg-accent/90 px-2.5 py-1 text-xs font-semibold text-white transition duration-150 hover:bg-accent-soft/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] disabled:opacity-60"
                        : "rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-current transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60"
                    }
                  >
                    {action.label}
                  </button>
                ))}
                {details && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((value) => !value)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-current opacity-75 transition hover:bg-white/10 hover:opacity-100"
                  >
                    {expanded ? t("toast.hideDetails") : t("toast.showDetails")}
                  </button>
                )}
              </div>
            )}
            {details && expanded && (
              <div className="mt-2 flex flex-col gap-1.5">
                <pre className="max-h-40 max-w-[26rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/30 p-2 font-mono text-[11px] leading-4 opacity-90">
                  {details}
                </pre>
                <button
                  type="button"
                  onClick={copy}
                  className="self-start rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
                >
                  {copied ? t("toast.copied") : t("crash.copyDetails")}
                </button>
              </div>
            )}
          </div>
          {canClose && (
            <button
              type="button"
              onClick={() => {
                onClose?.();
                dismiss();
              }}
              className="absolute right-2 top-1.5 z-10 grid h-5 w-5 place-items-center rounded text-current opacity-60 transition hover:bg-white/10 hover:opacity-100"
              aria-label={t("notification.dismiss")}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </TimedNotification>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-500 border-t-accent"
    />
  );
}

export function ToneIcon({
  tone,
  className = "",
}: {
  tone: Exclude<ToastTone, "progress">;
  className?: string;
}) {
  const path =
    tone === "success"
      ? "m8 12.5 2.5 2.5L16 9.5"
      : tone === "info"
        ? "M12 11v5m0-8.5v.5"
        : tone === "warning"
          ? "M12 8v4.5m0 3v.5"
          : "m9.5 9.5 5 5m0-5-5 5";
  return (
    <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${className}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}
