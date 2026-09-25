import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import {
  Button,
  SegmentedControl,
  Select,
  Slider,
  Toggle,
} from "../ui/Controls";
import { Dropdown } from "../ui/Dropdown";
import { MAX_PLAYTEST_RATE, MIN_PLAYTEST_RATE } from "../../lib/playtestJudgements";
import { formatBytes } from "../../lib/progress";
import { formatMenuBackgroundRules } from "../../lib/menuBackground";
import type { CloudMenuBackground } from "../../lib/accountCloud";
import type { MenuBackgroundMode } from "../../types";
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
  PlaytestSettings,
} from "../../types";
import {
  assignPlaytestKey,
  settlePlaytestKeys,
  keyLabel,
  keybindWarnings,
} from "../../lib/playtestKeybinds";
import { PRESET_SKINS } from "../../lib/presetSkins";
import {
  parsePlaytestSkinValue,
  playtestSkinValue,
} from "../../lib/playtestSkin";
import { useLocale, type Locale, type MessageKey } from "../../lib/i18n";
import { LOCALES } from "../../lib/i18n/core";
import type { EditorKeybinds } from "../../lib/editorKeybinds";
import { ShortcutsSettings } from "./ShortcutsSettings";
import {
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  UI_SCALE_STEP,
} from "../../lib/uiScale";
import { MENU_ACCENTS } from "../../lib/menuTheme";
import { siteUrl } from "../../lib/siteAssets";

type Props = {
  onAudioSetup?: () => void;
  initialTab?: SettingsTab;
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
  showSkillsetGraph: boolean;
  onShowSkillsetGraph: (value: boolean) => void;
  colourblindLanes: boolean;
  onColourblindLanes: (value: boolean) => void;
  snapColouredNotes: boolean;
  onSnapColouredNotes: (value: boolean) => void;
  moveNotesWithTiming: boolean;
  onMoveNotesWithTiming: (value: boolean) => void;
  onShowPpCounter: (value: boolean) => void;
  showPatternTools: boolean;
  onShowPatternTools: (value: boolean) => void;
  hitsoundsEnabled: boolean;
  onHitsoundsEnabled: (value: boolean) => void;
  hitsoundVolume: number;
  onHitsoundVolume: (value: number) => void;
  masterVolume: number;
  onMasterVolume: (value: number) => void;
  musicVolume: number;
  onMusicVolume: (value: number) => void;
  keepPitchWhenSlowed: boolean;
  onKeepPitchWhenSlowed: (value: boolean) => void;
  dimBackground: number;
  onDimBackground: (value: number) => void;
  backgroundBlur: number;
  onBackgroundBlur: (value: number) => void;
  smoothScrolling: boolean;
  onSmoothScrolling: (value: boolean) => void;
  showWaveform: boolean;
  onShowWaveform: (value: boolean) => void;
  waveformTransparency: number;
  onWaveformTransparency: (value: number) => void;
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
  onOpenHudEditor?: () => void;
  /** File names of the imported skins playtest can use. */
  savedSkinNames: string[];
  localAutosaveEnabled: boolean;
  onLocalAutosaveEnabled: (value: boolean) => void;
  exportPngBackgroundsAsJpeg: boolean;
  onExportPngBackgroundsAsJpeg: (value: boolean) => void;
  exportJpegQuality: number;
  onExportJpegQuality: (value: number) => void;
  addCascadeTag: boolean;
  onAddCascadeTag: (value: boolean) => void;
  offerMapCardAfterExport: boolean;
  onOfferMapCardAfterExport: (value: boolean) => void;
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
  menuBackgroundMode: MenuBackgroundMode;
  onMenuBackgroundMode: (value: MenuBackgroundMode) => void;
  menuBackground: CloudMenuBackground | null;
  menuBackgroundUrl: string | null;
  menuBackgroundBusy: boolean;
  menuBackgroundError: string | null;
  onUploadMenuBackground: (file: File) => Promise<void>;
  onRemoveMenuBackground: () => Promise<void>;
  logoSkinHitsounds: boolean;
  onLogoSkinHitsounds: (value: boolean) => void;
  menuTipsEnabled: boolean;
  onMenuTipsEnabled: (value: boolean) => void;
  introEnabled: boolean;
  onIntroEnabled: (value: boolean) => void;
  shortcutNoticesEnabled: boolean;
  onShortcutNoticesEnabled: (value: boolean) => void;
  performanceMode: boolean;
  onPerformanceMode: (value: boolean) => void;
  osuListenerEnabled: boolean;
  onOsuListenerEnabled: (value: boolean) => void;
  keyCount: number;
  accountSyncStatus: "idle" | "syncing" | "synced" | "error" | null;
  accountSyncError: string | null;
};

