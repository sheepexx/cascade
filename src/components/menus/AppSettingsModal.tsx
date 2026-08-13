import { useState } from "react";
import { Modal } from "../ui/Modal";
import { Toggle } from "../ui/Controls";
import type {
  HumanizeSettings,
  PlaytestSettings,
  SkillSettings,
} from "../../types";
import {
  DAN_LADDERS,
  combineDans,
  danSelectionForKeyCount,
  laddersForKeyCount,
  lnLevelForSkill,
  regularLevelForSkill,
  resolveSkillForKeyCount,
} from "../../lib/danSkill";
import { keyLabel, keybindWarnings } from "../../lib/playtestKeybinds";
import { useLocale, type Locale, type MessageKey } from "../../lib/i18n";
import { LOCALES } from "../../lib/i18n/core";
import type { EditorKeybinds } from "../../lib/editorKeybinds";
import { ShortcutsSettings } from "./ShortcutsSettings";

type Props = {
  open: boolean;
  onClose: () => void;
  uiScale: number;
  onUiScale: (value: number) => void;
  playfieldScale: number;
  onPlayfieldScale: (value: number) => void;
  noteHeightScale: number;
  onNoteHeightScale: (value: number) => void;
  longNoteBodyScale: number;
  onLongNoteBodyScale: (value: number) => void;
  difficultyPanelOpen: boolean;
  onDifficultyPanelOpen: (value: boolean) => void;
  showBottomTimeline: boolean;
  onShowBottomTimeline: (value: boolean) => void;
  showPpCounter: boolean;
  onShowPpCounter: (value: boolean) => void;
  showPatternTools: boolean;
  onShowPatternTools: (value: boolean) => void;
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
  editorKeybinds: EditorKeybinds;
  onEditorKeybinds: (value: EditorKeybinds) => void;
  keyCount: number;
};

const TABS = ["Editor", "Playtest", "Audio", "Export", "Shortcuts"] as const;
type Tab = (typeof TABS)[number];
const SHOW_MANUAL_SKILL_TUNING = false;
const ENABLE_MANUAL_SKILL_TUNING = false;

const TAB_LABELS: Record<Tab, MessageKey> = {
  Editor: "settings.tabEditor",
  Playtest: "settings.tabPlaytest",
  Audio: "settings.tabAudio",
  Export: "settings.tabExport",
  Shortcuts: "settings.tabShortcuts",
};

