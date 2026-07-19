import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Toggle } from "../ui/Controls";
import type { PlaytestSettings } from "../../types";
import { keyLabel, keybindWarnings } from "../../lib/playtestKeybinds";

type Props = {
  open: boolean;
  onClose: () => void;
  playfieldScale: number;
  onPlayfieldScale: (value: number) => void;
  longNoteBodyScale: number;
  onLongNoteBodyScale: (value: number) => void;
  hitsoundsEnabled: boolean;
  onHitsoundsEnabled: (value: boolean) => void;
  hitsoundVolume: number;
  onHitsoundVolume: (value: number) => void;
  dimBackground: number;
  onDimBackground: (value: number) => void;
  smoothScrolling: boolean;
  onSmoothScrolling: (value: boolean) => void;
  showWaveform: boolean;
  onShowWaveform: (value: boolean) => void;
  showTimingLines: boolean;
  onShowTimingLines: (value: boolean) => void;
  upscroll: boolean;
  onUpscroll: (value: boolean) => void;
  svPreviewPlayback: boolean;
  onSvPreviewPlayback: (value: boolean) => void;
  bpmAffectsScroll: boolean;
  onBpmAffectsScroll: (value: boolean) => void;
  playtest: PlaytestSettings;
  onPlaytest: (value: PlaytestSettings) => void;
  localAutosaveEnabled: boolean;
  onLocalAutosaveEnabled: (value: boolean) => void;
  exportPngBackgroundsAsJpeg: boolean;
  onExportPngBackgroundsAsJpeg: (value: boolean) => void;
  exportJpegQuality: number;
  onExportJpegQuality: (value: number) => void;
  uiSoundsEnabled: boolean;
  onUiSoundsEnabled: (value: boolean) => void;
  uiSoundVolume: number;
  onUiSoundVolume: (value: number) => void;
};

const TABS = ["Editor", "Playtest", "Audio", "Export"] as const;
type Tab = (typeof TABS)[number];

