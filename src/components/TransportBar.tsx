import { useEffect, useRef, useState } from "react";
import {
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  SNAP_DIVISORS,
  type SnapDivisor,
  type ViewState,
} from "../types";
import type { AudioController } from "../hooks/useAudio";
import { formatTime, parseTimestamp } from "../lib/timing";
type Props = {
  audio: AudioController;
  view: ViewState;
  onView: (v: ViewState) => void;
  hitsoundVolume: number;
  onHitsoundVolume: (value: number) => void;
  jumpOpen: boolean;
  onJumpOpenChange: (open: boolean) => void;
};

export function TransportBar({
  audio,
  view,
  onView,
  hitsoundVolume,
  onHitsoundVolume,
  jumpOpen,
  onJumpOpenChange,
}: Props) {
  const { currentTime, volume, setVolume } = audio;
  const [jumpDraft, setJumpDraft] = useState("");
  const [jumpInvalid, setJumpInvalid] = useState(false);
  const jumpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jumpOpen) return;
    setJumpDraft(formatTime(audio.getCurrentTime()));
    setJumpInvalid(false);
    // Focus after the input renders; selection happens in onFocus so the
    // prefill is overtypeable however focus arrives.
    const raf = requestAnimationFrame(() => {
      jumpInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpOpen]);

  const submitJump = () => {
    const ms = parseTimestamp(jumpDraft);
    if (ms === null) {
      setJumpInvalid(true);
      return;
    }
    audio.seek(ms);
    onJumpOpenChange(false);
  };

  return (
    <div className="flex items-center gap-4 border-b border-white/10 bg-ink-800/55 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)] backdrop-blur-xl">
      <div className="flex-1" />

      {jumpOpen ? (
        <input
          ref={jumpInputRef}
          value={jumpDraft}
          onChange={(e) => {
            setJumpDraft(e.target.value);
            setJumpInvalid(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") submitJump();
            else if (e.key === "Escape") onJumpOpenChange(false);
          }}
          onBlur={() => onJumpOpenChange(false)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="mm:ss.ms"
          spellCheck={false}
          className={`w-36 rounded border bg-ink-900/80 px-2 py-1 font-mono text-xs text-slate-100 shadow-inner shadow-black/10 outline-none backdrop-blur transition-colors ${
            jumpInvalid ? "border-red-400/80" : "border-accent/70"
          }`}
          title="Jump to time — Enter to go, Esc to cancel"
        />
      ) : (
        <button
          onClick={() => {
            const timestamp = formatTime(currentTime);
            navigator.clipboard.writeText(timestamp);
          }}
          className="cursor-pointer rounded border border-white/5 bg-ink-900/55 px-2 py-1 font-mono text-xs text-slate-300 shadow-inner shadow-black/10 backdrop-blur transition-colors hover:bg-white/10 hover:text-slate-100"
          title="Click to copy timestamp"
        >
          <span className="text-slate-100">{Math.round(currentTime)} ms</span>
          <span className="mx-1 text-slate-500">/</span>
          <span className="text-slate-500">{formatTime(currentTime)}</span>
        </button>
      )}
      {!jumpOpen && (
        <button
          onClick={() => onJumpOpenChange(true)}
          className="cursor-pointer rounded border border-white/5 bg-ink-900/55 px-2 py-1 text-xs text-slate-400 shadow-inner shadow-black/10 backdrop-blur transition-colors hover:bg-white/10 hover:text-slate-100"
          title="Jump to time (Ctrl+G)"
        >
          Go to
        </button>
      )}

      <div className="flex-1 flex items-center justify-end gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Vol
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
          />
          <span className="w-8 font-mono text-slate-300">
            {Math.round(volume * 100)}%
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-400">
          Hit
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={hitsoundVolume}
            onChange={(e) => onHitsoundVolume(Number(e.target.value))}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            title="Hitsound volume"
          />
          <span className="w-8 font-mono text-slate-300">
            {Math.round(hitsoundVolume * 100)}%
          </span>
        </label>

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
            className="rounded-md border border-white/10 bg-ink-700/70 px-2 py-1 text-slate-100 outline-none backdrop-blur-sm"
          >
            {SNAP_DIVISORS.map((d) => (
              <option key={d} value={d}>
                1/{d}
              </option>
            ))}
          </select>
        </label>

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
