import { useMemo } from "react";
import type { ManiaNote } from "../types";
import { computeStarRating } from "../lib/starRating";
import { maniaMaxPP } from "../lib/performance";

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1] as const;

type Props = {
  notes: ManiaNote[];
  keyCount: number;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
};

export function PPCounter({
  notes,
  keyCount,
  playbackRate,
  onPlaybackRateChange,
}: Props) {
  const pp = useMemo(() => {
    const star = computeStarRating(notes, keyCount);
    return maniaMaxPP(star, notes);
  }, [notes, keyCount]);

  return (
    <div className="absolute bottom-3 right-3 flex select-none items-stretch gap-2 transition-opacity duration-300">
      <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-900/62 px-3 py-1.5 shadow-xl shadow-black/25 backdrop-blur-xl">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Speed
        </span>
        <div className="flex overflow-hidden rounded-md border border-white/10">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => onPlaybackRateChange(rate)}
              className={`px-2 py-0.5 text-xs font-medium transition ${
                Math.abs(playbackRate - rate) < 0.001
                  ? "bg-accent/90 text-white shadow-inner shadow-white/10"
                  : "bg-ink-700/70 text-slate-300 hover:bg-white/10"
              }`}
            >
              {Math.round(rate * 100)}%
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none flex flex-col justify-center rounded-md border border-white/10 bg-ink-900/62 px-3 py-1.5 text-right shadow-xl shadow-black/25 backdrop-blur-xl">
        <div className="flex items-baseline justify-end gap-1.5">
          <span className="text-base font-bold leading-none tabular-nums text-slate-100">
            {Math.round(pp)}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            pp
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-slate-500">max · SS</div>
      </div>
    </div>
  );
}
