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

/**
 * Live performance-points readout for the active difficulty, paired with the
 * playback-speed selector.
 *
 * The pp pill shows the maximum pp the map awards - i.e. a perfect (SS),
 * no-mod play - recomputed from the current notes. The speed selector slows
 * (or restores) the song playback rate. Floats in the bottom-right corner of
 * the editor, just above the song timeline. See {@link maniaMaxPP}.
 */
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
    <div className="absolute bottom-3 right-3 flex select-none items-center gap-2">
      {/* Playback speed (song slows down too) */}
      <div className="flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-900/80 px-3 py-1.5 shadow-lg backdrop-blur-sm">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Speed
        </span>
        <div className="flex overflow-hidden rounded-md border border-ink-500/60">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => onPlaybackRateChange(rate)}
              className={`px-2 py-0.5 text-xs font-medium transition ${
                Math.abs(playbackRate - rate) < 0.001
                  ? "bg-accent text-white"
                  : "bg-ink-700 text-slate-300 hover:bg-ink-600"
              }`}
            >
              {Math.round(rate * 100)}%
            </button>
          ))}
        </div>
      </div>

      {/* Max pp readout */}
      <div className="pointer-events-none rounded-md border border-ink-600 bg-ink-900/80 px-3 py-1.5 text-right shadow-lg backdrop-blur-sm">
        <div className="flex items-baseline gap-1.5">
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
