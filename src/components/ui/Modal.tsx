import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useDialog } from "../../hooks/useDialog";
import { useScrollEdges } from "../../hooks/useScrollEdges";
import { CloseIcon } from "./Icons";
import { MOTION } from "../../lib/motion";
import { playUiSound } from "../../lib/uiSounds";
import type { CSSProperties } from "react";
import { useT } from "../../lib/i18n";
import { usePhoneViewport } from "../../hooks/usePhoneViewport";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  width?: string;
  /** Fixed panel height (a Tailwind class). A tabbed dialog uses it so every
   * tab is the same size and a centred panel never shifts between them. */
  height?: string;
  center?: boolean;
  slideUp?: boolean;
  modeless?: boolean;
  /** Carries the colour of the action that opened this surface. */
  accent?: string;
  /** Replaces the body's padding, for a dialog that lays out its own panes. */
  bodyClassName?: string;
};

const EXIT_MS = MOTION.exit;
const SLIDE_EXIT_MS = MOTION.exit;

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  headerExtra,
  width = "max-w-md",
  height = "",
  center = true,
  slideUp = false,
  modeless: allowModeless = false,
  accent,
  bodyClassName = "px-5 py-4 [scrollbar-gutter:stable]",
}: Props) {
  const t = useT();
  const phone = usePhoneViewport();
  const modeless = allowModeless && !phone;
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const titleId = useId();
  const panelRef = useDialog(open && mounted && !modeless, !phone);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const { ref: bodyRef, edges } = useScrollEdges<HTMLDivElement>();

  useEffect(() => {
    if (open) playUiSound("open");
    else if (mounted) playUiSound("close");
    // mounted deliberately stays out: sound once on each open edge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const surface = (
    <div
      // Centred by default. `center={false}` pins the top edge instead, for a
      // dialog whose height keeps changing while it is open.
      className={`ui-modal-backdrop fixed inset-0 flex justify-center bg-[rgb(5_5_8/0.66)] p-4 ${
        modeless
          ? "pointer-events-none overflow-visible !bg-transparent !p-0"
          : slideUp
            ? "overflow-hidden"
            : "overflow-y-auto"
      } ${center ? "items-center" : "items-start pt-[max(1rem,8vh)]"} ${
        closing
          ? "pointer-events-none z-40 modal-backdrop-out"
          : "z-50 modal-backdrop-in"
      }`}
      onPointerDown={(e) => {
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
          style={accent ? ({ "--modal-accent": accent } as CSSProperties) : undefined}
          className={`ui-modal flex max-h-[calc(100vh-2rem)] ${height} w-full ${modeless ? "" : width} flex-col overflow-hidden rounded-2xl bg-ink-800 shadow-[var(--shadow-float)] outline-none ring-1 ring-white/[0.08] ${
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
            className={`ui-modal-header relative flex h-12 shrink-0 items-center justify-between gap-3 pl-5 pr-3 ${
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
            <div className="flex min-w-0 items-center gap-2.5">
              {accent && (
                // The colour of the menu tile or tool that opened this
                // surface, as a small lane marker rather than a wash.
                <span
                  aria-hidden
                  className="ui-modal-tick h-3.5 w-[3px] shrink-0 rounded-full bg-[var(--modal-accent)]"
                />
              )}
              <h2
                id={titleId}
                className="ui-modal-title truncate font-display text-[0.9375rem] font-semibold text-slate-50"
              >
                {title}
              </h2>
              {headerExtra}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition duration-[var(--motion-quick)] hover:bg-white/[0.07] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label={t("common.close")}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </header>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <div
              ref={bodyRef}
              className={`modal-body min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}
            >
              {children}
            </div>
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08] transition-opacity duration-[var(--motion-exit)] ${
                edges.top ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-ink-800 to-transparent transition-opacity duration-[var(--motion-exit)] ${
                edges.bottom ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
          {footer && (
            <footer className="ui-modal-footer flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
  return phone ? createPortal(surface, document.body) : surface;
}
