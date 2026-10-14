import { useDeferredValue, useMemo } from "react";
import type { ManiaNote } from "../types";
import { computeStarRating } from "../lib/starRating";
import { maniaMaxPP } from "../lib/performance";
import { useT } from "../lib/i18n";

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1] as const;

type Props = {
  embedded?: boolean;
  notes: ManiaNote[];
  keyCount: number;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
};

export function PPCounter({
  embedded,
  notes,
  keyCount,
  playbackRate,
  onPlaybackRateChange,
}: Props) {
  const t = useT();
  // Trails an edit by a render, so placing a note on a huge map is not held
  // up by working out its star rating.
  const deferredNotes = useDeferredValue(notes);
  const pp = useMemo(() => {
    const star = computeStarRating(deferredNotes, keyCount);
    return maniaMaxPP(star, deferredNotes);
  }, [deferredNotes, keyCount]);

  return (
    <div className={`${embedded ? "flex flex-wrap" : "absolute bottom-3 right-3 flex"} select-none items-stretch gap-1.5 transition-opacity duration-300`}>
      <div className="float-chip flex items-center gap-2 py-1 pl-2.5 pr-1">
        <span className="text-2xs font-medium text-slate-400">{t("pp.speed")}</span>
        <div className="flex gap-0.5 rounded-md bg-black/30 p-0.5">
          {PLAYBACK_RATES.map((rate) => {
            const on = Math.abs(playbackRate - rate) < 0.001;
            // Anything below full speed is lit in the accent: it is a state
            // the mapper must not forget they are in.
            const slowed = on && rate < 1;
            return (
              <button
                key={rate}
                onClick={() => onPlaybackRateChange(rate)}
                aria-pressed={on}
                className={`h-6 rounded px-2 text-xs font-medium tabular-nums transition ${
                  slowed
                    ? "bg-accent text-white"
                    : on
                      ? "bg-ink-500 text-slate-50 shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
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
          <span className="font-display text-lg font-bold leading-none tabular-nums text-slate-50">
            {Math.round(pp)}
          </span>
          <span className="text-2xs font-semibold text-slate-400">pp</span>
        </div>
        <div className="mt-0.5 text-[10px] leading-none text-slate-500">{t("pp.maxSs")}</div>
      </div>
    </div>
  );
}
