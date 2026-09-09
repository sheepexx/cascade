import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export const TOOLTIP_DELAY_MS = 420;

const EDGE_GAP = 10;
const ARROW = 7;

type Placement = "top" | "bottom";

export function Tooltip({
  content,
  children,
  delayMs = TOOLTIP_DELAY_MS,
  className = "",
  underline = true,
}: {
  content: ReactNode;
  children: ReactNode;
  delayMs?: number;
  className?: string;
  underline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({
    left: 0,
    top: 0,
    arrow: 0,
    placement: "bottom" as Placement,
  });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);
  const id = useId();

  const cancel = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  }, []);

  const show = useCallback(
    (immediate: boolean) => {
      cancel();
      if (immediate) {
        setOpen(true);
        return;
      }
      timerRef.current = window.setTimeout(() => setOpen(true), delayMs);
    },
    [cancel, delayMs],
  );

  const hide = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const bubble = bubbleRef.current?.getBoundingClientRect();
      if (!anchor || !bubble) return;

      const below = anchor.bottom + ARROW + 4;
      const above = anchor.top - bubble.height - ARROW - 4;
      const fitsBelow = below + bubble.height + EDGE_GAP <= window.innerHeight;
      const placement: Placement = fitsBelow || above < EDGE_GAP ? "bottom" : "top";

      const wanted = anchor.left + anchor.width / 2 - bubble.width / 2;
      const left = Math.max(
        EDGE_GAP,
        Math.min(wanted, window.innerWidth - bubble.width - EDGE_GAP),
      );
      setPos({
        left,
        top: placement === "bottom" ? below : above,
        arrow: anchor.left + anchor.width / 2 - left,
        placement,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hide]);

  return (
    <>
      <span
        ref={anchorRef}
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => show(false)}
        onMouseLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        className={`cursor-help outline-none transition-colors ${
          underline
            ? "decoration-slate-600 decoration-dotted underline-offset-4 hover:decoration-slate-400 focus-visible:decoration-accent [text-decoration-line:underline]"
            : ""
        } ${className}`}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            ref={bubbleRef}
            style={{ position: "fixed", left: pos.left, top: pos.top }}
            className="tooltip-in pointer-events-none z-[400] w-max max-w-[19rem] rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-[11px] leading-relaxed text-slate-300 shadow-[0_18px_44px_rgba(0,0,0,0.6)]"
          >
            <span
              aria-hidden
              style={{ left: pos.arrow }}
              className={`absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-white/10 bg-ink-800 ${
                pos.placement === "bottom"
                  ? "-top-[6px] border-l border-t"
                  : "-bottom-[6px] border-b border-r"
              }`}
            />
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

export function InfoTip({
  content,
  className = "",
}: {
  content: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip content={content} underline={false} className={`align-middle ${className}`}>
      <span
        role="img"
        aria-label="More information"
        className="inline-flex h-3.5 w-3.5 select-none items-center justify-center rounded-full border border-white/20 text-[9px] font-semibold leading-none text-slate-400 transition-colors hover:border-white/45 hover:text-slate-200"
      >
        i
      </span>
    </Tooltip>
  );
}
