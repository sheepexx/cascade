import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  modeless?: boolean;
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
  modeless = false,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const panelRef = useDialog(open && mounted && !modeless);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!modeless) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const panel = panelRef.current;
      const width = panel?.offsetWidth ?? 0;
      const height = panel?.offsetHeight ?? 0;
      setPosition({
        left: Math.max(
          8,
          Math.min(window.innerWidth - width - 8, event.clientX - drag.dx),
        ),
        top: Math.max(
          8,
          Math.min(window.innerHeight - height - 8, event.clientY - drag.dy),
        ),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [modeless, panelRef]);

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
        modeless
          ? "pointer-events-none overflow-visible !bg-transparent !p-0 !backdrop-blur-none"
          : slideUp
            ? "overflow-hidden"
            : "overflow-y-auto"
      } ${center ? "items-center" : "items-start pt-[max(1rem,8vh)]"} ${
        closing
          ? "pointer-events-none z-40 modal-backdrop-out"
          : "z-50 modal-backdrop-in"
      }`}
      onMouseDown={(e) => {
        if (!modeless && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={
          modeless
            ? `pointer-events-auto fixed w-[calc(100%_-_2rem)] ${width}`
            : "contents"
        }
        style={
          modeless
            ? position
              ? position
              : {
                  left: "50%",
                  top: "max(1rem, 8vh)",
                  transform: "translateX(-50%)",
                }
            : undefined
        }
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal={modeless ? undefined : true}
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`flex max-h-[84vh] w-full ${modeless ? "" : width} flex-col overflow-hidden rounded-2xl bg-ink-800 shadow-[0_28px_90px_rgba(0,0,0,0.56)] outline-none ${
            closing
              ? slideUp
                ? "modal-panel-up-out"
                : "modal-panel-out"
              : slideUp
                ? "modal-panel-up-in"
                : "modal-panel-in"
          }`}
        >
          <header
            className={`flex items-center justify-between border-b border-white/10 bg-ink-700 px-5 py-3.5 ${
              modeless ? "cursor-move select-none" : ""
            }`}
            onPointerDown={(event) => {
              if (!modeless || event.button !== 0) return;
              const target = event.target as HTMLElement;
              if (target.closest("button, input, select, textarea, a")) return;
              const rect = panelRef.current?.getBoundingClientRect();
              if (!rect) return;
              if (!position) setPosition({ left: rect.left, top: rect.top });
              dragRef.current = {
                dx: event.clientX - rect.left,
                dy: event.clientY - rect.top,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
          >
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
    </div>
  );
}

