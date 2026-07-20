import { useEffect } from "react";
import { Button } from "./Controls";
import { HoldToDelete } from "./HoldToDelete";
import { playUiSound } from "../../lib/uiSounds";

export function HoldConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Hold to delete",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (open) playUiSound("areYouSure");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/72 p-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-ink-800 shadow-[0_28px_90px_rgba(0,0,0,0.56)]">
        <header className="border-b border-white/10 bg-ink-700 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        </header>
        <div className="px-5 py-4 text-sm text-slate-300">{message}</div>
        <footer className="flex justify-end gap-2 border-t border-white/10 bg-ink-700 px-5 py-3.5">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <HoldToDelete
            onConfirm={onConfirm}
            disabled={busy}
            title="Hold to confirm"
            fillClassName="bg-rose-400/80"
            className="rounded-lg border border-rose-700/50 bg-rose-600/90 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "…" : confirmLabel}
          </HoldToDelete>
        </footer>
      </div>
    </div>
  );
}
