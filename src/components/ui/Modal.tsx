import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer (e.g. action buttons). */
  footer?: ReactNode;
  width?: string;
};

/** Centered modal dialog with backdrop, Esc-to-close and a scrollable body. */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "max-w-md",
}: Props) {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[85vh] w-full ${width} flex-col overflow-hidden rounded-2xl border border-ink-500/60 bg-ink-800 shadow-2xl`}
      >
        <header className="flex items-center justify-between border-b border-ink-600 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-ink-600 hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-ink-600 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
