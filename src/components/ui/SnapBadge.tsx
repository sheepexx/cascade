import { formatSnap, patternSnap, type PatternNote } from "../../lib/patterns";
import { gridLineColor } from "../../lib/timing";

function channels(color: string): string {
  const parts = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return parts ? `${parts[1]},${parts[2]},${parts[3]}` : "255,255,255";
}

export function SnapBadge({ pattern }: { pattern: PatternNote[] }) {
  const divisor = patternSnap(pattern);
  if (divisor === null) return null;
  const rgb = channels(gridLineColor(1, divisor));
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[10px] font-semibold leading-none"
      style={{ background: `rgba(${rgb},0.16)`, color: `rgb(${rgb})` }}
      title={`Snapped to ${formatSnap(divisor)}. Pasting keeps the snap, not the millisecond spacing.`}
    >
      {formatSnap(divisor)}
    </span>
  );
}
