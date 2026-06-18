import { useMemo } from "react";
import type { ManiaNote } from "../types";
import { computeStarRating, starColor } from "../lib/starRating";
import { maniaMaxPP } from "../lib/performance";

type Props = {
  notes: ManiaNote[];
  keyCount: number;
};

/**
 * Live performance-points readout for the active difficulty.
 *
 * Shows the maximum pp the map awards — i.e. a perfect (SS), no-mod play —
 * recomputed from the current notes. Floats in the bottom-right corner of the
 * editor, just above the song timeline. See {@link maniaMaxPP}.
 */
export function PPCounter({ notes, keyCount }: Props) {
  const { star, pp } = useMemo(() => {
    const star = computeStarRating(notes, keyCount);
    return { star, pp: maniaMaxPP(star, notes) };
  }, [notes, keyCount]);

  const color = starColor(star);

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 select-none rounded-md border border-ink-600 bg-ink-900/80 px-3 py-1.5 text-right shadow-lg backdrop-blur-sm">
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-base font-bold leading-none tabular-nums"
          style={{ color }}
        >
          {Math.round(pp)}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          pp
        </span>
      </div>
      <div className="mt-0.5 text-[10px] text-slate-500">max · SS</div>
    </div>
  );
}
