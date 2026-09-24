import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useT } from "../../lib/i18n";

const OPEN_DELAY_MS = 380;

const CLOSE_DELAY_MS = 140;
const EDGE_GAP = 8;

export function HistoryPopover({
  open,
  onOpenChange,
  available,
  entries,
  current,
  onJump,
  readOnly,
  live,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: boolean;
  entries: string[];
  current: number;
  onJump: (index: number) => void;
  readOnly: boolean;
  live: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef(0);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const cancel = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  }, []);

  const schedule = useCallback(
    (next: boolean, delayMs: number) => {
      cancel();
      timerRef.current = window.setTimeout(() => onOpenChange(next), delayMs);
    },
    [cancel, onOpenChange],
  );

  const close = useCallback(() => {
    cancel();
    onOpenChange(false);
  }, [cancel, onOpenChange]);

  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    if (open && !available) close();
  }, [open, available, close]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = panelRef.current?.offsetWidth ?? 0;
      const wanted = anchor.left + anchor.width / 2 - width / 2;
      setPos({
        left: Math.max(
          EDGE_GAP,
          Math.min(wanted, window.innerWidth - width - EDGE_GAP),
        ),
        top: anchor.bottom + 6,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, entries.length]);

  useLayoutEffect(() => {
    if (!open) return;
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  const rows = entries.map((label, index) => ({ label, index })).reverse();

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={() => available && schedule(true, OPEN_DELAY_MS)}
      onMouseLeave={() => schedule(false, CLOSE_DELAY_MS)}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!next) return;
        if (anchorRef.current?.contains(next) || panelRef.current?.contains(next)) return;
        close();
      }}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="group"
            aria-label={t("undoHistory.title")}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="tooltip-in z-[200] w-72 rounded-xl border border-white/10 bg-ink-800/90 p-2 shadow-2xl ring-1 ring-white/5 backdrop-blur-2xl"
            onMouseEnter={cancel}
            onMouseLeave={() => schedule(false, CLOSE_DELAY_MS)}
          >
            <p className="px-1.5 pb-1.5 text-[10px] uppercase tracking-wide text-slate-500">
              {live ? t("undoHistory.session") : t("undoHistory.title")}
            </p>
            <ol className="flex max-h-72 flex-col gap-0.5 overflow-auto">
              {rows.map(({ label, index }) => (
                <li key={index}>
                  <button
                    type="button"
                    ref={index === current ? currentRef : undefined}
                    disabled={readOnly || index === current}
                    aria-current={index === current ? "step" : undefined}
                    onClick={() => onJump(index)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition disabled:cursor-default ${
                      index === current
                        ? "bg-teal-300/10 text-teal-100"
                        : index > current
                          ? "text-slate-500 hover:bg-white/5 hover:text-slate-300"
                          : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        index === current
                          ? "bg-teal-300"
                          : index > current
                            ? "bg-slate-700"
                            : "bg-slate-600"
                      }`}
                    />
                    <span className="flex-1 truncate">{label}</span>
                    {index === current && (
                      <span className="shrink-0 text-[9px] uppercase tracking-wide text-teal-200/70">
                        {t("undoHistory.now")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
            <p className="px-1.5 pt-1.5 text-[10px] leading-relaxed text-slate-500">
              {readOnly
                ? t("undoHistory.readOnly")
                : t("undoHistory.hint")}
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
}
