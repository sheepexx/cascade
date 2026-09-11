import { CloseIcon } from "./Icons";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Dismiss = (afterExit?: () => void) => void;

type Props = {
  open?: boolean;
  durationMs?: number | null;
  onDismiss?: () => void;
  resetKey?: string | number | null;
  placement?: "stack" | "bottom-center" | "top-center" | "right" | "overlay";
  className?: string;
  progressClassName?: string;
  showProgress?: boolean;
  showClose?: boolean;
  children: ReactNode | ((controls: { dismiss: Dismiss }) => ReactNode);
};

/**
 * A notification whose progress animation owns its lifetime. The content stays
 * mounted for the exit animation, so removing a toast never makes it pop away.
 */
export function TimedNotification({
  open = true,
  durationMs = 3500,
  onDismiss,
  resetKey = null,
  placement = "stack",
  className = "",
  progressClassName = "bg-accent",
  showProgress = true,
  showClose = false,
  children,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const [cycle, setCycle] = useState(0);
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;
  const contentRef = useRef(children);
  if (open || !mounted) contentRef.current = children;
  const dismissAfterExitRef = useRef(false);
  const afterExitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      dismissAfterExitRef.current = false;
      afterExitRef.current = null;
      setMounted(true);
      setExiting(false);
      setCycle((value) => value + 1);
    } else if (mountedRef.current) {
      dismissAfterExitRef.current = false;
      setExiting(true);
    }
  }, [open, resetKey]);

  const dismiss: Dismiss = (afterExit) => {
    if (exiting) return;
    dismissAfterExitRef.current = true;
    afterExitRef.current = afterExit ?? null;
    setExiting(true);
  };

  const timed = typeof durationMs === "number" && durationMs > 0;

  useEffect(() => {
    if (!mounted || exiting || !open || showProgress || !timed) return;
    const timer = window.setTimeout(() => {
      dismissAfterExitRef.current = true;
      afterExitRef.current = null;
      setExiting(true);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [cycle, durationMs, exiting, mounted, open, showProgress, timed]);

  if (!mounted) return null;

  const selfPositioned =
    placement === "bottom-center" ||
    placement === "top-center" ||
    placement === "overlay";

  const progressStyle = timed
    ? ({ "--notification-duration": `${durationMs}ms` } as CSSProperties)
    : undefined;

  return (
    <div
      key={cycle}
      data-placement={placement}
      data-state={exiting ? "out" : "in"}
      className={`notification-shell ${
        selfPositioned ? "" : "relative"
      } overflow-hidden ${className}`}
      role="status"
      aria-live="polite"
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget || !exiting) return;
        setMounted(false);
        if (!dismissAfterExitRef.current) return;
        const callback = afterExitRef.current ?? onDismiss;
        dismissAfterExitRef.current = false;
        afterExitRef.current = null;
        callback?.();
      }}
    >
      {typeof contentRef.current === "function"
        ? contentRef.current({ dismiss })
        : contentRef.current}
      {showClose && (
        <button
          type="button"
          onClick={() => dismiss()}
          className="absolute right-2 top-1.5 z-10 grid h-5 w-5 place-items-center rounded text-current opacity-60 transition hover:bg-white/10 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      )}
      {showProgress && (
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/20"
          aria-hidden
        >
          <span
            style={progressStyle}
            onAnimationEnd={() => {
              if (timed && !exiting) dismiss();
            }}
            className={`block h-full w-full ${progressClassName} ${
              timed
                ? "notification-progress"
                : "notification-progress-indeterminate"
            }`}
          />
        </span>
      )}
    </div>
  );
}
