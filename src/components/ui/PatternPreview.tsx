import type { PatternNote } from "../../lib/patterns";
import { defaultLaneColour } from "../../lib/laneColours";

export function PatternPreview({
  pattern,
  keyCount,
  size = "normal",
}: {
  pattern: PatternNote[];
  keyCount: number;
  size?: "small" | "normal" | "large";
}) {
  const cellW = size === "small" ? 5 : size === "large" ? 16 : 9;
  const w = Math.max(1, keyCount) * cellW;
  const h = size === "small" ? 22 : size === "large" ? 150 : 56;
  const pad = size === "large" ? 6 : 3;
  const maxTime = Math.max(
    1,
    ...pattern.map((n) => n.endTime ?? n.startTime),
  );
  const ty = (t: number) => h - pad - (t / maxTime) * (h - 2 * pad);
  const riceH = size === "large" ? 6 : 3;

  return (
    <svg width={w} height={h} className="shrink-0 rounded bg-ink-900/70" aria-hidden>
      {pattern.map((n, i) => {
        const x = n.column * cellW + 0.5;
        if (n.endTime !== undefined && n.endTime > n.startTime) {
          const top = ty(n.endTime);
          const bottom = ty(n.startTime);
          return (
            <rect
              key={i}
              x={x}
              y={top}
              width={cellW - 1}
              height={Math.max(2, bottom - top)}
              rx={1}
              fill="#e86868"
              opacity={0.85}
            />
          );
        }
        return (
          <rect
            key={i}
            x={x}
            y={ty(n.startTime) - riceH / 2}
            width={cellW - 1}
            height={riceH}
            rx={1}
            fill={defaultLaneColour(n.column, keyCount)}
          />
        );
      })}
    </svg>
  );
}
