import {
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  SNAP_DIVISORS,
  type SnapDivisor,
  type ViewState,
} from "../types";
import type { AudioController } from "../hooks/useAudio";
import { formatTime } from "../lib/timing";
import { Button } from "./ui/Controls";

type Props = {
  audio: AudioController;
  hasAudio: boolean;
  view: ViewState;
  onView: (v: ViewState) => void;
};

export function TransportBar({ audio, hasAudio, view, onView }: Props) {
  const { isPlaying, currentTime, toggle } = audio;

  return (
    <div className="flex items-center gap-4 border-b border-ink-600 bg-ink-800/80 px-4 py-3 backdrop-blur">
      <div className="flex-1" />

      {/* Timestamp display */}
      <button
        onClick={() => {
          const timestamp = formatTime(currentTime);
          navigator.clipboard.writeText(timestamp);
        }}
        className="rounded bg-ink-900/70 px-2 py-1 font-mono text-xs text-slate-300 transition-colors hover:bg-ink-800 hover:text-slate-100 cursor-pointer"
        title="Click to copy timestamp"
      >
        <span className="text-slate-100">{Math.round(currentTime)} ms</span>
        <span className="mx-1 text-slate-500">/</span>
        <span className="text-slate-500">{formatTime(currentTime)}</span>
      </button>

      <div className="flex-1 flex items-center justify-end gap-4">
        {/* Snap divisor */}
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Snap
          <select
            value={view.snapDivisor}
            onChange={(e) =>
              onView({
                ...view,
                snapDivisor: Number(e.target.value) as SnapDivisor,
              })
            }
            className="rounded-md border border-ink-500/60 bg-ink-700 px-2 py-1 text-slate-100 outline-none"
          >
            {SNAP_DIVISORS.map((d) => (
              <option key={d} value={d}>
                1/{d}
              </option>
            ))}
          </select>
        </label>

        {/* Scroll speed (osu!mania, 1–40) */}
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Scroll speed
          <input
            type="range"
            min={MIN_SCROLL_SPEED}
            max={MAX_SCROLL_SPEED}
            step={1}
            value={view.scrollSpeed}
            onChange={(e) =>
              onView({ ...view, scrollSpeed: Number(e.target.value) })
            }
            className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
          />
          <span className="w-9 font-mono text-slate-300">
            {view.scrollSpeed}
          </span>
        </label>
      </div>
    </div>
  );
}