export function AppSettingsModal({
  open,
  onClose,
  uiScale,
  onUiScale,
  playfieldScale,
  onPlayfieldScale,
  noteHeightScale,
  onNoteHeightScale,
  longNoteBodyScale,
  onLongNoteBodyScale,
  difficultyPanelOpen,
  onDifficultyPanelOpen,
  showBottomTimeline,
  onShowBottomTimeline,
  showPpCounter,
  onShowPpCounter,
  showPatternTools,
  onShowPatternTools,
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
  editorKeybinds,
  onEditorKeybinds,
  keyCount,
}: Props) {
  const { locale, setLocale, t } = useLocale();
  const [tab, setTab] = useState<Tab>("Editor");
  const [keyMode, setKeyMode] = useState(4);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [capturingRestart, setCapturingRestart] = useState(false);
  const selectedKeybinds = playtest.keybinds[keyMode] ?? [];
  const warnings = keybindWarnings(selectedKeybinds);

  const patchHumanize = (patch: Partial<HumanizeSettings>) => {
    onPlaytest({ ...playtest, humanize: { ...playtest.humanize, ...patch } });
  };

  const ladders = laddersForKeyCount(keyCount);
  const effectiveSkill = resolveSkillForKeyCount(playtest.skill, keyCount);
  const danSelection = danSelectionForKeyCount(playtest.skill, keyCount);
  const regularLevel =
    danSelection?.regularLevel ??
    regularLevelForSkill(ladders.regular, effectiveSkill);
  const lnLevel =
    danSelection?.lnLevel ??
    lnLevelForSkill(
      ladders.ln,
      effectiveSkill.lnProfile?.lnSkill ?? effectiveSkill.lnSkill,
    );

  const setHumanizeEnabled = (enabled: boolean) => {
    const humanize = { ...playtest.humanize, enabled };
    if (!enabled) {
      onPlaytest({ ...playtest, humanize });
      return;
    }
    const alphaLevel = DAN_LADDERS[ladders.regular].levels.findIndex(
      (level) => level.label === "Alpha",
    );
    onPlaytest({
      ...playtest,
      humanize,
      skill:
        alphaLevel >= 0
          ? combineDans(
              keyCount,
              alphaLevel,
              lnLevel,
              playtest.skill.danSelections,
            )
          : playtest.skill,
    });
  };

  const patchSkill = (patch: Partial<SkillSettings>) => {
    const custom = Object.keys(patch).some((key) => key !== "enabled");
    const base = custom
      ? { ...effectiveSkill, lnProfile: undefined, danSelections: {} }
      : playtest.skill;
    onPlaytest({ ...playtest, skill: { ...base, ...patch } });
  };

  const setDanSkill = (nextRegular: number, nextLn: number) => {
    onPlaytest({
      ...playtest,
      skill: combineDans(
        keyCount,
        nextRegular,
        nextLn,
        playtest.skill.danSelections,
      ),
    });
  };

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
    <Modal open={open} onClose={onClose} title={t("settings.title")} width="max-w-4xl">
      {/* Floor the height so switching between a long tab (Playtest) and a
          short one (Audio) doesn't collapse the dialog. */}
      <div className="flex min-h-[min(30rem,60vh)] flex-col gap-5">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-ink-700/40 p-1">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === name
                  ? "bg-accent/90 text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {t(TAB_LABELS[name])}
            </button>
          ))}
        </div>

        {tab === "Editor" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.language")}
              </h3>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className="w-full rounded-lg border border-ink-500/60 bg-ink-700 px-2 py-2 text-sm text-slate-100"
              >
                {LOCALES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.nativeName}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.interface")}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{t("settings.uiScale")}</span>
                <span className="font-medium text-slate-200">
                  {Math.round(uiScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.5}
                step={0.05}
                value={uiScale}
                onChange={(e) => onUiScale(Number(e.target.value))}
                className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                {t("settings.uiScaleHint")}
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.layout")}
              </h3>
              <div className="flex flex-col gap-3">
                <SettingToggle
                  label={t("settings.showDifficultyPanel")}
                  checked={difficultyPanelOpen}
                  onChange={onDifficultyPanelOpen}
                />
                <SettingToggle
                  label={t("settings.showBottomTimeline")}
                  checked={showBottomTimeline}
                  onChange={onShowBottomTimeline}
                />
                <SettingToggle
                  label={t("settings.showPpCounter")}
                  checked={showPpCounter}
                  onChange={onShowPpCounter}
                />
                <SettingToggle
                  label={t("settings.showPatternTools")}
                  checked={showPatternTools}
                  onChange={onShowPatternTools}
                />
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                {t("settings.layoutHint")}
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.playfield")}
              </h3>
              <div className="flex flex-col gap-2">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{t("settings.backgroundDim")}</span>
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
                  <span>{t("settings.sizeZoom")}</span>
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
                  {t("settings.playfieldHint")}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{t("settings.noteHeight")}</span>
                  <span className="font-medium text-slate-200">
                    {Math.round(noteHeightScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={2}
                  step={0.05}
                  value={noteHeightScale}
                  onChange={(e) => onNoteHeightScale(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                />
                <p className="text-[11px] text-slate-500">
                  {t("settings.noteHeightHint")}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                  <span>{t("settings.waveformOnLane")}</span>
                  <Toggle
                    checked={showWaveform}
                    onChange={onShowWaveform}
                    aria-label={t("settings.waveformOnLane")}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  {t("settings.waveformHint")}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                  <span>{t("settings.timingLines")}</span>
                  <Toggle
                    checked={showTimingLines}
                    onChange={onShowTimingLines}
                    aria-label={t("settings.timingLines")}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  {t("settings.timingLinesHint")}
                </p>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.scrolling")}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{t("settings.smoothScrolling")}</span>
                <Toggle
                  checked={smoothScrolling}
                  onChange={onSmoothScrolling}
                  aria-label={t("settings.smoothScrolling")}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("settings.smoothScrollingHint")}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>{t("settings.svPreview")}</span>
                <Toggle
                  checked={svPreviewPlayback}
                  onChange={onSvPreviewPlayback}
                  aria-label={t("settings.svPreview")}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("settings.svPreviewHint")}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>{t("settings.bpmAffectsScroll")}</span>
                <Toggle
                  checked={bpmAffectsScroll}
                  onChange={onBpmAffectsScroll}
                  aria-label={t("settings.bpmAffectsScroll")}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("settings.bpmAffectsScrollHint")}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
                <span>{t("settings.scrollDirection")}</span>
                <button
                  type="button"
                  onClick={() => onUpscroll(!upscroll)}
                  aria-label={t("settings.scrollDirectionAria", {
                    direction: upscroll
                      ? t("settings.upscroll")
                      : t("settings.downscroll"),
                  })}
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
                      {upscroll
                        ? t("settings.upscrollLabel")
                        : t("settings.downscrollLabel")}
                    </span>
                  </span>
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("settings.scrollDirectionHint")}
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.longNotes")}
              </h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t("settings.bodyWidth")}</span>
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
                  {t("settings.bodyWidthHint")}
                </p>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.localSave")}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{t("settings.autosave")}</span>
                <Toggle
                  checked={localAutosaveEnabled}
                  onChange={onLocalAutosaveEnabled}
                  aria-label={t("settings.autosave")}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("settings.autosaveHint")}
              </p>
            </section>
          </div>
        )}

        {tab === "Playtest" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{t("settings.scrollSpeed")}</span>
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
                <span>{t("settings.rate")}</span>
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
                {t("settings.rateHint")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <span>{t("settings.zoom")}</span>
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
                <span>{t("settings.backgroundDim")}</span>
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
                <span>{t("settings.offsetMode")}</span>
                <select
                  value={playtest.offsetMode}
                  onChange={(e) =>
                    patchPlaytest({
                      offsetMode: e.target.value === "audio" ? "audio" : "visual",
                    })
                  }
                  className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  <option value="visual">{t("settings.offsetVisual")}</option>
                  <option value="audio">{t("settings.offsetAudio")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>{t("settings.offsetMs")}</span>
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
                  <span>{t("settings.hitPositionOffset")}</span>
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
                  {t("settings.hitPositionOffsetHint")}
                </span>
              </label>
            </div>
            <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <SettingToggle label={t("settings.showJudgements")} checked={playtest.showJudgements} onChange={(v) => patchPlaytest({ showJudgements: v })} />
              <SettingToggle label={t("settings.showCombo")} checked={playtest.showCombo} onChange={(v) => patchPlaytest({ showCombo: v })} />
              <SettingToggle label={t("settings.showAccuracy")} checked={playtest.showAccuracy} onChange={(v) => patchPlaytest({ showAccuracy: v })} />
              <SettingToggle label={t("settings.showHitError")} checked={playtest.showHitError} onChange={(v) => patchPlaytest({ showHitError: v })} />
              <SettingToggle label={t("settings.showErrorBar")} checked={playtest.showErrorBar} onChange={(v) => patchPlaytest({ showErrorBar: v })} />
              <SettingToggle label={t("settings.skinComboFont")} checked={playtest.useSkinComboFont} onChange={(v) => patchPlaytest({ useSkinComboFont: v })} />
              <SettingToggle label={t("settings.skinJudgements")} checked={playtest.useSkinJudgements} onChange={(v) => patchPlaytest({ useSkinJudgements: v })} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 p-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("settings.quickRestartKey")}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {t("settings.quickRestartHint")}
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
                {capturingRestart
                  ? t("settings.pressKey")
                  : keyLabel(playtest.quickRestartKey)}
              </button>
            </div>

            <div className="rounded-xl border border-ink-600 bg-ink-700/30 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("settings.keybinds")}
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
                      {t("settings.lane", { number: i + 1 })}
                    </span>
                    {capturing === i
                      ? t("settings.pressKey")
                      : keyLabel(selectedKeybinds[i] || "")}
                  </button>
                ))}
              </div>
              {warnings.length > 0 && (
                <p className="mt-2 text-[11px] text-amber-300">
                  {warnings.join(" · ")}
                </p>
              )}
            </div>

            <section className="rounded-xl border border-ink-600 bg-ink-700/30 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.autoplay")}
              </h3>
              <p className="mb-3 text-[11px] text-slate-500">
                {t("settings.autoplayHint")}
              </p>

              <div className="flex flex-col gap-3 text-xs text-slate-300">
                <SettingToggle
                  label={t("settings.showNpsGraph")}
                  checked={playtest.showNpsGraph}
                  onChange={(v) => patchPlaytest({ showNpsGraph: v })}
                />
                <p className="-mt-1.5 text-[11px] text-slate-500">
                  {t("settings.showNpsGraphHint")}
                </p>
                <SettingToggle
                  label={t("settings.showRunStats")}
                  checked={playtest.showRunStats}
                  onChange={(v) => patchPlaytest({ showRunStats: v })}
                />
                <p className="-mt-1.5 text-[11px] text-slate-500">
                  {t("settings.showRunStatsHint")}
                </p>
                <SettingToggle
                  label={t("settings.humanize")}
                  checked={playtest.humanize.enabled}
                  onChange={setHumanizeEnabled}
                />
                <p className="-mt-1.5 text-[11px] text-slate-500">
                  {t("settings.humanizeHint")}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs text-slate-400">
                      <span>{t("settings.danRegular")}</span>
                      <select
                        value={regularLevel}
                        onChange={(e) =>
                          setDanSkill(Number(e.target.value), lnLevel)
                        }
                        className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                      >
                        {DAN_LADDERS[ladders.regular].levels.map((lvl, i) => (
                          <option key={lvl.label} value={i}>
                            {lvl.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-400">
                      <span>{t("settings.danLn")}</span>
                      <select
                        value={lnLevel}
                        onChange={(e) =>
                          setDanSkill(regularLevel, Number(e.target.value))
                        }
                        className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                      >
                        {DAN_LADDERS[ladders.ln].levels.map((lvl, i) => (
                          <option key={lvl.label} value={i}>
                            {lvl.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="-mt-1 text-[11px] text-slate-500">
                    {t("settings.danHint", {
                      keys: DAN_LADDERS[ladders.regular].keyCount,
                    })}
                  </p>

                  {SHOW_MANUAL_SKILL_TUNING && (
                    <>
                      <HumanSlider
                        label={t("settings.skillJackNps")}
                        hint={t("settings.skillJackNpsHint")}
                        value={effectiveSkill.jackNps}
                        disabled={!ENABLE_MANUAL_SKILL_TUNING}
                        min={2}
                        max={24}
                        step={0.5}
                        format={(v) => `${v} /s`}
                        onChange={(v) => patchSkill({ jackNps: v })}
                      />
                      <HumanSlider
                        label={t("settings.skillHandNps")}
                        hint={t("settings.skillHandNpsHint")}
                        value={effectiveSkill.handNps}
                        disabled={!ENABLE_MANUAL_SKILL_TUNING}
                        min={4}
                        max={45}
                        step={1}
                        format={(v) => `${v} /s`}
                        onChange={(v) => patchSkill({ handNps: v })}
                      />
                      <HumanSlider
                        label={t("settings.skillChordSize")}
                        value={effectiveSkill.chordSize}
                        disabled={!ENABLE_MANUAL_SKILL_TUNING}
                        min={1}
                        max={10}
                        step={1}
                        format={(v) => `${v}`}
                        onChange={(v) => patchSkill({ chordSize: v })}
                      />
                      <HumanSlider
                        label={t("settings.skillLn")}
                        hint={t("settings.skillLnHint")}
                        value={Math.round(
                          (effectiveSkill.lnProfile?.lnSkill ??
                            effectiveSkill.lnSkill) * 100,
                        )}
                        disabled={!ENABLE_MANUAL_SKILL_TUNING}
                        min={0}
                        max={100}
                        step={1}
                        format={(v) => `${v}%`}
                        onChange={(v) => patchSkill({ lnSkill: v / 100 })}
                      />
                      <HumanSlider
                        label={t("settings.skillStamina")}
                        hint={t("settings.skillStaminaHint")}
                        value={effectiveSkill.staminaSec}
                        disabled={!ENABLE_MANUAL_SKILL_TUNING}
                        min={5}
                        max={120}
                        step={1}
                        format={(v) => `${v} s`}
                        onChange={(v) => patchSkill({ staminaSec: v })}
                      />
                      <HumanSlider
                        label={t("settings.skillRecovery")}
                        value={effectiveSkill.recoverySec}
                        disabled={!ENABLE_MANUAL_SKILL_TUNING}
                        min={1}
                        max={20}
                        step={0.5}
                        format={(v) => `${v} s`}
                        onChange={(v) => patchSkill({ recoverySec: v })}
                      />
                    </>
                  )}
              </div>

              {playtest.humanize.enabled && (
                <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4">
                  <HumanSlider
                    label={t("settings.humanizeJitter")}
                    hint={t("settings.humanizeJitterHint")}
                    value={playtest.humanize.jitterMs}
                    min={0}
                    max={60}
                    step={1}
                    format={(v) => `${v} ms`}
                    onChange={(v) => patchHumanize({ jitterMs: v })}
                  />
                  <HumanSlider
                    label={t("settings.humanizeBias")}
                    hint={t("settings.humanizeBiasHint")}
                    value={playtest.humanize.biasMs}
                    min={-40}
                    max={40}
                    step={1}
                    format={(v) => `${v > 0 ? "+" : ""}${v} ms`}
                    onChange={(v) => patchHumanize({ biasMs: v })}
                  />
                  <HumanSlider
                    label={t("settings.humanizeSlipChance")}
                    hint={t("settings.humanizeSlipChanceHint")}
                    value={Math.round(playtest.humanize.slipChance * 1000) / 10}
                    min={0}
                    max={35}
                    step={0.5}
                    format={(v) => `${v.toFixed(1)}%`}
                    onChange={(v) => patchHumanize({ slipChance: v / 100 })}
                  />
                  <HumanSlider
                    label={t("settings.humanizeMissChance")}
                    value={Math.round(playtest.humanize.missChance * 1000) / 10}
                    min={0}
                    max={10}
                    step={0.1}
                    format={(v) => `${v.toFixed(1)}%`}
                    onChange={(v) => patchHumanize({ missChance: v / 100 })}
                  />
                  <HumanSlider
                    label={t("settings.humanizeReleaseJitter")}
                    hint={t("settings.humanizeReleaseJitterHint")}
                    value={playtest.humanize.releaseJitterMs}
                    min={0}
                    max={80}
                    step={1}
                    format={(v) => `${v} ms`}
                    onChange={(v) => patchHumanize({ releaseJitterMs: v })}
                  />
                  <label className="flex flex-col gap-1 text-xs text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>{t("settings.humanizeSeed")}</span>
                      {playtest.humanize.seed === 0 && (
                        <span className="text-[11px] text-slate-500">
                          {t("settings.humanizeSeedRandom")}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={playtest.humanize.seed}
                      onChange={(e) => {
                        const next = Math.max(0, Math.floor(Number(e.target.value)));
                        patchHumanize({
                          seed: Number.isFinite(next) ? next : 0,
                        });
                      }}
                      className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                    />
                    <span className="text-[11px] text-slate-500">
                      {t("settings.humanizeSeedHint")}
                    </span>
                  </label>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "Audio" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.hitsounds")}
              </h3>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>{t("settings.playHitsounds")}</span>
                  <Toggle
                    checked={hitsoundsEnabled}
                    onChange={onHitsoundsEnabled}
                    aria-label={t("settings.playHitsounds")}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-slate-500">
                    {t("settings.hitsoundsHint")}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{t("settings.volume")}</span>
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
                    {t("settings.hitsoundVolumeHint")}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.interface")}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{t("settings.uiSounds")}</span>
                <Toggle
                  checked={uiSoundsEnabled}
                  onChange={onUiSoundsEnabled}
                  aria-label={t("settings.uiSounds")}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t("settings.volume")}</span>
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
                {t("settings.uiSoundsHint")}
              </p>
            </section>
          </div>
        )}

        {tab === "Export" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.backgroundImages")}
              </h3>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>{t("settings.convertPng")}</span>
                <Toggle
                  checked={exportPngBackgroundsAsJpeg}
                  onChange={onExportPngBackgroundsAsJpeg}
                  aria-label={t("settings.convertPng")}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("settings.convertPngHint")}
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{t("settings.jpegQuality")}</span>
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
                  {t("settings.jpegQualityHint")}
                </p>
              </div>
            </section>
          </div>
        )}

        {tab === "Shortcuts" && (
          <ShortcutsSettings
            keybinds={editorKeybinds}
            onKeybinds={onEditorKeybinds}
          />
        )}
      </div>
    </Modal>
  );
}

function HumanSlider({
  label,
  hint,
  value,
  disabled = false,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  disabled?: boolean;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div
      aria-disabled={disabled}
      className={`flex flex-col gap-1.5 ${disabled ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-slate-200">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed"
      />
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
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