export function AppSettingsModal({
  open,
  onClose,
  playfieldScale,
  onPlayfieldScale,
  longNoteBodyScale,
  onLongNoteBodyScale,
  hitsoundsEnabled,
  onHitsoundsEnabled,
  hitsoundVolume,
  onHitsoundVolume,
  dimBackground,
  onDimBackground,
  smoothScrolling,
  onSmoothScrolling,
  showWaveform,
  onShowWaveform,
  showTimingLines,
  onShowTimingLines,
  upscroll,
  onUpscroll,
  svPreviewPlayback,
  onSvPreviewPlayback,
  bpmAffectsScroll,
  onBpmAffectsScroll,
  playtest,
  onPlaytest,
  localAutosaveEnabled,
  onLocalAutosaveEnabled,
  exportPngBackgroundsAsJpeg,
  onExportPngBackgroundsAsJpeg,
  exportJpegQuality,
  onExportJpegQuality,
  uiSoundsEnabled,
  onUiSoundsEnabled,
  uiSoundVolume,
  onUiSoundVolume,
}: Props) {
  const [tab, setTab] = useState<Tab>("Editor");
  const [keyMode, setKeyMode] = useState(4);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [capturingRestart, setCapturingRestart] = useState(false);
  const selectedKeybinds = playtest.keybinds[keyMode] ?? [];
  const warnings = keybindWarnings(selectedKeybinds);

  const patchPlaytest = (patch: Partial<PlaytestSettings>) => {
    onPlaytest({ ...playtest, ...patch });
  };

  const setKeybind = (column: number, code: string) => {
    const next = Array.from({ length: keyMode }, (_, i) => selectedKeybinds[i] || "");
    if (code && next.some((existing, i) => i !== column && existing === code)) {
      setCapturing(null);
      return;
    }
    next[column] = code;
    patchPlaytest({
      keybinds: {
        ...playtest.keybinds,
        [keyMode]: next,
      },
    });
    setCapturing(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      {/* Floor the height so switching between a long tab (Playtest) and a
          short one (Audio) doesn't collapse the dialog. */}
      <div className="flex min-h-[min(30rem,60vh)] flex-col gap-5">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-ink-700/40 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t
                  ? "bg-accent/90 text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Editor" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Playfield
              </h3>
              <div className="flex flex-col gap-2">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Background dim</span>
                  <span className="font-medium text-slate-200">
                    {Math.round(dimBackground)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={dimBackground}
                  onChange={(e) => onDimBackground(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                />
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Size / zoom</span>
                  <span className="font-medium text-slate-200">
                    {Math.round(playfieldScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={playfieldScale}
                  onChange={(e) => onPlayfieldScale(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                />
                <p className="text-[11px] text-slate-500">
                  Higher dim keeps the notefield easier to read. Size / zoom is
                  visual only - also adjustable with the + / − keys.
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                  <span>Waveform on hit lane</span>
                  <Toggle
                    checked={showWaveform}
                    onChange={onShowWaveform}
                    aria-label="Waveform on hit lane"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Overlays the song&rsquo;s waveform on the lanes, in the editor
                  and in playtest, so audio peaks line up with your notes.
                  Handy for checking the offset. Toggle with W.
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                  <span>Timing and bookmark lines</span>
                  <Toggle
                    checked={showTimingLines}
                    onChange={onShowTimingLines}
                    aria-label="Timing and bookmark lines"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Draws the BPM, SV, preview point, and bookmark lines across
                  the playfield. They are always hidden during playtest.
                </p>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Scrolling
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Smooth scrolling</span>
                <Toggle
                  checked={smoothScrolling}
                  onChange={onSmoothScrolling}
                  aria-label="Smooth scrolling"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Glides the playfield between snap lines instead of jumping. Still
                snaps to the grid - only the motion is animated.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>Preview SV while playing</span>
                <Toggle
                  checked={svPreviewPlayback}
                  onChange={onSvPreviewPlayback}
                  aria-label="Preview SV while playing"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Warps the scroll by your green SV points during editor playback,
                the way players will see it. Playtest always applies SV. While
                paused the editor stays linear so placing notes is predictable.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>BPM affects scroll speed</span>
                <Toggle
                  checked={bpmAffectsScroll}
                  onChange={onBpmAffectsScroll}
                  aria-label="BPM affects scroll speed"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Matches osu!mania: red points scroll faster at higher BPM, so
                BPM-gimmick maps (freezes, teleports) preview correctly. Turn
                off for Quaver-style constant scroll where only SV matters.
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>Scroll direction</span>
                <button
                  type="button"
                  onClick={() => onUpscroll(!upscroll)}
                  aria-label={`Scroll direction: ${
                    upscroll ? "upscroll" : "downscroll"
                  } (click to switch)`}
                  className="flex items-center gap-1.5 rounded-lg border border-ink-500/60 bg-ink-600 px-2.5 py-1 text-xs font-medium text-slate-200 shadow-sm transition hover:border-accent/60 hover:bg-ink-500"
                >
                  <span
                    aria-hidden
                    className={`inline-block leading-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      upscroll ? "-rotate-180" : "rotate-0"
                    }`}
                  >
                    ↓
                  </span>
                  <span className="relative inline-flex w-[5.25rem] justify-center overflow-hidden py-0.5">
                    <span
                      key={upscroll ? "up" : "down"}
                      className={`whitespace-nowrap ${
                        upscroll ? "scroll-dir-in-up" : "scroll-dir-in-down"
                      }`}
                    >
                      {upscroll ? "Upscroll" : "Downscroll"}
                    </span>
                  </span>
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Downscroll drops notes toward a bottom judgement line; upscroll
                flips the playfield so notes rise toward a top line. Editor-only,
                it doesn&rsquo;t change the exported map.
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Long notes
              </h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Body width</span>
                  <span className="font-medium text-slate-200">
                    {Math.round(longNoteBodyScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={longNoteBodyScale}
                  onChange={(e) => onLongNoteBodyScale(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                />
                <p className="text-[11px] text-slate-500">
                  Width of the default long-note body (the gray part), relative to
                  the lane. Only applies when no skin body sprite is used.
                </p>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Local save
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Autosave local project</span>
                <Toggle
                  checked={localAutosaveEnabled}
                  onChange={onLocalAutosaveEnabled}
                  aria-label="Autosave local project"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Saves the full project on this device, including audio,
                difficulties and background files. Ctrl+S still saves locally.
              </p>
            </section>
          </div>
        )}

        {tab === "Playtest" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Scroll speed</span>
                <span className="font-medium text-slate-200">
                  {playtest.scrollSpeed}
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={45}
                step={1}
                value={playtest.scrollSpeed}
                onChange={(e) =>
                  patchPlaytest({ scrollSpeed: Number(e.target.value) })
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Rate</span>
                <span className="font-medium text-slate-200">
                  {(playtest.rate ?? 1).toFixed(2)}×
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2].map((r) => {
                  const on = Math.abs((playtest.rate ?? 1) - r) < 0.001;
                  return (
                    <button
                      key={r}
                      onClick={() => patchPlaytest({ rate: r })}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition ${
                        on
                          ? "bg-accent text-white"
                          : "bg-ink-700 text-slate-300 hover:bg-ink-600"
                      }`}
                    >
                      {r}×
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                Practice faster or slower. Hit windows scale with the rate, so the
                timing precision you need stays the same as at 1×.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <span>Zoom</span>
                <input
                  type="number"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={playtest.zoom}
                  onChange={(e) => patchPlaytest({ zoom: Number(e.target.value) })}
                  className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <span>Background dim</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={playtest.backgroundDim}
                  onChange={(e) =>
                    patchPlaytest({ backgroundDim: Number(e.target.value) })
                  }
                  className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <span>Offset mode</span>
                <select
                  value={playtest.offsetMode}
                  onChange={(e) =>
                    patchPlaytest({
                      offsetMode: e.target.value === "audio" ? "audio" : "visual",
                    })
                  }
                  className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  <option value="visual">Visual offset</option>
                  <option value="audio">Audio offset</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Offset ms</span>
                  <span className="font-medium text-slate-200">
                    {playtest.offsetMs} ms
                  </span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={playtest.offsetMs}
                  onChange={(e) =>
                    patchPlaytest({ offsetMs: Number(e.target.value) })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Hit position offset</span>
                  <span className="font-medium text-slate-200">
                    {playtest.hitPositionOffset} px
                  </span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={playtest.hitPositionOffset}
                  onChange={(e) =>
                    patchPlaytest({ hitPositionOffset: Number(e.target.value) })
                  }
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                />
                <span className="text-[11px] text-slate-500">
                  Moves the hit point below (or above) the receptors in playtest
                  only - the receptors don't move. Visual; doesn't affect timing.
                </span>
              </label>
            </div>
            <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <SettingToggle label="Show judgement text" checked={playtest.showJudgements} onChange={(v) => patchPlaytest({ showJudgements: v })} />
              <SettingToggle label="Show combo" checked={playtest.showCombo} onChange={(v) => patchPlaytest({ showCombo: v })} />
              <SettingToggle label="Show accuracy" checked={playtest.showAccuracy} onChange={(v) => patchPlaytest({ showAccuracy: v })} />
              <SettingToggle label="Show hit error" checked={playtest.showHitError} onChange={(v) => patchPlaytest({ showHitError: v })} />
              <SettingToggle label="Show error (UR) bar" checked={playtest.showErrorBar} onChange={(v) => patchPlaytest({ showErrorBar: v })} />
              <SettingToggle label="Skin combo font" checked={playtest.useSkinComboFont} onChange={(v) => patchPlaytest({ useSkinComboFont: v })} />
              <SettingToggle label="Skin judgements" checked={playtest.useSkinJudgements} onChange={(v) => patchPlaytest({ useSkinJudgements: v })} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 p-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Quick restart key
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Restarts the run instantly during playtest. Esc opens the pause
                  menu; F5 enters / leaves the playtest.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCapturingRestart(true)}
                onKeyDown={(e) => {
                  if (!capturingRestart) return;
                  e.preventDefault();
                  if (e.key === "Escape" || e.key === "F5") setCapturingRestart(false);
                  else if (e.key === "Backspace" || e.key === "Delete") {
                    patchPlaytest({ quickRestartKey: "" });
                    setCapturingRestart(false);
                  } else {
                    patchPlaytest({ quickRestartKey: e.code });
                    setCapturingRestart(false);
                  }
                }}
                className={`min-w-[5rem] shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  capturingRestart
                    ? "border-accent/80 bg-accent/20 text-slate-100"
                    : "border-white/10 bg-ink-700/60 text-slate-300 hover:border-accent/50"
                }`}
              >
                {capturingRestart ? "Press key" : keyLabel(playtest.quickRestartKey)}
              </button>
            </div>

            <div className="rounded-xl border border-ink-600 bg-ink-700/30 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Keybinds
                </span>
                <select
                  value={keyMode}
                  onChange={(e) => {
                    setCapturing(null);
                    setKeyMode(Number(e.target.value));
                  }}
                  className="rounded-lg border border-white/10 bg-ink-700 px-2 py-1.5 text-sm text-slate-100 outline-none"
                >
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((keys) => (
                    <option key={keys} value={keys}>
                      {keys}K
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: keyMode }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCapturing(i)}
                    onKeyDown={(e) => {
                      if (capturing !== i) return;
                      e.preventDefault();
                      if (e.key === "Escape") setCapturing(null);
                      else if (e.key === "Backspace" || e.key === "Delete") {
                        setKeybind(i, "");
                      } else setKeybind(i, e.code);
                    }}
                    className={`rounded-lg border px-2 py-2 text-xs transition ${
                      capturing === i
                        ? "border-accent/80 bg-accent/20 text-slate-100"
                        : "border-white/10 bg-ink-700/60 text-slate-300 hover:border-accent/50"
                    }`}
                  >
                    <span className="block text-[10px] text-slate-500">
                      Lane {i + 1}
                    </span>
                    {capturing === i ? "Press key" : keyLabel(selectedKeybinds[i] || "")}
                  </button>
                ))}
              </div>
              {warnings.length > 0 && (
                <p className="mt-2 text-[11px] text-amber-300">
                  {warnings.join(" · ")}
                </p>
              )}
            </div>
          </div>
        )}

        {tab === "Audio" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Hitsounds
              </h3>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Play hitsounds during playback</span>
                  <Toggle
                    checked={hitsoundsEnabled}
                    onChange={onHitsoundsEnabled}
                    aria-label="Play hitsounds during playback"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-slate-500">
                    Hitsounds now follow the map: each note plays its own sample set
                    (normal / soft / drum) and additions (whistle, finish, clap).
                    Edit them with the hitsound toolbar at the bottom of the editor,
                    or the W / F / C keys.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Volume</span>
                    <span className="font-medium text-slate-200">
                      {Math.round(hitsoundVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={hitsoundVolume}
                    disabled={!hitsoundsEnabled}
                    onChange={(e) => onHitsoundVolume(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <p className="text-[11px] text-slate-500">
                    Independent of the song volume. Also adjustable from the
                    transport bar (&ldquo;Hit&rdquo;).
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Interface
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>UI sound effects</span>
                <Toggle
                  checked={uiSoundsEnabled}
                  onChange={onUiSoundsEnabled}
                  aria-label="UI sound effects"
                />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Volume</span>
                  <span className="font-medium text-slate-200">
                    {Math.round(uiSoundVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={uiSoundVolume}
                  disabled={!uiSoundsEnabled}
                  onChange={(e) => onUiSoundVolume(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Clicks, confirmations, and chimes for invites, cloud saves and map
                exports.
              </p>
            </section>
          </div>
        )}

        {tab === "Export" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Background images
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Convert PNG backgrounds to JPEG</span>
                <Toggle
                  checked={exportPngBackgroundsAsJpeg}
                  onChange={onExportPngBackgroundsAsJpeg}
                  aria-label="Convert PNG backgrounds to JPEG"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Re-encodes PNG background images as JPEG when exporting a .osz or
                a pack, which greatly shrinks the file. Only backgrounds are
                converted - skin and storyboard images are always left untouched.
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>JPEG quality</span>
                  <span className="font-medium text-slate-200">
                    {Math.round(exportJpegQuality * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={exportJpegQuality}
                  disabled={!exportPngBackgroundsAsJpeg}
                  onChange={(e) => onExportJpegQuality(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                />
                <p className="text-[11px] text-slate-500">
                  Higher quality looks better but saves less space. 90% is
                  near-lossless at gameplay scale.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
}

function SettingToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}
