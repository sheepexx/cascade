import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { OsdNotice } from "../../lib/osd";

const VISIBLE_MS = 1600;
const EXIT_MS = 180;

type Phase = "enter" | "in" | "out";

const PHASE_STYLE: Record<Phase, CSSProperties> = {
  enter: { opacity: 0, transform: "translate(-50%, 6px) scale(0.96)" },
  in: {
    opacity: 1,
    transform: "translate(-50%, 0) scale(1)",
    transition:
      "opacity 180ms var(--ease-standard), transform 260ms var(--ease-emphasized)",
  },
  out: {
    opacity: 0,
    transform: "translate(-50%, -4px) scale(0.98)",
    transition: `opacity ${EXIT_MS}ms var(--ease-standard), transform ${EXIT_MS}ms var(--ease-standard)`,
  },
};

/**
 * The editor's on-screen display, after osu!lazer's: a small panel that names
 * the setting a shortcut changed, shows its new value large with a light or a
 * meter under it, and the keys that did it. A change that lands while it is
 * up updates it in place and keeps it up, so holding a key or spinning the
 * wheel does not make it flicker.
 */
export function OnScreenDisplay({
  notice,
  onHidden,
}: {
  notice: (OsdNotice & { id: number }) | null;
  onHidden: () => void;
}) {
  const [shown, setShown] = useState(notice);
  const [phase, setPhase] = useState<Phase>("enter");
  const [pulse, setPulse] = useState(0);
  const visibleRef = useRef(false);
  const labelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const sameSetting = visibleRef.current && labelRef.current === notice.label;
    labelRef.current = notice.label;
    setShown(notice);
    if (sameSetting) setPulse((value) => value + 1);
    let frame = 0;
    if (visibleRef.current) {
      setPhase("in");
    } else {
      visibleRef.current = true;
      setPhase("enter");
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setPhase("in"));
      });
    }
    const hide = window.setTimeout(() => setPhase("out"), VISIBLE_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(hide);
    };
  }, [notice]);

  useEffect(() => {
    if (phase !== "out") return;
    const timer = window.setTimeout(() => {
      visibleRef.current = false;
      labelRef.current = null;
      setShown(null);
      onHidden();
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onHidden]);

  if (!shown) return null;
  const { label, value, indicator, keys } = shown;
  // A plain message has no value; its text then takes the large line.
  const headline = value ?? label;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-[18%] z-[190] w-[15rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-ink-900/85 px-5 pb-4 pt-3.5 text-center shadow-[0_20px_50px_-14px_rgba(0,0,0,0.85)] backdrop-blur-md"
      style={PHASE_STYLE[phase]}
    >
      {value !== undefined && (
        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </div>
      )}
      <div
        key={pulse}
        className={`osd-pop ${
          value !== undefined
            ? "mt-0.5 truncate text-[26px] font-semibold leading-tight tabular-nums text-white"
            : "text-sm font-medium leading-snug text-slate-100"
        }`}
      >
        {headline}
      </div>
      {indicator && (
        <div className="mt-3">
          {indicator.kind === "toggle" ? (
            <div
              className={`mx-auto h-1.5 w-16 rounded-full transition-[background-color,box-shadow] duration-200 ${
                indicator.on
                  ? "bg-accent shadow-[0_0_12px_rgba(232,104,104,0.8)]"
                  : "bg-white/10"
              }`}
            />
          ) : (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent shadow-[0_0_10px_rgba(232,104,104,0.7)] transition-[width] duration-150 ease-out"
                style={{
                  width: `${Math.round(Math.min(1, Math.max(0, indicator.fraction)) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}
      {keys && keys.length > 0 && (
        <div className="mt-3 flex items-center justify-center gap-1">
          {keys.map((key, i) => (
            <kbd
              key={`${key}-${i}`}
              className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] leading-none text-slate-300"
            >
              {key}
            </kbd>
          ))}
        </div>
      )}
    </div>
  );
}
