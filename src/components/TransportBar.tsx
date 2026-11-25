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
import { Button, Slider } from "./ui/Controls";
import { Dropdown, type DropdownOption } from "./ui/Dropdown";
import { PauseIcon, PlayIcon } from "./ui/Icons";
import { useElementBreakpoints } from "../hooks/useElementBreakpoints";

/**
 * Widths (in interface px) the bar lays out by: its own, not the window's, so
 * it still fits when the editor's layout puts it beside another panel.
 */
const THREE_COLUMNS_AT = 1100;
const TWO_ROWS_AT = 420;
const SNAP_LABEL_AT = 600;
const ZOOM_LABEL_AT = 760;
type Props = {
  audio: AudioController;
  view: ViewState;
  onView: (v: ViewState) => void;
  jumpOpen: boolean;
  onJumpOpenChange: (open: boolean) => void;
  /** The selected notes as an osu! timestamp, while there is a selection. */
  getSelectionTimestamp?: () => string | null;
  /** Starts a playtest from the playhead; the button is hidden without it. */
  onPlaytest?: () => void;
  /** No audio is loaded, so there is nothing to play along to. */
  playtestDisabled?: boolean;
  /** The playtest keybind's label, for the tooltip. */
  playtestKey?: string;
  /** No song is loaded, so play/pause has nothing to play. */
  playDisabled?: boolean;
  /** The play/pause keybind's label, for the tooltip. */
  playKey?: string;
  /** Placed by the editor's panel layout, which draws its border. */
  docked?: boolean;
  /** Stacked in a column, for the left or right edge. */
  vertical?: boolean;
};