const TABS = ["General", "Editor", "Playtest", "Audio", "Export", "Shortcuts"] as const;
export type SettingsTab = (typeof TABS)[number];
type Tab = SettingsTab;

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
  initialTab,
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
  showSkillsetGraph,
  onShowSkillsetGraph,
  colourblindLanes,
  onColourblindLanes,
  snapColouredNotes,
  onSnapColouredNotes,
  moveNotesWithTiming,
  onMoveNotesWithTiming,
  onShowPpCounter,
  showPatternTools,
  onShowPatternTools,
  hitsoundsEnabled,
  onHitsoundsEnabled,
  hitsoundVolume,
  onHitsoundVolume,
  masterVolume,
  onMasterVolume,
  musicVolume,
  onMusicVolume,
  keepPitchWhenSlowed,
  onKeepPitchWhenSlowed,
  dimBackground,
  onDimBackground,
  backgroundBlur,
  onBackgroundBlur,
  smoothScrolling,
  onSmoothScrolling,
  showWaveform,
  onShowWaveform,
  waveformTransparency,
  onWaveformTransparency,
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
  onOpenHudEditor,
  savedSkinNames,
  localAutosaveEnabled,
  onLocalAutosaveEnabled,
  exportPngBackgroundsAsJpeg,
  onExportPngBackgroundsAsJpeg,
  exportJpegQuality,
  onExportJpegQuality,
  addCascadeTag,
  onAddCascadeTag,
  offerMapCardAfterExport,
  onOfferMapCardAfterExport,
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
  menuBackgroundMode,
  onMenuBackgroundMode,
  menuBackground,
  menuBackgroundUrl,
  menuBackgroundBusy,
  menuBackgroundError,
  onUploadMenuBackground,
  onRemoveMenuBackground,
  logoSkinHitsounds,
  onLogoSkinHitsounds,
  menuTipsEnabled,
  onMenuTipsEnabled,
  introEnabled,
  onIntroEnabled,
  shortcutNoticesEnabled,
  onShortcutNoticesEnabled,
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
  const [keyMode, setKeyMode] = useState(() =>
    keyCount >= 1 && keyCount <= 18 ? keyCount : 4,
  );
  // Lanes still waiting for a key; the first one is listening.
  const [captureQueue, setCaptureQueueState] = useState<number[]>([]);
  const capturing = captureQueue[0] ?? null;
  // Mirrors of the pass for handlers that run before a re-render (a blur fired
  // by moving focus to the next lane), plus the lanes set so far in the pass.
  const captureQueueRef = useRef<number[]>([]);
  const typedLanesRef = useRef<number[]>([]);
  const setCaptureQueue = (queue: number[]) => {
    captureQueueRef.current = queue;
    if (!queue.length) typedLanesRef.current = [];
    setCaptureQueueState(queue);
  };
  const laneButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [capturingRestart, setCapturingRestart] = useState(false);
  const selectedKeybinds = playtest.keybinds[keyMode] ?? [];
  const warnings = keybindWarnings(selectedKeybinds);

  useEffect(() => {
    if (open) setTab(initialTab ?? "General");
  }, [initialTab, open]);

  const patchPlaytest = (patch: Partial<PlaytestSettings>) => {
    onPlaytest({ ...playtest, ...patch });
  };

  const laneKeys = () =>
    Array.from({ length: keyMode }, (_, i) => selectedKeybinds[i] || "");
  const saveLaneKeys = (keys: string[]) =>
    patchPlaytest({ keybinds: { ...playtest.keybinds, [keyMode]: keys } });

  // Binding a lane moves straight on to the next one, and a lane that loses
  // its key to another is asked for a new one before capture ends.
  const captureKey = (code: string) => {
    const { keys, queue, typed } = assignPlaytestKey(
      laneKeys(),
      captureQueueRef.current,
      code,
      typedLanesRef.current,
    );
    saveLaneKeys(keys);
    setCaptureQueue(queue);
    typedLanesRef.current = queue.length ? typed : [];
    if (queue.length) laneButtonRefs.current[queue[0]]?.focus();
  };

  // Stopping a pass early still settles clashes the typed lanes left behind.
  const stopCapture = () => {
    if (typedLanesRef.current.length) {
      saveLaneKeys(settlePlaytestKeys(laneKeys(), typedLanesRef.current).keys);
    }
    setCaptureQueue([]);
  };

  const clearLane = (column: number) => {
    const keys = laneKeys();
    keys[column] = "";
    saveLaneKeys(keys);
    setCaptureQueue([]);
  };

  // A saved skin picked earlier and since removed stays listed, so the
  // select still shows what is stored.
  const savedSkinOptions =
    playtest.skin?.source === "saved" &&
    !savedSkinNames.includes(playtest.skin.fileName)
      ? [...savedSkinNames, playtest.skin.fileName]
      : savedSkinNames;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      accent={MENU_ACCENTS.settings}
      width="max-w-4xl"
      height="h-[84vh]"
      headerExtra={
        accountSyncStatus ? (
          <AccountSyncIndicator
            status={accountSyncStatus}
            error={accountSyncError}
          />
        ) : null
      }
    >
      {/* One height for every tab (set on the Modal above), so switching
          tabs never moves the tab bar out from under the pointer. */}
      <div className="flex flex-col gap-5">
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
              <Dropdown
                className="w-full"
                aria-label={t("settings.language")}
                value={locale}
                options={LOCALES.map((option) => ({
                  value: option.code,
                  label: option.nativeName,
                }))}
                onChange={(next: Locale) => setLocale(next)}
              />
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
                display={(v) => `${Math.round(v * 100)}%`}
                min={MIN_UI_SCALE}
                max={MAX_UI_SCALE}
                step={UI_SCALE_STEP}
                value={uiScale}
                commitOnRelease
                onChange={onUiScale}
              />
              <div className="mt-4">
                <span className="text-sm text-slate-200">
                  <Tip text={t("settings.altWheelHint")}>
                    {t("settings.altWheelAction")}
                  </Tip>
                </span>
                <Dropdown
                  className="mt-2 w-full"
                  aria-label={t("settings.altWheelAction")}
                  value={altWheelAction}
                  options={ALT_WHEEL_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.label),
                  }))}
                  onChange={onAltWheelAction}
                />
              </div>
              <div className="mt-4">
                <SettingToggle
                  label={t("settings.shortcutNotices")}
                  tip={t("settings.shortcutNoticesHint")}
                  checked={shortcutNoticesEnabled}
                  onChange={onShortcutNoticesEnabled}
                />
              </div>
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
                <SettingToggle
                  label={t("settings.logoSkinHitsounds")}
                  tip={t("settings.logoSkinHitsoundsHint")}
                  checked={logoSkinHitsounds}
                  onChange={onLogoSkinHitsounds}
                />
                <SettingToggle
                  label={t("settings.menuTips")}
                  tip={t("settings.menuTipsHint")}
                  checked={menuTipsEnabled}
                  onChange={onMenuTipsEnabled}
                />
                <SettingToggle
                  label={t("settings.sessionIntro")}
                  tip={t("settings.sessionIntroHint")}
                  checked={introEnabled}
                  onChange={onIntroEnabled}
                />
                <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-slate-200">
                      <Tip text={t("settings.menuBackgroundHint")}>
                        {t("settings.menuBackground")}
                      </Tip>
                    </span>
                    <SegmentedControl
                      className="w-56"
                      value={menuBackgroundMode}
                      onChange={onMenuBackgroundMode}
                      options={[
                        {
                          value: "song",
                          label: t("settings.menuBackgroundSong"),
                        },
                        {
                          value: "custom",
                          label: t("settings.menuBackgroundCustom"),
                        },
                      ]}
                    />
                  </div>

                  {!user ? (
                    <p className="rounded-lg border border-white/10 bg-ink-700/40 px-3 py-2 text-[11px] text-slate-400">
                      {t("settings.menuBackgroundSignIn")}
                    </p>
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-ink-700/40 p-2.5">
                      <div className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-ink-900/60">
                        {menuBackgroundUrl ? (
                          <img
                            src={menuBackgroundUrl}
                            alt=""
                            aria-hidden
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate text-xs text-slate-200"
                          title={menuBackground?.filename}
                        >
                          {menuBackground?.filename ??
                            t("settings.menuBackgroundEmpty")}
                        </div>
                        <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
                          {menuBackground
                            ? `${menuBackground.width}×${menuBackground.height} · ${formatBytes(
                                menuBackground.bytes,
                              )}`
                            : formatMenuBackgroundRules()}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <label
                          className={`inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-2.5 text-xs font-medium text-slate-200 transition duration-[var(--motion-quick)] hover:bg-ink-500/85 ${
                            menuBackgroundBusy
                              ? "pointer-events-none opacity-40"
                              : ""
                          }`}
                        >
                          {menuBackgroundBusy
                            ? "…"
                            : menuBackground
                              ? t("settings.menuBackgroundReplace")
                              : t("settings.menuBackgroundUpload")}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/avif"
                            className="hidden"
                            disabled={menuBackgroundBusy}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void onUploadMenuBackground(file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        {menuBackground && (
                          <Button
                            className="px-2 py-1 text-xs"
                            disabled={menuBackgroundBusy}
                            onClick={() => void onRemoveMenuBackground()}
                          >
                            {t("settings.menuBackgroundRemove")}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {menuBackgroundError && (
                    <p className="text-[11px] text-rose-300">
                      {menuBackgroundError}
                    </p>
                  )}
                </div>
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
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
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
          <div className="flex flex-col gap-8">
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.layout")}
              </h3>
              <div className="flex flex-col gap-4">
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
                <SettingToggle
                  label={t("settings.showSkillsetGraph")}
                  tip={t("settings.showSkillsetGraphHint")}
                  checked={showSkillsetGraph}
                  disabled={!showBottomTimeline}
                  onChange={onShowSkillsetGraph}
                />
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.playfield")}
              </h3>
              <div className="flex flex-col gap-4">
                <SettingToggle
                  label={t("settings.colourblindLanes")}
                  tip={t("settings.colourblindLanesHint")}
                  checked={colourblindLanes}
                  onChange={onColourblindLanes}
                />
                <SettingToggle
                  label={t("settings.snapColouredNotes")}
                  tip={t("settings.snapColouredNotesHint")}
                  checked={snapColouredNotes}
                  onChange={onSnapColouredNotes}
                />
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
                  label={t("settings.backgroundBlur")}
                  tip={t("settings.backgroundBlurHint")}
                  display={`${Math.round(backgroundBlur)}px`}
                  min={0}
                  max={40}
                  step={1}
                  value={backgroundBlur}
                  onChange={onBackgroundBlur}
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
                <div className="flex flex-col gap-4">
                  <SettingToggle
                    label={t("settings.waveformOnLane")}
                    tip={t("settings.waveformHint")}
                    diagram="waveform"
                    checked={showWaveform}
                    onChange={onShowWaveform}
                  />
                  <SliderRow
                    label={t("settings.waveformTransparency")}
                    tip={t("settings.waveformTransparencyHint")}
                    display={`${Math.round(waveformTransparency)}%`}
                    min={0}
                    max={100}
                    step={1}
                    value={waveformTransparency}
                    disabled={!showWaveform}
                    onChange={onWaveformTransparency}
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
              <div className="flex flex-col gap-4">
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
              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-200">
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
                    className={`inline-block leading-none transition-transform duration-300 ease-[var(--ease-emphasized)] ${
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
                {t("nav.timing")}
              </h3>
              <div className="flex flex-col gap-4">
                <SettingToggle
                  label={t("settings.moveNotesWithTiming")}
                  tip={t("settings.moveNotesWithTimingHint")}
                  checked={moveNotesWithTiming}
                  onChange={onMoveNotesWithTiming}
                />
              </div>
            </section>
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.longNotes")}
              </h3>
              <div className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-7">
            <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div aria-hidden="true" className="w-28 shrink-0">
                <SettingDiagram name="hud" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-100">{t("settings.hudEditorTitle")}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{t("settings.hudEditorDesc")}</p>
                <Button variant="accent" className="mt-3" disabled={!onOpenHudEditor} onClick={onOpenHudEditor}>
                  {t("settings.hudEditorOpen")}
                </Button>
                {!onOpenHudEditor && <p className="mt-2 text-[11px] text-slate-500">{t("settings.hudEditorNeedsMap")}</p>}
              </div>
            </div>
            <section>
              <SectionTitle>{t("settings.ptGameplay")}</SectionTitle>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <Tip text={t("settings.rateHint")}>{t("settings.rate")}</Tip>
                    <div className="ml-auto flex flex-wrap justify-end gap-1">
                      {PLAYTEST_RATES.map((r) => {
                        const on = Math.abs((playtest.rate ?? 1) - r) < 0.001;
                        return (
                          <button
                            key={r}
                            type="button"
                            aria-pressed={on}
                            onClick={() => patchPlaytest({ rate: r })}
                            className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums transition duration-[var(--motion-quick)] ${
                              on
                                ? "bg-accent text-white shadow-sm"
                                : "bg-ink-700/70 text-slate-300 hover:bg-ink-600 hover:text-slate-100"
                            }`}
                          >
                            {r}×
                          </button>
                        );
                      })}
                    </div>
                    <NumberBox
                      label={t("settings.rate")}
                      value={playtest.rate ?? 1}
                      min={MIN_PLAYTEST_RATE}
                      max={MAX_PLAYTEST_RATE}
                      step={0.05}
                      unit="×"
                      onChange={(rate) => patchPlaytest({ rate })}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section>
              <SectionTitle>{t("settings.ptAppearance")}</SectionTitle>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 text-sm text-slate-200">
                  <Tip text={t("settings.playtestSkinHint")}>{t("settings.playtestSkin")}</Tip>
                  <Select
                    className="ml-auto w-56"
                    value={playtestSkinValue(playtest.skin)}
                    onChange={(e) =>
                      patchPlaytest({ skin: parsePlaytestSkinValue(e.target.value) })
                    }
                  >
                    <option value="">{t("settings.playtestSkinEditor")}</option>
                    <option value="none">{t("settings.playtestSkinDefault")}</option>
                    {PRESET_SKINS.length > 0 && (
                      <optgroup label={t("settings.playtestSkinPresets")}>
                        {PRESET_SKINS.map((preset) => (
                          <option
                            key={preset.fileName}
                            value={playtestSkinValue({
                              source: "preset",
                              fileName: preset.fileName,
                            })}
                          >
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {savedSkinOptions.length > 0 && (
                      <optgroup label={t("settings.playtestSkinSaved")}>
                        {savedSkinOptions.map((name) => (
                          <option
                            key={name}
                            value={playtestSkinValue({ source: "saved", fileName: name })}
                          >
                            {name.replace(/\.osk$/i, "")}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <SectionTitle inline>{t("settings.keybinds")}</SectionTitle>
                <Select
                  size="sm"
                  value={keyMode}
                  aria-label={t("settings.keyMode")}
                  onChange={(e) => {
                    stopCapture();
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
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.min(keyMode, 9)}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: keyMode }, (_, i) => (
                  <button
                    key={i}
                    ref={(el) => {
                      laneButtonRefs.current[i] = el;
                    }}
                    type="button"
                    // Space binds a lane and then clicks whichever lane is
                    // listening next; that click must not restart capture.
                    onClick={() => {
                      if (capturing === i) return;
                      setCaptureQueue(
                        Array.from({ length: keyMode - i }, (_, offset) => i + offset),
                      );
                    }}
                    onBlur={() => {
                      if (captureQueueRef.current[0] === i) stopCapture();
                    }}
                    onKeyDown={(e) => {
                      if (capturing !== i) return;
                      e.preventDefault();
                      if (e.key === "Escape") stopCapture();
                      else if (e.key === "Backspace" || e.key === "Delete") {
                        clearLane(i);
                      } else captureKey(e.code);
                    }}
                    className={`flex min-h-[3rem] flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-sm font-semibold transition ${
                      capturing === i
                        ? "border-accent/80 bg-accent/20 text-slate-100"
                        : !selectedKeybinds[i]
                          ? "border-amber-400/50 bg-ink-700/60 text-amber-200 hover:border-accent/50"
                          : "border-white/10 bg-ink-700/60 text-slate-200 hover:border-accent/50"
                    }`}
                  >
                    <span className="text-[10px] font-medium text-slate-500">{i + 1}</span>
                    <span className="truncate">
                      {capturing === i ? "…" : keyLabel(selectedKeybinds[i] || "")}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {capturing !== null ? t("settings.keybindsCapturing") : t("settings.keybindsHint")}
              </p>
              {warnings.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-300">{warnings.join(" · ")}</p>
              )}
              <div className="mt-4 flex items-center gap-3 text-sm text-slate-200">
                <Tip text={t("settings.quickRestartHint")}>{t("settings.quickRestartKey")}</Tip>
                <button
                  type="button"
                  onClick={() => setCapturingRestart(true)}
                  onBlur={() => setCapturingRestart(false)}
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
                  className={`ml-auto min-w-[5.5rem] shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    capturingRestart
                      ? "border-accent/80 bg-accent/20 text-slate-100"
                      : "border-white/10 bg-ink-700/60 text-slate-200 hover:border-accent/50"
                  }`}
                >
                  {capturingRestart ? t("settings.pressKey") : keyLabel(playtest.quickRestartKey)}
                </button>
              </div>
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
                {t("settings.volume")}
              </h3>
              <div className="flex flex-col gap-4">
                <SliderRow
                  label={t("settings.masterVolume")}
                  tip={t("settings.masterVolumeHint")}
                  display={`${Math.round(masterVolume * 100)}%`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={masterVolume}
                  onChange={onMasterVolume}
                />
                <SliderRow
                  label={t("settings.musicVolume")}
                  tip={t("settings.musicVolumeHint")}
                  display={`${Math.round(musicVolume * 100)}%`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={musicVolume}
                  onChange={onMusicVolume}
                />
                <SliderRow
                  label={t("settings.effectsVolume")}
                  tip={t("settings.hitsoundVolumeHint")}
                  display={`${Math.round(hitsoundVolume * 100)}%`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={hitsoundVolume}
                  onChange={onHitsoundVolume}
                />
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.playback")}
              </h3>
              <SettingToggle
                label={t("settings.keepPitch")}
                tip={t("settings.keepPitchHint")}
                checked={keepPitchWhenSlowed}
                onChange={onKeepPitchWhenSlowed}
              />
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.hitsounds")}
              </h3>
              <SettingToggle
                label={t("settings.playHitsounds")}
                tip={t("settings.hitsoundsHint")}
                checked={hitsoundsEnabled}
                onChange={onHitsoundsEnabled}
              />
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

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.mapTags")}
              </h3>
              <SettingToggle
                label={t("settings.cascadeTag")}
                tip={t("settings.cascadeTagHint")}
                checked={addCascadeTag}
                onChange={onAddCascadeTag}
              />
            </section>

            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("settings.mapCard")}
              </h3>
              <SettingToggle
                label={t("settings.mapCardPrompt")}
                tip={t("settings.mapCardPromptHint")}
                checked={offerMapCardAfterExport}
                onChange={onOfferMapCardAfterExport}
              />
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
          href={siteUrl("terms")}
          target="_blank"
          rel="noreferrer"
          className="text-accent-soft underline-offset-2 hover:underline"
        >
          {t("settings.terms")}
        </a>
        <a
          href={siteUrl("privacy")}
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
      <p className="break-all text-sm text-slate-200">
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

const PLAYTEST_RATES = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];

function SectionTitle({
  children,
  inline = false,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <h3
      className={`${inline ? "" : "mb-3 "}text-xs font-semibold uppercase tracking-wide text-slate-400`}
    >
      {children}
    </h3>
  );
}

/**
 * A number field that lets a value be typed in full (a minus sign, a
 * half-typed decimal) and only applies it once it parses and fits.
 */
function NumberBox({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 100) / 100);
  const commit = (raw: string) => {
    const next = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(next)) return;
    onChange(Math.min(max, Math.max(min, next)));
  };
  return (
    <label className="flex w-24 shrink-0 items-center rounded-lg border border-white/10 bg-ink-700/65 pr-2 transition focus-within:border-accent/60">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setDraft(null)}
        className="w-full min-w-0 bg-transparent px-2 py-1.5 text-right text-sm tabular-nums text-slate-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && <span className="text-xs text-slate-500">{unit}</span>}
    </label>
  );
}

/** A setting with a slider for quick changes and a box for exact values. */


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
      className={`flex items-center justify-between gap-3 text-sm text-slate-200 ${
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
    <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
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
  commitOnRelease = false,
  onChange,
}: {
  label: string;
  tip?: string;
  diagram?: DiagramName;
  diagramValue?: number;
  display: string | ((value: number) => string);
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  /** Hold the value locally while dragging and apply it on release. */
  commitOnRelease?: boolean;
  onChange: (value: number) => void;
}) {
  // The interface-scale slider resizes itself as it applies: the thumb slides
  // out from under the pointer and the whole UI flickers between sizes. With
  // commitOnRelease a drag therefore only moves a local draft, applied when
  // the drag ends; keyboard steps end at once, so they still apply straight
  // away.
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;

  return (
    <div
      className={`flex items-center gap-3 text-sm text-slate-200 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <Tip
        text={tip}
        diagram={diagram}
        value={draft !== null && diagramValue !== undefined ? draft : diagramValue}
      >
        {label}
      </Tip>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        onChange={(next) => (commitOnRelease ? setDraft(next) : onChange(next))}
        onChangeEnd={(next) => {
          if (!commitOnRelease) return;
          setDraft(null);
          onChange(next);
        }}
        className="ml-auto w-40 shrink-0 uimd:w-56"
      />
      <span className="w-14 shrink-0 text-right font-medium tabular-nums text-slate-200">
        {typeof display === "function" ? display(shown) : display}
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
