import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, SegmentedControl, Select, Toggle } from "../ui/Controls";
import { Tooltip } from "../ui/Tooltip";
import { SettingDiagram, type DiagramName } from "../ui/SettingDiagrams";
import { HoldConfirmDialog } from "../ui/HoldConfirmDialog";
import { useAuth } from "../../lib/auth";
import { isDesktopApp } from "../../lib/pwa";
import { eraseLocalData } from "../../lib/resetLocalData";
import {
  osuChooseRoot,
  osuForgetRoot,
  osuStatus,
  type OsuStatus,
} from "../../lib/osuDesktop";
import type {
  AltWheelAction,
  DiscordPresenceMode,
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
import {
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  UI_SCALE_STEP,
} from "../../lib/uiScale";

type Props = {
  onAudioSetup?: () => void;
  open: boolean;
  onClose: () => void;
  uiScale: number;
  onUiScale: (value: number) => void;
  altWheelAction: AltWheelAction;
  onAltWheelAction: (value: AltWheelAction) => void;
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
  simplifyBottomTimeline: boolean;
  discordPresence: DiscordPresenceMode;
  onDiscordPresence: (mode: DiscordPresenceMode) => void;
  onSimplifyBottomTimeline: (value: boolean) => void;
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
  showMenuPlayers: boolean;
  onShowMenuPlayers: (value: boolean) => void;
  hideStatus: boolean;
  onHideStatus: (value: boolean) => void;
  menuMusicEnabled: boolean;
  onMenuMusicEnabled: (value: boolean) => void;
  performanceMode: boolean;
  onPerformanceMode: (value: boolean) => void;
  osuListenerEnabled: boolean;
  onOsuListenerEnabled: (value: boolean) => void;
  keyCount: number;
  accountSyncStatus: "idle" | "syncing" | "synced" | "error" | null;
  accountSyncError: string | null;
};

const TABS = ["General", "Editor", "Playtest", "Audio", "Export", "Shortcuts"] as const;
type Tab = (typeof TABS)[number];
const SHOW_MANUAL_SKILL_TUNING = false;
const ENABLE_MANUAL_SKILL_TUNING = false;

const ALT_WHEEL_OPTIONS: {
  value: AltWheelAction;
  label: MessageKey;
}[] = [
  { value: "interfaceScale", label: "settings.altWheelInterface" },
  { value: "timelineZoom", label: "settings.altWheelTimeline" },
  { value: "playfieldScale", label: "settings.altWheelPlayfield" },
  { value: "volume", label: "settings.altWheelVolume" },
];

const TAB_LABELS: Record<Tab, MessageKey> = {
  General: "settings.tabGeneral",
  Editor: "settings.tabEditor",
  Playtest: "settings.tabPlaytest",
  Audio: "settings.tabAudio",
  Export: "settings.tabExport",
  Shortcuts: "settings.tabShortcuts",
};

export function AppSettingsModal({
  onAudioSetup,
  open,
  onClose,
  uiScale,
  onUiScale,
  altWheelAction,
  onAltWheelAction,
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
  simplifyBottomTimeline,
  onSimplifyBottomTimeline,
  discordPresence,
  onDiscordPresence,
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
  showMenuPlayers,
  onShowMenuPlayers,
  menuMusicEnabled,
  onMenuMusicEnabled,
  performanceMode,
  onPerformanceMode,
  osuListenerEnabled,
  onOsuListenerEnabled,
  hideStatus,
  onHideStatus,
  keyCount,
  accountSyncStatus,
  accountSyncError,
}: Props) {
  const { locale, setLocale, t } = useLocale();
  const { user, login } = useAuth();
  const [tab, setTab] = useState<Tab>("General");
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
    <Modal
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      width="max-w-4xl"
      headerExtra={
        accountSyncStatus ? (
          <AccountSyncIndicator
            status={accountSyncStatus}
            error={accountSyncError}
          />
        ) : null
      }
    >
      {/* Floor the height so switching between a long tab (Playtest) and a
          short one (Audio) doesn't collapse the dialog. */}
      <div className="flex min-h-[min(30rem,60vh)] flex-col gap-5">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={TABS.map((name) => ({
            value: name,
            label: t(TAB_LABELS[name]),
          }))}
        />

        {tab === "General" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.language")}
              </h3>
              <Select
                className="w-full"
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
              >
                {LOCALES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.nativeName}
                  </option>
                ))}
              </Select>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.interface")}
              </h3>
              <SliderRow
                label={t("settings.uiScale")}
                tip={t("settings.uiScaleHint")}
                diagram="uiScale"
                diagramValue={uiScale}
                display={`${Math.round(uiScale * 100)}%`}
                min={MIN_UI_SCALE}
                max={MAX_UI_SCALE}
                step={UI_SCALE_STEP}
                value={uiScale}
                onChange={onUiScale}
              />
              <label className="mt-4 block">
                <span className="text-xs text-slate-300">
                  <Tip text={t("settings.altWheelHint")}>
                    {t("settings.altWheelAction")}
                  </Tip>
                </span>
                <Select
                  className="mt-2 w-full"
                  value={altWheelAction}
                  onChange={(e) =>
                    onAltWheelAction(e.target.value as AltWheelAction)
                  }
                >
                  {ALT_WHEEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </Select>
              </label>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.mainMenu")}
              </h3>
              <div className="flex flex-col gap-3">
                <SettingToggle
                  label={t("settings.menuMusic")}
                  tip={t("settings.menuMusicHint")}
                  checked={menuMusicEnabled}
                  onChange={onMenuMusicEnabled}
                />
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.performance")}
              </h3>
              <div className="flex flex-col gap-3">
                <SettingToggle
                  label={t("settings.performanceMode")}
                  tip={t("settings.performanceModeHint")}
                  checked={performanceMode}
                  onChange={onPerformanceMode}
                />
              </div>
              {performanceMode && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {t("settings.performanceModeNote")}
                </p>
              )}
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.localSave")}
              </h3>
              <div className="flex flex-col gap-3">
                <SettingToggle
                  label={t("settings.autosave")}
                  tip={t("settings.autosaveHint")}
                  checked={localAutosaveEnabled}
                  onChange={onLocalAutosaveEnabled}
                />
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.presence")}
              </h3>
              <div className="flex flex-col gap-3">
                {user ? (
                  <SettingToggle
                    label={t("settings.showMenuPlayers")}
                    tip={t("settings.presenceHint")}
                    checked={showMenuPlayers}
                    onChange={onShowMenuPlayers}
                  />
                ) : (
                  <SettingSignIn
                    label={t("settings.showMenuPlayers")}
                    tip={t("settings.presenceSignedOut")}
                    action={t("startModal.loginWithOsu")}
                    onLogin={login}
                  />
                )}
                <SettingToggle
                  label={t("settings.hideStatus")}
                  checked={hideStatus}
                  onChange={onHideStatus}
                  disabled={!user}
                />
              </div>
              {isDesktopApp() && (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                    <Tip text={t("settings.discordPresenceHint")}>{t("settings.discordPresence")}</Tip>
                    <Select
                      value={discordPresence}
                      onChange={(e) =>
                        onDiscordPresence(
                          e.target.value as DiscordPresenceMode,
                        )
                      }
                      className="w-40"
                    >
                      <option value="detailed">
                        {t("settings.discordDetailed")}
                      </option>
                      <option value="minimal">
                        {t("settings.discordMinimal")}
                      </option>
                      <option value="off">{t("settings.discordOff")}</option>
                    </Select>
                  </div>
                </div>
              )}
            </section>
            {isDesktopApp() && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("settings.osuIntegration")}
                </h3>
                <SettingToggle
                  label={t("settings.osuListener")}
                  tip={t("settings.osuListenerHint")}
                  checked={osuListenerEnabled}
                  onChange={onOsuListenerEnabled}
                />
              </section>
            )}
            <OsuFolderSection />
            <LegalSection />
            <ResetDataSection />
          </div>
        )}

        {tab === "Editor" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.layout")}
              </h3>
              <div className="flex flex-col gap-3">
                <SettingToggle
                  label={t("settings.showDifficultyPanel")} tip={t("settings.layoutHint")} diagram="difficultyPanel"
                  checked={difficultyPanelOpen}
                  onChange={onDifficultyPanelOpen}
                />
                <SettingToggle
                  label={t("settings.showBottomTimeline")} tip={t("settings.layoutHint")} diagram="bottomTimeline"
                  checked={showBottomTimeline}
                  onChange={onShowBottomTimeline}
                />
                <div className="ml-3 border-l border-white/10 pl-3">
                  <SettingToggle
                    label={t("settings.simplifyBottomTimeline")}
                    tip={t("settings.simplifyBottomTimelineHint")}
                    checked={simplifyBottomTimeline}
                    disabled={!showBottomTimeline}
                    onChange={onSimplifyBottomTimeline}
                  />
                </div>
                <SettingToggle
                  label={t("settings.showPpCounter")} tip={t("settings.layoutHint")} diagram="ppPanel"
                  checked={showPpCounter}
                  onChange={onShowPpCounter}
                />
                <SettingToggle
                  label={t("settings.showPatternTools")} tip={t("settings.layoutHint")}
                  checked={showPatternTools}
                  onChange={onShowPatternTools}
                />
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.playfield")}
              </h3>
              <div className="flex flex-col gap-2">
                <SliderRow
                  label={t("settings.backgroundDim")}
                  tip={t("settings.playfieldHint")}
                  diagram="backgroundDim"
                  diagramValue={dimBackground}
                  display={`${Math.round(dimBackground)}%`}
                  min={0}
                  max={100}
                  step={1}
                  value={dimBackground}
                  onChange={onDimBackground}
                />
                <SliderRow
                  label={t("settings.sizeZoom")}
                  tip={t("settings.playfieldHint")}
                  diagram="sizeZoom"
                  diagramValue={playfieldScale * 100}
                  display={`${Math.round(playfieldScale * 100)}%`}
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={playfieldScale}
                  onChange={onPlayfieldScale}
                />
                <SliderRow
                  label={t("settings.noteHeight")}
                  tip={t("settings.noteHeightHint")}
                  diagram="noteHeight"
                  diagramValue={noteHeightScale * 100}
                  display={`${Math.round(noteHeightScale * 100)}%`}
                  min={0.75}
                  max={2}
                  step={0.05}
                  value={noteHeightScale}
                  onChange={onNoteHeightScale}
                />
                <div className="mt-2 flex flex-col gap-3">
                  <SettingToggle
                    label={t("settings.waveformOnLane")}
                    tip={t("settings.waveformHint")}
                    diagram="waveform"
                    checked={showWaveform}
                    onChange={onShowWaveform}
                  />
                  <SettingToggle
                    label={t("settings.timingLines")}
                    tip={t("settings.timingLinesHint")}
                    diagram="timingLines"
                    checked={showTimingLines}
                    onChange={onShowTimingLines}
                  />
                </div>
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.scrolling")}
              </h3>
              <div className="flex flex-col gap-3">
                <SettingToggle
                  label={t("settings.smoothScrolling")}
                  tip={t("settings.smoothScrollingHint")}
                  diagram="smoothScrolling"
                  checked={smoothScrolling}
                  onChange={onSmoothScrolling}
                />
                <SettingToggle
                  label={t("settings.svPreview")}
                  tip={t("settings.svPreviewHint")}
                  diagram="svPreview"
                  checked={svPreviewPlayback}
                  onChange={onSvPreviewPlayback}
                />
                <SettingToggle
                  label={t("settings.bpmAffectsScroll")}
                  tip={t("settings.bpmAffectsScrollHint")}
                  diagram="bpmScroll"
                  checked={bpmAffectsScroll}
                  onChange={onBpmAffectsScroll}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-300">
                <Tip text={t("settings.scrollDirectionHint")} diagram="scrollDirection">{t("settings.scrollDirection")}</Tip>
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
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.longNotes")}
              </h3>
              <div className="flex flex-col gap-2">
                <SliderRow
                  label={t("settings.bodyWidth")}
                  tip={t("settings.bodyWidthHint")}
                  diagram="bodyWidth"
                  diagramValue={longNoteBodyScale * 100}
                  display={`${Math.round(longNoteBodyScale * 100)}%`}
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={longNoteBodyScale}
                  onChange={onLongNoteBodyScale}
                />
              </div>
            </section>
          </div>
        )}

        {tab === "Playtest" && (
          <div className="flex flex-col gap-4">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.playback")}
              </h3>
              <div className="flex flex-col gap-3">
              <SliderRow
                label={t("settings.scrollSpeed")}
                display={String(playtest.scrollSpeed)}
                min={10}
                max={45}
                step={1}
                value={playtest.scrollSpeed}
                onChange={(v) => patchPlaytest({ scrollSpeed: v })}
              />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <Tip text={t("settings.rateHint")}>{t("settings.rate")}</Tip>
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
              </div>
                <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <span>{t("settings.zoom")}</span>
                  <input
                    type="number"
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={playtest.zoom}
                    onChange={(e) => patchPlaytest({ zoom: Number(e.target.value) })}
                    className="rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-300">
                  <Tip text={t("settings.playfieldHint")} diagram="backgroundDim" value={playtest.backgroundDim}>{t("settings.backgroundDim")}</Tip>
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
                </div>
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.offset")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-300">
                <span>{t("settings.offsetMode")}</span>
                <Select
                  value={playtest.offsetMode}
                  onChange={(e) =>
                    patchPlaytest({
                      offsetMode: e.target.value === "audio" ? "audio" : "visual",
                    })
                  }
                >
                  <option value="visual">{t("settings.offsetVisual")}</option>
                  <option value="audio">{t("settings.offsetAudio")}</option>
                </Select>
              </label>
              <SliderRow
                label={t("settings.offsetMs")}
                tip={t("settings.offsetHint")}
                diagram="offsetMs"
                display={`${playtest.offsetMs} ms`}
                min={-200}
                max={200}
                step={1}
                value={playtest.offsetMs}
                onChange={(v) => patchPlaytest({ offsetMs: v })}
              />
              <SliderRow
                label={t("settings.hitPositionOffset")}
                tip={t("settings.hitPositionOffsetHint")}
                diagram="hitPosition"
                display={`${playtest.hitPositionOffset} px`}
                min={-100}
                max={100}
                step={1}
                value={playtest.hitPositionOffset}
                onChange={(v) => patchPlaytest({ hitPositionOffset: v })}
              />
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Tip diagram="hud">{t("settings.hud")}</Tip>
              </h3>
              <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
              <SettingToggle label={t("settings.showJudgements")} checked={playtest.showJudgements} onChange={(v) => patchPlaytest({ showJudgements: v })} />
              <SettingToggle label={t("settings.showCombo")} checked={playtest.showCombo} onChange={(v) => patchPlaytest({ showCombo: v })} />
              <SettingToggle label={t("settings.showAccuracy")} checked={playtest.showAccuracy} onChange={(v) => patchPlaytest({ showAccuracy: v })} />
              <SettingToggle label={t("settings.showHitError")} checked={playtest.showHitError} onChange={(v) => patchPlaytest({ showHitError: v })} />
              <SettingToggle label={t("settings.showErrorBar")} checked={playtest.showErrorBar} onChange={(v) => patchPlaytest({ showErrorBar: v })} />
              <SettingToggle label={t("settings.skinComboFont")} checked={playtest.useSkinComboFont} onChange={(v) => patchPlaytest({ useSkinComboFont: v })} />
              <SettingToggle label={t("settings.skinJudgements")} checked={playtest.useSkinJudgements} onChange={(v) => patchPlaytest({ useSkinJudgements: v })} />
              </div>
            </section>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 p-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Tip text={t("settings.quickRestartHint")}>
                    {t("settings.quickRestartKey")}
                  </Tip>
                </div>
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
                <Select
                  size="sm"
                  value={keyMode}
                  onChange={(e) => {
                    setCapturing(null);
                    setKeyMode(Number(e.target.value));
                  }}
                >
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((keys) => (
                    <option key={keys} value={keys}>
                      {keys}K
                    </option>
                  ))}
                </Select>
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
                <Tip text={t("settings.autoplayHint")}>{t("settings.autoplay")}</Tip>
              </h3>

              <div className="flex flex-col gap-3 text-xs text-slate-300">
                <SettingToggle
                  label={t("settings.showNpsGraph")} tip={t("settings.showNpsGraphHint")}
                  checked={playtest.showNpsGraph}
                  onChange={(v) => patchPlaytest({ showNpsGraph: v })}
                />
                <SettingToggle
                  label={t("settings.showRunStats")} tip={t("settings.showRunStatsHint")}
                  checked={playtest.showRunStats}
                  onChange={(v) => patchPlaytest({ showRunStats: v })}
                />
                <SettingToggle
                  label={t("settings.humanize")} tip={t("settings.humanizeHint")}
                  checked={playtest.humanize.enabled}
                  onChange={setHumanizeEnabled}
                />
              </div>

              <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs text-slate-300">
                      <Tip
                        text={t("settings.danHint", {
                          keys: DAN_LADDERS[ladders.regular].keyCount,
                        })}
                      >
                        {t("settings.danRegular")}
                      </Tip>
                      <Select
                        value={regularLevel}
                        onChange={(e) =>
                          setDanSkill(Number(e.target.value), lnLevel)
                        }
                      >
                        {DAN_LADDERS[ladders.regular].levels.map((lvl, i) => (
                          <option key={lvl.label} value={i}>
                            {lvl.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-300">
                      <span>{t("settings.danLn")}</span>
                      <Select
                        value={lnLevel}
                        onChange={(e) =>
                          setDanSkill(regularLevel, Number(e.target.value))
                        }
                      >
                        {DAN_LADDERS[ladders.ln].levels.map((lvl, i) => (
                          <option key={lvl.label} value={i}>
                            {lvl.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>

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
                  <label className="flex flex-col gap-1 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <Tip text={t("settings.humanizeSeedHint")}>{t("settings.humanizeSeed")}</Tip>
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
                  </label>
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "Audio" && (
          <div className="flex flex-col gap-6">
            {onAudioSetup && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("settings.audioOutput")}
                </h3>
                <Button variant="primary" onClick={onAudioSetup}>
                  {t("settings.audioSetup")}
                </Button>
                <p className="mt-2 text-[11px] text-slate-500">
                  {t("settings.audioSetupHint")}
                </p>
              </section>
            )}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.hitsounds")}
              </h3>
              <div className="flex flex-col gap-4">
                <SettingToggle
                  label={t("settings.playHitsounds")}
                  tip={t("settings.hitsoundsHint")}
                  checked={hitsoundsEnabled}
                  onChange={onHitsoundsEnabled}
                />

                <div className="flex flex-col gap-2">
                </div>

                <SliderRow
                  label={t("settings.volume")}
                  tip={t("settings.hitsoundVolumeHint")}
                  display={`${Math.round(hitsoundVolume * 100)}%`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={hitsoundVolume}
                  disabled={!hitsoundsEnabled}
                  onChange={onHitsoundVolume}
                />
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.interfaceSounds")}
              </h3>
              <SettingToggle
                label={t("settings.uiSounds")}
                tip={t("settings.uiSoundsHint")}
                checked={uiSoundsEnabled}
                onChange={onUiSoundsEnabled}
              />
              <div className="mt-3">
                <SliderRow
                  label={t("settings.volume")}
                  display={`${Math.round(uiSoundVolume * 100)}%`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={uiSoundVolume}
                  disabled={!uiSoundsEnabled}
                  onChange={onUiSoundVolume}
                />
              </div>
            </section>
          </div>
        )}

        {tab === "Export" && (
          <div className="flex flex-col gap-6">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.backgroundImages")}
              </h3>
              <SettingToggle
                label={t("settings.convertPng")}
                tip={t("settings.convertPngHint")}
                checked={exportPngBackgroundsAsJpeg}
                onChange={onExportPngBackgroundsAsJpeg}
              />

              <div className="mt-4">
                <SliderRow
                  label={t("settings.jpegQuality")}
                  tip={t("settings.jpegQualityHint")}
                  display={`${Math.round(exportJpegQuality * 100)}%`}
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={exportJpegQuality}
                  disabled={!exportPngBackgroundsAsJpeg}
                  onChange={onExportJpegQuality}
                />
              </div>
            </section>
          </div>
        )}

        {tab === "Shortcuts" && (
          <ShortcutsSettings
            keybinds={editorKeybinds}
            onKeybinds={onEditorKeybinds}
            altWheelAction={altWheelAction}
          />
        )}
      </div>
    </Modal>
  );
}

function LegalSection() {
  const { t } = useLocale();
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("settings.legal")}
      </h3>
      <div className="flex flex-wrap gap-4 text-xs">
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="text-accent-soft underline-offset-2 hover:underline"
        >
          {t("settings.terms")}
        </a>
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-accent-soft underline-offset-2 hover:underline"
        >
          {t("startModal.privacyPolicy")}
        </a>
      </div>
    </section>
  );
}

function ResetDataSection() {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    void eraseLocalData().finally(() => {
      window.location.replace("/");
    });
  };

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("settings.resetData")}
      </h3>
      <p className="text-xs leading-relaxed text-slate-400">
        {t("settings.resetDataHint")}
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="rounded-lg border border-rose-500/50 bg-rose-600/20 px-3 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-600/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("settings.resetDataButton")}
        </button>
      </div>
      <HoldConfirmDialog
        open={confirming}
        title={t("settings.resetDataConfirmTitle")}
        message={t("settings.resetDataConfirmBody")}
        confirmLabel={t("settings.resetDataConfirmHold")}
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

function OsuFolderSection() {
  const { t } = useLocale();
  const [status, setStatus] = useState<OsuStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let live = true;
    void osuStatus().then((next) => {
      if (live) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!status?.supported) return null;

  const run = (fn: () => Promise<OsuStatus>) => {
    setBusy(true);
    setError(null);
    fn()
      .then(setStatus)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : t("osu.folderFailed")),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Tip text={t("settings.osuFolderHint")}>{t("settings.osuFolder")}</Tip>
      </h3>
      <p className="break-all text-xs text-slate-300">
        {status.root ?? (
          <span className="text-slate-500">{t("settings.osuFolderMissing")}</span>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => run(osuChooseRoot)} disabled={busy}>
          {t("settings.osuFolderChoose")}
        </Button>
        {status.chosen && (
          <Button onClick={() => run(osuForgetRoot)} disabled={busy}>
            {t("settings.osuFolderReset")}
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-[11px] text-rose-400">{error}</p>}
    </section>
  );
}

function AccountSyncIndicator({
  status,
  error,
}: {
  status: "idle" | "syncing" | "synced" | "error";
  error: string | null;
}) {
  const { t } = useLocale();
  const label =
    status === "syncing"
      ? t("accountSync.syncing")
      : status === "synced"
        ? t("accountSync.synced")
        : status === "error"
          ? t("accountSync.error")
          : t("accountSync.ready");
  return (
    <span
      className="flex w-[7.75rem] shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-ink-700/60 px-2 py-1 text-[11px] font-medium text-slate-300"
      title={error ?? label}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "syncing"
            ? "animate-pulse bg-sky-400"
            : status === "error"
              ? "bg-rose-500"
              : "bg-emerald-400"
        }`}
      />
      <span className="truncate">{label}</span>
    </span>
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
      <div className="flex items-center justify-between text-xs text-slate-300">
        <Tip text={hint}>{label}</Tip>
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
    </div>
  );
}

function SettingToggle({
  label,
  tip,
  diagram,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  tip?: string;
  diagram?: DiagramName;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 text-xs text-slate-300 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <Tip text={tip} diagram={diagram}>
        {label}
      </Tip>
      <Toggle
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
      />
    </div>
  );
}

function SettingSignIn({
  label,
  tip,
  action,
  onLogin,
}: {
  label: string;
  tip?: string;
  action: string;
  onLogin: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
      <span className="opacity-45">
        <Tip text={tip}>{label}</Tip>
      </span>
      <Button
        variant="accent"
        onClick={onLogin}
        className="whitespace-nowrap px-2.5 py-1 text-xs"
      >
        {action}
      </Button>
    </div>
  );
}

function SliderRow({
  label,
  tip,
  diagram,
  diagramValue,
  display,
  min,
  max,
  step,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  tip?: string;
  diagram?: DiagramName;
  diagramValue?: number;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 text-xs text-slate-300 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <Tip text={tip} diagram={diagram} value={diagramValue}>
        {label}
      </Tip>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ml-auto h-1.5 w-32 shrink-0 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed uimd:w-40"
      />
      <span className="w-12 shrink-0 text-right font-medium tabular-nums text-slate-200">
        {display}
      </span>
    </div>
  );
}

function Tip({
  text,
  diagram,
  value,
  children,
}: {
  text?: string;
  diagram?: DiagramName;
  value?: number;
  children: React.ReactNode;
}) {
  if (!text && !diagram) return <span>{children}</span>;
  return (
    <Tooltip
      content={
        <>
          {text && <p className="m-0">{text}</p>}
          {diagram && <SettingDiagram name={diagram} value={value} />}
        </>
      }
    >
      {children}
    </Tooltip>
  );
}