export function TransportBar({
  audio,
  view,
  onView,
  jumpOpen,
  onJumpOpenChange,
  getSelectionTimestamp,
  onPlaytest,
  playtestDisabled = false,
  playtestKey,
  playDisabled = false,
  playKey,
  docked = false,
  vertical = false,
}: Props) {
  const { currentTime } = audio;
  const [jumpDraft, setJumpDraft] = useState("");
  const [jumpInvalid, setJumpInvalid] = useState(false);
  const [copied, setCopied] = useState<"ms" | "timestamp" | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const t = useT();
  const { ref: rootRef, width } = useElementBreakpoints<HTMLDivElement>();
  const column = vertical || width < TWO_ROWS_AT;
  const wide = !column && width >= THREE_COLUMNS_AT;
  const snapLabel = column || width >= SNAP_LABEL_AT;
  const zoomLabel = column || width >= ZOOM_LABEL_AT;

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

  const playtestPart = (
    <>
        {onPlaytest && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onPlaytest()}
            disabled={playtestDisabled}
            title={
              playtestDisabled
                ? t("transport.playtestNoAudio")
                : t("transport.playtestTitle", { key: playtestKey ?? "" })
            }
            className="pl-2"
          >
            <PlayIcon className="h-3.5 w-3.5 text-accent" />
            {t("transport.playtest")}
          </Button>
        )}
    </>
  );
  const playPart = (
    <>
        <button
          type="button"
          onClick={audio.toggle}
          disabled={playDisabled}
          aria-label={audio.isPlaying ? t("app.pausePlayback") : t("app.playAudio")}
          title={
            playDisabled
              ? t("transport.playNoAudio")
              : `${audio.isPlaying ? t("app.pausePlayback") : t("app.playAudio")}${playKey ? ` (${playKey})` : ""}`
          }
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-200 transition duration-150 hover:bg-white/[0.07] hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {audio.isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>
    </>
  );
  const readoutPart = (
    <>
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
            className={`h-7 w-40 rounded-md bg-black/40 px-2.5 font-mono text-[13px] text-slate-100 outline-none ring-1 ring-inset transition-colors focus-visible:outline-none ${
              jumpInvalid ? "ring-rose-400/80" : "ring-accent/70"
            }`}
            title={t("transport.jumpTitle")}
          />
        ) : (
          // The position display: the one readout the mapper glances at all
          // session, set like a DAW's counter.
          <span className="flex h-7 items-center rounded-md bg-black/40 font-mono text-[13px] ring-1 ring-inset ring-white/[0.06]">
            <button
              type="button"
              onClick={() => copyValue(String(Math.round(currentTime)), "ms")}
              className={`h-full cursor-pointer rounded-l-md pl-2.5 pr-1.5 font-medium transition duration-150 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
                copied === "ms" ? "text-accent" : "text-slate-50"
              }`}
              title={t("transport.copyMs")}
            >
              {Math.round(currentTime)} ms
            </button>
            <span className="h-3.5 w-px bg-white/[0.1]" />
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
              className={`h-full cursor-pointer rounded-r-md pl-1.5 pr-2.5 transition duration-150 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
                copied === "timestamp" ? "text-accent" : "text-slate-400"
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
    </>
  );
  const goToPart = (
    <>
        {!jumpOpen && (
          <button
            type="button"
            onClick={() => onJumpOpenChange(true)}
            className="h-7 cursor-pointer rounded-md px-2 text-xs text-slate-400 transition duration-150 hover:bg-white/[0.07] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            title={t("transport.jumpButton")}
          >
            {t("transport.goTo")}
          </button>
        )}
    </>
  );
  const snapPart = (
    <>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {snapLabel && <span>{t("transport.snap")}</span>}
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
    </>
  );
  const speedPart = (
    <>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          {zoomLabel && (
            <span className="mr-1 whitespace-nowrap">{t("transport.scrollSpeed")}</span>
          )}
          <button
            type="button"
            onClick={() =>
              onView({
                ...view,
                scrollSpeed: Math.max(MIN_SCROLL_SPEED, view.scrollSpeed - 1),
              })
            }
            className="grid h-6 w-6 place-items-center rounded-md text-sm text-slate-400 transition duration-150 hover:bg-white/[0.07] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={t("transport.zoomOut")}
          >
            −
          </button>
          <Slider
            size="sm"
            min={MIN_SCROLL_SPEED}
            max={MAX_SCROLL_SPEED}
            step={1}
            value={view.scrollSpeed}
            aria-label={t("transport.zoom")}
            onChange={(value) => onView({ ...view, scrollSpeed: value })}
            className={wide || column ? "w-24" : "w-16"}
          />
          <button
            type="button"
            onClick={() =>
              onView({
                ...view,
                scrollSpeed: Math.min(MAX_SCROLL_SPEED, view.scrollSpeed + 1),
              })
            }
            className="grid h-6 w-6 place-items-center rounded-md text-sm text-slate-400 transition duration-150 hover:bg-white/[0.07] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={t("transport.zoomIn")}
          >
            +
          </button>
          <span className="w-7 text-right font-mono tabular-nums text-slate-300">
            {view.scrollSpeed}
          </span>
        </label>
    </>
  );

  if (column) {
    // A column for the left or right edge, or a narrow spot: the same
    // controls, one row each.
    return (
      <div ref={rootRef} className={`flex flex-col gap-3 bg-ink-900 px-3 py-3 [&_button]:shrink-0 ${docked ? "" : "border-b border-white/[0.06]"}`}>
        {onPlaytest && <div className="flex [&>button]:w-full [&>button]:justify-center">{playtestPart}</div>}
        <div className="flex flex-wrap items-center gap-1.5">
          {playPart}
          {readoutPart}
        </div>
        {goToPart}
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">{snapPart}</div>
        <div className="flex items-center [&>label]:w-full [&>label]:flex-wrap [&>label]:gap-y-1.5 [&>label>span:first-child]:basis-full">{speedPart}</div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`grid items-center gap-y-1.5 bg-ink-900 px-3 py-1.5 ${
        wide ? "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-4" : "grid-cols-[minmax(0,1fr)_auto] gap-x-3"
      } ${docked ? "" : "border-b border-white/[0.06]"}`}
    >
      {/* Same width as the right column so the time readout stays centred in
          the three-column layout; volume lives in the Alt+wheel rings and
          Settings → Audio. */}
      <div className="order-1 flex min-w-0 items-center">
        {playtestPart}
      </div>

      <div className={`flex items-center justify-center gap-1.5 ${wide ? "order-2 col-span-1" : "order-3 col-span-2"}`}>
        {/* Space plays on a keyboard; this is for touch screens without one. */}
        {playPart}
        {readoutPart}
        {goToPart}
      </div>

      <div className={`flex min-w-0 items-center justify-end ${wide ? "order-3 gap-5" : "order-2 gap-2"}`}>
        {snapPart}
        {speedPart}
      </div>
    </div>
  );
}
