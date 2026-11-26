import { useDeferredValue, useLayoutEffect, useMemo, useRef } from "react";
import type { ManiaNote } from "../types";
import { computeStarRating } from "../lib/starRating";
import { maniaMaxPP } from "../lib/performance";
import { useT } from "../lib/i18n";
import type { DockCorner } from "../lib/editorDock";
import { reduceMotion } from "../lib/performanceMode";
import { RollingNumber } from "./ui/RollingNumber";
import { useSlidingPlate } from "./ui/useSlidingPlate";

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1] as const;

/** Where each corner puts the chips, inside the playfield area. */
const CORNER_CLASS: Record<DockCorner, string> = {
  "top-left": "left-3 top-3",
  "top-right": "right-3 top-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};

type Props = {
  embedded?: boolean;
  notes: ManiaNote[];
  keyCount: number;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  /** The playfield corner it sits in (Appearance → Arrange panels). */
  corner?: DockCorner;
};

export function PPCounter({
  embedded,
  notes,
  keyCount,
  playbackRate,
  onPlaybackRateChange,
  corner = "bottom-right",
}: Props) {
  const t = useT();
  // Trails an edit by a render, so placing a note on a huge map is not held
  // up by working out its star rating.
  const deferredNotes = useDeferredValue(notes);
  const pp = useMemo(() => {
    const star = computeStarRating(deferredNotes, keyCount);
    return maniaMaxPP(star, deferredNotes);
  }, [deferredNotes, keyCount]);

  const ratesRef = useRef<HTMLDivElement | null>(null);
  const activeRate = PLAYBACK_RATES.find((rate) => Math.abs(playbackRate - rate) < 0.001);
  const slowedRate = activeRate !== undefined && activeRate < 1;
  const plate = useSlidingPlate(
    ratesRef,
    activeRate === undefined ? null : `[data-rate="${activeRate}"]`,
  );

  // Moving to another corner, the chips glide over from where they were.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastRect = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    const previous = lastRect.current;
    if (!el || !previous || embedded || reduceMotion()) return;
    const next = el.getBoundingClientRect();
    const dx = previous.left - next.left;
    const dy = previous.top - next.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
      { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [corner, embedded]);
  useLayoutEffect(() => {
    if (rootRef.current) lastRect.current = rootRef.current.getBoundingClientRect();
  });

  return (
    <div
      ref={rootRef}
      data-corner-widget={embedded ? undefined : "pp"}
      className={`${embedded ? "flex flex-wrap" : `absolute flex ${CORNER_CLASS[corner]}`} select-none items-stretch gap-1.5 transition-opacity duration-300`}
    >
      <div className="float-chip flex items-center gap-2 py-1 pl-2.5 pr-1">
        <span className="text-2xs font-medium text-slate-400">{t("pp.speed")}</span>
        <div ref={ratesRef} className="relative flex gap-0.5 rounded-md bg-black/30 p-0.5">
          {/* One plate slides to the chosen speed; it turns accent once
              playback is slowed, a state the mapper must not forget. */}
          {plate.box && (
            <span
              aria-hidden
              className={`sliding-plate absolute rounded ${
                slowedRate ? "bg-accent" : "bg-ink-500 shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
              } ${plate.settled ? "" : "!transition-none"}`}
              style={plate.style}
            />
          )}
          {PLAYBACK_RATES.map((rate) => {
            const on = Math.abs(playbackRate - rate) < 0.001;
            const slowed = on && rate < 1;
            return (
              <button
                key={rate}
                onClick={() => onPlaybackRateChange(rate)}
                aria-pressed={on}
                data-rate={rate}
                className={`relative h-6 rounded px-2 text-xs font-medium tabular-nums transition-colors duration-200 ${
                  slowed
                    ? "text-white"
                    : on
                      ? "text-slate-50"
                      : "text-slate-400 hover:text-slate-100"
                }`}
              >
                {Math.round(rate * 100)}%
              </button>
            );
          })}
        </div>
      </div>

      <div className="float-chip pointer-events-none flex flex-col justify-center px-3 py-1 text-right">
        <div className="flex items-baseline justify-end gap-1">
          <RollingNumber
            value={Math.round(pp)}
            className="font-display text-lg font-bold leading-none tabular-nums text-slate-50"
          />
          <span className="text-2xs font-semibold text-slate-400">pp</span>
        </div>
        <div className="mt-0.5 text-[10px] leading-none text-slate-500">{t("pp.maxSs")}</div>
      </div>
    </div>
  );
}
