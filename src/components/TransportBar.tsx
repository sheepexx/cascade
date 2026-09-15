import { useEffect, useRef, useState } from "react";
import {
  FREE_SNAP,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  SNAP_OPTIONS,
  type SnapDivisor,
  type ViewState,
} from "../types";
import type { AudioController } from "../hooks/useAudio";
import { formatOsuClock, osuEditLink } from "../lib/osuTimestamp";
import { formatTime, parseTimestamp } from "../lib/timing";
import { useT } from "../lib/i18n";
import { Slider } from "./ui/Controls";
import { Dropdown, type DropdownOption } from "./ui/Dropdown";
type Props = {
  audio: AudioController;
  view: ViewState;
  onView: (v: ViewState) => void;
  jumpOpen: boolean;
  onJumpOpenChange: (open: boolean) => void;
  /** The selected notes as an osu! timestamp, while there is a selection. */
  getSelectionTimestamp?: () => string | null;
};

export function TransportBar({
  audio,
  view,
  onView,
  jumpOpen,
  onJumpOpenChange,
  getSelectionTimestamp,
}: Props) {
  const { currentTime } = audio;
  const [jumpDraft, setJumpDraft] = useState("");
  const [jumpInvalid, setJumpInvalid] = useState(false);
  const [copied, setCopied] = useState<"ms" | "timestamp" | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const t = useT();

  useEffect(
    () => () => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const copyValue = (text: string, which: "ms" | "timestamp") => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(which);
        if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = window.setTimeout(() => setCopied(null), 1000);
      },
      () => {
        // Clipboard can be blocked by permissions; leave the label alone
        // rather than claiming a copy that did not happen.
      },
    );
  };
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-white/10 bg-ink-800/55 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.16)] backdrop-blur-xl uixl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] uixl:gap-4 uixl:px-4 uixl:py-3">
      {/* Keeps the time readout centred in the three-column layout; volume
          lives in the Alt+wheel rings and Settings → Audio. */}
      <div aria-hidden className="order-1 min-w-0" />

      <div className="order-3 col-span-2 flex items-center justify-center gap-2 uixl:order-2 uixl:col-span-1">
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
            className={`w-36 rounded border bg-ink-900/80 px-2 py-1 font-mono text-xs text-slate-100 shadow-inner shadow-black/10 outline-none backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 ${
              jumpInvalid ? "border-red-400/80" : "border-accent/70"
            }`}
            title={t("transport.jumpTitle")}
          />
        ) : (
          <span className="flex items-center rounded border border-white/5 bg-ink-900/55 font-mono text-xs shadow-inner shadow-black/10 backdrop-blur">
            <button
              type="button"
              onClick={() => copyValue(String(Math.round(currentTime)), "ms")}
              className={`cursor-pointer rounded-l py-1 pl-2 pr-1 transition duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-white/15 ${
                copied === "ms" ? "text-accent" : "text-slate-100"
              }`}
              title={t("transport.copyMs")}
            >
              {Math.round(currentTime)} ms
            </button>
            <span className="text-slate-500">/</span>
            <button
              type="button"
              onClick={() => {
                // osu!'s own format, which modding posts turn into a link.
                // With notes selected it is the osu:// link naming each note.
                const stamp = getSelectionTimestamp?.();
                copyValue(
                  stamp ? osuEditLink(stamp) : formatOsuClock(currentTime),
                  "timestamp",
                );
              }}
              className={`cursor-pointer rounded-r py-1 pl-1 pr-2 transition duration-150 hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-white/15 ${
                copied === "timestamp" ? "text-accent" : "text-slate-500"
              }`}
              title={t(
                getSelectionTimestamp
                  ? "transport.copySelectionTimestamp"
                  : "transport.copyTimestamp",
              )}
            >
              {formatOsuClock(currentTime)}
            </button>
          </span>
        )}
        {!jumpOpen && (
          <button
            type="button"
            onClick={() => onJumpOpenChange(true)}
            className="cursor-pointer rounded border border-white/5 bg-ink-900/55 px-2 py-1 text-xs text-slate-400 shadow-inner shadow-black/10 backdrop-blur transition duration-150 hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
            title={t("transport.jumpButton")}
          >
            Go to
          </button>
        )}
      </div>

      <div className="order-2 flex min-w-0 items-center justify-end gap-2 uixl:order-3 uixl:gap-4">

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden uimd:inline">
            {t("transport.snap")}
          </span>
          <Dropdown
            size="sm"
            aria-label={t("transport.snap")}
            value={view.snapDivisor}
            options={SNAP_OPTIONS.map(
              (d): DropdownOption<SnapDivisor> => ({
                value: d,
                label: d === FREE_SNAP ? t("transport.snapFree") : `1/${d}`,
              }),
            )}
            onChange={(snapDivisor) => onView({ ...view, snapDivisor })}
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden whitespace-nowrap uixl:inline">
            {t("transport.scrollSpeed")}
          </span>
          <button
            type="button"
            onClick={() =>
              onView({
                ...view,
                scrollSpeed: Math.max(MIN_SCROLL_SPEED, view.scrollSpeed - 1),
              })
            }
            className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-ink-700 text-sm text-slate-300 transition duration-150 hover:bg-ink-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
            aria-label="Zoom out timeline"
          >
            −
          </button>
          <Slider
            size="sm"
            min={MIN_SCROLL_SPEED}
            max={MAX_SCROLL_SPEED}
            step={1}
            value={view.scrollSpeed}
            aria-label="Timeline zoom"
            onChange={(value) => onView({ ...view, scrollSpeed: value })}
            className="w-16 uixl:w-24"
          />
          <button
            type="button"
            onClick={() =>
              onView({
                ...view,
                scrollSpeed: Math.min(MAX_SCROLL_SPEED, view.scrollSpeed + 1),
              })
            }
            className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-ink-700 text-sm text-slate-300 transition duration-150 hover:bg-ink-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
            aria-label="Zoom in timeline"
          >
            +
          </button>
          <span className="w-9 font-mono text-slate-300">
            {view.scrollSpeed}
          </span>
        </label>
      </div>
    </div>
  );
}
