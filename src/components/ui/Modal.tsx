import { useEffect, useId, useState, type ReactNode } from "react";
import { useDialog } from "../../hooks/useDialog";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  center?: boolean;
  slideUp?: boolean;
};

const EXIT_MS = 220;
const SLIDE_EXIT_MS = 300;

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "max-w-md",
  center = false,
  slideUp = false,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const panelRef = useDialog(open && mounted);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = window.setTimeout(
      () => {
        setMounted(false);
        setClosing(false);
      },
      slideUp ? SLIDE_EXIT_MS : EXIT_MS,
    );
    return () => window.clearTimeout(id);
  }, [open, mounted, slideUp]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      // Anchored near the top rather than vertically centred: centring makes
      // the whole panel slide every time its content grows or shrinks (tab
      // switches, async content), which reads as the dialog jumping around.
      // Pinning the top edge means only the bottom edge ever moves.
      className={`fixed inset-0 flex justify-center bg-ink-900/72 p-4 backdrop-blur-md ${
        slideUp ? "overflow-hidden" : "overflow-y-auto"
      } ${center ? "items-center" : "items-start pt-[max(1rem,8vh)]"} ${
        closing
          ? "pointer-events-none z-40 modal-backdrop-out"
          : "z-50 modal-backdrop-in"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[84vh] w-full ${width} flex-col overflow-hidden rounded-2xl bg-ink-800 shadow-[0_28px_90px_rgba(0,0,0,0.56)] outline-none ${
          closing
            ? slideUp
              ? "modal-panel-up-out"
              : "modal-panel-out"
            : slideUp
              ? "modal-panel-up-in"
              : "modal-panel-in"
        }`}
      >
        <header className="flex items-center justify-between border-b border-white/10 bg-ink-700 px-5 py-3.5">
          <h2 id={titleId} className="text-sm font-semibold text-slate-100">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-white/10 bg-ink-700 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

