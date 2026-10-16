import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal } from "../ui/Modal";
import { Button, INPUT_CLASS, SegmentedControl, Slider, Toggle } from "../ui/Controls";
import { buttonClass } from "../ui/buttonStyles";
import { Dropdown } from "../ui/Dropdown";
import { MAX_PLAYTEST_RATE, MIN_PLAYTEST_RATE } from "../../lib/playtestJudgements";
import { formatBytes } from "../../lib/progress";
import { formatMenuBackgroundRules } from "../../lib/menuBackground";
import {
  MAX_HOLD_CONFIRM_MS,
  MAX_PARALLAX_STRENGTH,
  MIN_HOLD_CONFIRM_MS,
} from "../../lib/interfaceFeel";
import type { CloudMenuBackground } from "../../lib/accountCloud";
import type { MenuBackgroundMode } from "../../types";
import { SettingDiagram, type DiagramName } from "../ui/SettingDiagrams";
import { HoldConfirmDialog } from "../ui/HoldConfirmDialog";
import { useAuth } from "../../lib/auth";
import { usePhoneViewport } from "../../hooks/usePhoneViewport";
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
} from "../../types";
import {
  assignPlaytestKey,
  settlePlaytestKeys,
  keyLabel,
  keybindWarnings,
} from "../../lib/playtestKeybinds";
import {
  DAN_LADDERS,
  combineDans,
  danSelectionForKeyCount,
  laddersForKeyCount,
  lnLevelForSkill,
  regularLevelForSkill,
  resolveSkillForKeyCount,
} from "../../lib/danSkill";
import { PRESET_SKINS } from "../../lib/presetSkins";
import {
  parsePlaytestSkinValue,
  playtestSkinValue,
} from "../../lib/playtestSkin";
import { useLocale, useT, type Locale, type MessageKey } from "../../lib/i18n";
import { LOCALES } from "../../lib/i18n/core";
import type { EditorKeybinds } from "../../lib/editorKeybinds";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { SocialPrivacySettings } from "./SocialPrivacySettings";
import {
  SettingRow,
  SettingsExtra,
  SettingsInfoPane,
  SettingsInfoProvider,
  SettingsSearchScope,
  SettingsSection,
  SliderValue,
} from "./settingsLayout";
import { searchWords } from "../../lib/settingsSearch";
import {
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  UI_SCALE_STEP,
} from "../../lib/uiScale";
import { MENU_ACCENTS } from "../../lib/menuTheme";
import { siteUrl } from "../../lib/siteAssets";

type Props = {
  /** Shows the Social & privacy tab (the social feature flag). */
  socialEnabled?: boolean;
  onOpenProfile?: () => void;
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
  showMapOverview: boolean;
  onShowMapOverview: (value: boolean) => void;
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
  unfocusedVolume: number;
  onUnfocusedVolume: (value: number) => void;
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
  shareUsageStats: boolean;
  onShareUsageStats: (value: boolean) => void;
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
  customSnapDivisors: number[];
  onCustomSnapDivisors: (value: number[]) => void;
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
  preferOriginalMetadata: boolean;
  onPreferOriginalMetadata: (value: boolean) => void;
  holdConfirmMs: number;
  onHoldConfirmMs: (value: number) => void;
  parallaxStrength: number;
  onParallaxStrength: (value: number) => void;
  onShortcutNoticesEnabled: (value: boolean) => void;
  performanceMode: boolean;
  onPerformanceMode: (value: boolean) => void;
  osuListenerEnabled: boolean;
  onOsuListenerEnabled: (value: boolean) => void;
  keyCount: number;
  accountSyncStatus: "idle" | "syncing" | "synced" | "error" | null;
  accountSyncError: string | null;
};

const TABS = ["General", "Editor", "Playtest", "Audio", "Export", "Shortcuts", "Social"] as const;
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
  Social: "settings.tabSocial",
};

export function AppSettingsModal({
  socialEnabled = false,
  onOpenProfile,
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
  showMapOverview,
  onShowMapOverview,
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
  unfocusedVolume,
  onUnfocusedVolume,
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
  shareUsageStats,
  onShareUsageStats,
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
  customSnapDivisors,
  onCustomSnapDivisors,
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
  preferOriginalMetadata,
  onPreferOriginalMetadata,
  holdConfirmMs,
  onHoldConfirmMs,
  parallaxStrength,
  onParallaxStrength,
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
  const [query, setQuery] = useState("");
  const words = useMemo(() => searchWords(query), [query]);
  const searching = words.length > 0;
  // Searching lists every category; otherwise only the open one renders.
  const show = (name: Tab) => searching || tab === name;
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
    if (open) setTab(initialTab === "Social" && !socialEnabled ? "General" : initialTab ?? "General");
    if (open) setQuery("");
  }, [initialTab, open, socialEnabled]);

  const patchPlaytest = (patch: Partial<PlaytestSettings>) => {
    onPlaytest({ ...playtest, ...patch });
  };

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

  // Turning humanizing on starts the autoplayer at Alpha, the rung the dan
  // ladder treats as a competent player, rather than whatever the skill was
  // last left at.
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
          ? combineDans(keyCount, alphaLevel, lnLevel, playtest.skill.danSelections)
          : playtest.skill,
    });
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

  const visibleTabs = TABS.filter((name) => name !== "Social" || socialEnabled);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      accent={MENU_ACCENTS.settings}
      width="max-w-6xl"
      height="h-[min(88vh,50rem)]"
      bodyClassName="p-0 !overflow-hidden"
      headerExtra={
        accountSyncStatus ? (
          <AccountSyncIndicator
            status={accountSyncStatus}
            error={accountSyncError}
          />
        ) : null
      }
    >
      <SettingsWorkspace
        tab={tab}
        onTab={(next) => {
          setTab(next);
          setQuery("");
        }}
        tabs={visibleTabs}
        wideContent={!searching && tab === "Shortcuts"}
        query={query}
        onQuery={setQuery}
        searching={searching}
      >
        {show("General") && (
          <SettingsCategory name="General" words={words}>
            <SettingsSection title={t("settings.interface")}>
              <SettingRow label={t("settings.language")}>
                <Dropdown
                  className="w-48"
                  aria-label={t("settings.language")}
                  value={locale}
                  options={LOCALES.map((option) => ({
                    value: option.code,
                    label: option.nativeName,
                  }))}
                  onChange={(next: Locale) => setLocale(next)}
                />
              </SettingRow>
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
              <SettingRow label={t("settings.altWheelAction")} tip={t("settings.altWheelHint")}>
                <Dropdown
                  className="w-48"
                  aria-label={t("settings.altWheelAction")}
                  value={altWheelAction}
                  options={ALT_WHEEL_OPTIONS.map((option) => ({
                    value: option.value,
                    label: t(option.label),
                  }))}
                  onChange={onAltWheelAction}
                />
              </SettingRow>
              <SettingToggle
                label={t("settings.shortcutNotices")}
                tip={t("settings.shortcutNoticesHint")}
                checked={shortcutNoticesEnabled}
                onChange={onShortcutNoticesEnabled}
              />
              <SettingToggle
                label={t("settings.preferOriginalMetadata")}
                tip={t("settings.preferOriginalMetadataHint")}
                checked={preferOriginalMetadata}
                onChange={onPreferOriginalMetadata}
              />
              <SliderRow
                label={t("settings.holdConfirm")}
                tip={t("settings.holdConfirmHint")}
                display={(v) => `${Math.round(v)} ms`}
                min={MIN_HOLD_CONFIRM_MS}
                max={MAX_HOLD_CONFIRM_MS}
                step={50}
                value={holdConfirmMs}
                commitOnRelease
                onChange={onHoldConfirmMs}
              />
              <SliderRow
                label={t("settings.parallaxStrength")}
                tip={t("settings.parallaxStrengthHint")}
                display={(v) => `${Math.round(v * 100)}%`}
                min={0}
                max={MAX_PARALLAX_STRENGTH}
                step={0.05}
                value={parallaxStrength}
                commitOnRelease
                onChange={onParallaxStrength}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.mainMenu")}>
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
              <SettingRow
                label={t("settings.menuBackground")}
                tip={t("settings.menuBackgroundHint")}
              >
                <SegmentedControl
                  size="sm"
                  className="w-52"
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
              </SettingRow>
              <SettingsExtra
                keywords={[t("settings.menuBackground"), t("settings.menuBackgroundHint")]}
                className="flex flex-col gap-2 py-3"
              >
                {!user ? (
                  <p className="text-xs leading-relaxed text-slate-400">
                    {t("settings.menuBackgroundSignIn")}
                  </p>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-md bg-black/30 ring-1 ring-inset ring-white/[0.08]">
                      {menuBackgroundUrl ? (
                        <img
                          src={menuBackgroundUrl}
                          alt=""
                          aria-hidden
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-2xs text-slate-600">—</span>
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
                      <div className="mt-0.5 text-2xs leading-snug text-slate-500">
                        {menuBackground
                          ? `${menuBackground.width}×${menuBackground.height} · ${formatBytes(
                              menuBackground.bytes,
                            )}`
                          : formatMenuBackgroundRules()}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <label
                        className={buttonClass(
                          "primary",
                          "sm",
                          `cursor-pointer ${menuBackgroundBusy ? "pointer-events-none opacity-40" : ""}`,
                        )}
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
                          size="sm"
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
                  <p className="text-xs text-rose-300">{menuBackgroundError}</p>
                )}
              </SettingsExtra>
            </SettingsSection>

            <SettingsSection title={t("settings.performance")}>
              <SettingToggle
                label={t("settings.performanceMode")}
                tip={t("settings.performanceModeHint")}
                checked={performanceMode}
                onChange={onPerformanceMode}
              />
              {performanceMode && (
                <SettingsExtra keywords={[t("settings.performanceMode")]}>
                  <p className="py-2.5 text-xs leading-relaxed text-slate-400">
                    {t("settings.performanceModeNote")}
                  </p>
                </SettingsExtra>
              )}
            </SettingsSection>

            <SettingsSection title={t("settings.savingPrivacy")}>
              <SettingToggle
                label={t("settings.autosave")}
                tip={t("settings.autosaveHint")}
                checked={localAutosaveEnabled}
                onChange={onLocalAutosaveEnabled}
              />
              <SettingToggle
                label={t("settings.usageStats")}
                tip={t("settings.usageStatsHint")}
                checked={shareUsageStats}
                onChange={onShareUsageStats}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.presence")}>
              {user ? (
                <SettingToggle
                  label={t("settings.showMenuPlayers")}
                  tip={t("settings.presenceHint")}
                  checked={showMenuPlayers}
                  onChange={onShowMenuPlayers}
                />
              ) : (
                <SettingRow
                  label={t("settings.showMenuPlayers")}
                  tip={t("settings.presenceSignedOut")}
                >
                  <Button variant="accent" size="sm" onClick={login}>
                    {t("startModal.loginWithOsu")}
                  </Button>
                </SettingRow>
              )}
              <SettingToggle
                label={t("settings.hideStatus")}
                checked={hideStatus}
                onChange={onHideStatus}
                disabled={!user}
              />
              {isDesktopApp() && (
                <SettingRow
                  label={t("settings.discordPresence")}
                  tip={t("settings.discordPresenceHint")}
                >
                  <Dropdown
                    className="w-44"
                    aria-label={t("settings.discordPresence")}
                    value={discordPresence}
                    options={[
                      { value: "detailed", label: t("settings.discordDetailed") },
                      { value: "activity", label: t("settings.discordActivity") },
                      { value: "minimal", label: t("settings.discordMinimal") },
                      { value: "off", label: t("settings.discordOff") },
                    ]}
                    onChange={onDiscordPresence}
                  />
                </SettingRow>
              )}
            </SettingsSection>

            {isDesktopApp() && (
              <SettingsSection title={t("settings.osuIntegration")}>
                <SettingToggle
                  label={t("settings.osuListener")}
                  tip={t("settings.osuListenerHint")}
                  checked={osuListenerEnabled}
                  onChange={onOsuListenerEnabled}
                />
                <OsuFolderRow />
              </SettingsSection>
            )}
            <LegalSection />
            <ResetDataSection />
          </SettingsCategory>
        )}

        {show("Editor") && (
          <SettingsCategory name="Editor" words={words}>
            <SettingsSection title={t("settings.layout")}>
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
              <SettingToggle
                indent
                label={t("settings.simplifyBottomTimeline")}
                tip={t("settings.simplifyBottomTimelineHint")}
                checked={simplifyBottomTimeline}
                disabled={!showBottomTimeline}
                onChange={onSimplifyBottomTimeline}
              />
              <SettingToggle
                indent
                label={t("settings.showSkillsetGraph")}
                tip={t("settings.showSkillsetGraphHint")}
                checked={showSkillsetGraph}
                disabled={!showBottomTimeline}
                onChange={onShowSkillsetGraph}
              />
              <SettingToggle
                label={t("settings.showMapOverview")}
                tip={t("settings.showMapOverviewHint")}
                diagram="mapOverview"
                checked={showMapOverview}
                onChange={onShowMapOverview}
              />
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
            </SettingsSection>
            <SettingsSection title={t("settings.playfield")}>
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
              <SettingToggle
                label={t("settings.waveformOnLane")}
                tip={t("settings.waveformHint")}
                diagram="waveform"
                checked={showWaveform}
                onChange={onShowWaveform}
              />
              <SliderRow
                indent
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
            </SettingsSection>
            <SettingsSection title={t("settings.scrolling")}>
              <SettingRow
                label={t("settings.scrollDirection")}
                tip={t("settings.scrollDirectionHint")}
                diagram="scrollDirection"
              >
                <button
                  type="button"
                  onClick={() => onUpscroll(!upscroll)}
                  aria-label={t("settings.scrollDirectionAria", {
                    direction: upscroll
                      ? t("settings.upscroll")
                      : t("settings.downscroll"),
                  })}
                  className={buttonClass("primary", "sm", "w-32 justify-between")}
                >
                  <span className="relative inline-flex flex-1 justify-start overflow-hidden">
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
                  <span
                    aria-hidden
                    className={`inline-block leading-none text-slate-400 transition-transform duration-300 ease-[var(--ease-emphasized)] ${
                      upscroll ? "-rotate-180" : "rotate-0"
                    }`}
                  >
                    ↓
                  </span>
                </button>
              </SettingRow>
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
            </SettingsSection>
            <SettingsSection title={t("nav.timing")}>
              <SettingToggle
                label={t("settings.moveNotesWithTiming")}
                tip={t("settings.moveNotesWithTimingHint")}
                checked={moveNotesWithTiming}
                onChange={onMoveNotesWithTiming}
              />
            </SettingsSection>
            <SettingsSection title={t("settings.longNotes")}>
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
            </SettingsSection>
          </SettingsCategory>
        )}

        {show("Playtest") && (
          <SettingsCategory name="Playtest" words={words}>
            <SettingsExtra
              keywords={[t("settings.hudEditorTitle"), t("settings.hudEditorDesc")]}
              className="mb-7 flex items-center gap-5 border-b border-white/[0.06] pb-6"
            >
              <div aria-hidden="true" className="w-32 shrink-0 [&_svg]:mt-0">
                <SettingDiagram name="hud" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-sm font-semibold text-slate-100">{t("settings.hudEditorTitle")}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{t("settings.hudEditorDesc")}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="accent" size="sm" disabled={!onOpenHudEditor} onClick={onOpenHudEditor}>
                    {t("settings.hudEditorOpen")}
                  </Button>
                  {!onOpenHudEditor && <span className="text-xs text-slate-500">{t("settings.hudEditorNeedsMap")}</span>}
                </div>
              </div>
            </SettingsExtra>
            <SettingsSection title={t("settings.ptGameplay")}>
              <SettingRow label={t("settings.rate")} tip={t("settings.rateHint")}>
                <div className="flex flex-wrap justify-end gap-0.5 rounded-md bg-black/25 p-0.5 ring-1 ring-inset ring-white/[0.06]">
                  {PLAYTEST_RATES.map((r) => {
                    const on = Math.abs((playtest.rate ?? 1) - r) < 0.001;
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        onClick={() => patchPlaytest({ rate: r })}
                        className={`h-6 rounded px-1.5 text-xs font-medium tabular-nums transition duration-[var(--motion-quick)] ${
                          on
                            ? "bg-ink-500 text-slate-50 shadow-[0_1px_2px_rgb(0_0_0/0.4)]"
                            : "text-slate-400 hover:text-slate-100"
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
              </SettingRow>
            </SettingsSection>

            <SettingsSection title={t("settings.autoplay")} description={undefined}>
              <SettingRow
                label={t("settings.danRegular")}
                tip={t("settings.danHint", {
                  keys: DAN_LADDERS[ladders.regular].keyCount,
                })}
              >
                <Dropdown
                  className="w-44"
                  aria-label={t("settings.danRegular")}
                  value={regularLevel}
                  options={DAN_LADDERS[ladders.regular].levels.map(
                    (lvl, i) => ({ value: i, label: lvl.label }),
                  )}
                  onChange={(level) => setDanSkill(level, lnLevel)}
                />
              </SettingRow>
              <SettingRow label={t("settings.danLn")} tip={t("settings.autoplayHint")}>
                <Dropdown
                  className="w-44"
                  aria-label={t("settings.danLn")}
                  value={lnLevel}
                  options={DAN_LADDERS[ladders.ln].levels.map((lvl, i) => ({
                    value: i,
                    label: lvl.label,
                  }))}
                  onChange={(level) => setDanSkill(regularLevel, level)}
                />
              </SettingRow>
              <SettingToggle
                label={t("settings.humanize")}
                tip={t("settings.humanizeHint")}
                checked={playtest.humanize.enabled}
                onChange={setHumanizeEnabled}
              />
              {playtest.humanize.enabled && (
                <>
                  <SliderRow
                    indent
                    label={t("settings.humanizeJitter")}
                    tip={t("settings.humanizeJitterHint")}
                    value={playtest.humanize.jitterMs}
                    min={0}
                    max={60}
                    step={1}
                    display={(v) => `${v} ms`}
                    onChange={(jitterMs) => patchHumanize({ jitterMs })}
                  />
                  <SliderRow
                    indent
                    label={t("settings.humanizeBias")}
                    tip={t("settings.humanizeBiasHint")}
                    value={playtest.humanize.biasMs}
                    min={-40}
                    max={40}
                    step={1}
                    display={(v) => `${v > 0 ? "+" : ""}${v} ms`}
                    onChange={(biasMs) => patchHumanize({ biasMs })}
                  />
                  <SliderRow
                    indent
                    label={t("settings.humanizeSlipChance")}
                    tip={t("settings.humanizeSlipChanceHint")}
                    value={Math.round(playtest.humanize.slipChance * 1000) / 10}
                    min={0}
                    max={35}
                    step={0.5}
                    display={(v) => `${v.toFixed(1)}%`}
                    onChange={(v) => patchHumanize({ slipChance: v / 100 })}
                  />
                  <SliderRow
                    indent
                    label={t("settings.humanizeMissChance")}
                    value={Math.round(playtest.humanize.missChance * 1000) / 10}
                    min={0}
                    max={10}
                    step={0.1}
                    display={(v) => `${v.toFixed(1)}%`}
                    onChange={(v) => patchHumanize({ missChance: v / 100 })}
                  />
                  <SliderRow
                    indent
                    label={t("settings.humanizeReleaseJitter")}
                    tip={t("settings.humanizeReleaseJitterHint")}
                    value={playtest.humanize.releaseJitterMs}
                    min={0}
                    max={80}
                    step={1}
                    display={(v) => `${v} ms`}
                    onChange={(releaseJitterMs) => patchHumanize({ releaseJitterMs })}
                  />
                  <SettingRow
                    indent
                    label={t("settings.humanizeSeed")}
                    tip={t("settings.humanizeSeedHint")}
                  >
                    {playtest.humanize.seed === 0 && (
                      <span className="text-xs text-slate-500">
                        {t("settings.humanizeSeedRandom")}
                      </span>
                    )}
                    <NumberBox
                      label={t("settings.humanizeSeed")}
                      value={playtest.humanize.seed}
                      min={0}
                      max={999999}
                      step={1}
                      onChange={(seed) => patchHumanize({ seed: Math.floor(seed) })}
                    />
                  </SettingRow>
                </>
              )}
            </SettingsSection>

            <SettingsSection title={t("settings.ptAppearance")}>
              <SettingRow label={t("settings.playtestSkin")} tip={t("settings.playtestSkinHint")}>
                <Dropdown
                  className="w-52"
                  aria-label={t("settings.playtestSkin")}
                  value={playtestSkinValue(playtest.skin)}
                  options={[
                    { value: "", label: t("settings.playtestSkinEditor") },
                    { value: "none", label: t("settings.playtestSkinDefault") },
                    ...PRESET_SKINS.map((preset) => ({
                      value: playtestSkinValue({
                        source: "preset" as const,
                        fileName: preset.fileName,
                      }),
                      label: preset.name,
                      group: t("settings.playtestSkinPresets"),
                    })),
                    ...savedSkinOptions.map((name) => ({
                      value: playtestSkinValue({
                        source: "saved" as const,
                        fileName: name,
                      }),
                      label: name.replace(/\.osk$/i, ""),
                      group: t("settings.playtestSkinSaved"),
                    })),
                  ]}
                  onChange={(value) =>
                    patchPlaytest({ skin: parsePlaytestSkinValue(value) })
                  }
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection
              title={t("settings.keybinds")}
              description={
                capturing !== null ? t("settings.keybindsCapturing") : t("settings.keybindsHint")
              }
              action={
                <Dropdown
                  size="sm"
                  className="w-20"
                  value={keyMode}
                  aria-label={t("settings.keyMode")}
                  options={Array.from({ length: 18 }, (_, i) => ({
                    value: i + 1,
                    label: `${i + 1}K`,
                  }))}
                  onChange={(keys) => {
                    stopCapture();
                    setKeyMode(keys);
                  }}
                />
              }
            >
              <SettingsExtra
                keywords={[t("settings.keybinds"), t("settings.keybindsHint")]}
                className="py-3"
              >
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
                      // Each lane is drawn as a key with a lane number above
                      // it: the binding is the thing being edited.
                      className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 font-mono text-sm font-semibold shadow-[inset_0_-2px_0_rgb(0_0_0/0.35)] ring-1 ring-inset transition ${
                        capturing === i
                          ? "bg-accent/15 text-slate-50 ring-accent/70"
                          : !selectedKeybinds[i]
                            ? "bg-amber-400/[0.06] text-amber-200 ring-amber-400/40 hover:ring-amber-300/60"
                            : "bg-white/[0.05] text-slate-100 ring-white/[0.09] hover:bg-white/[0.08] hover:ring-white/20"
                      }`}
                    >
                      <span className="font-sans text-2xs font-medium text-slate-500">{i + 1}</span>
                      <span className="max-w-full truncate">
                        {capturing === i ? "…" : keyLabel(selectedKeybinds[i] || "")}
                      </span>
                    </button>
                  ))}
                </div>
                {warnings.length > 0 && (
                  <p className="mt-2 text-xs text-amber-300">{warnings.join(" · ")}</p>
                )}
              </SettingsExtra>
              <SettingRow label={t("settings.quickRestartKey")} tip={t("settings.quickRestartHint")}>
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
                  className={`keycap keycap-editable !h-7 min-w-[5.5rem] !px-3 !text-xs transition ${
                    capturingRestart ? "!bg-accent/15 !text-slate-50 outline outline-1 outline-offset-1 outline-accent/70" : "hover:!bg-white/[0.1]"
                  }`}
                >
                  {capturingRestart ? t("settings.pressKey") : keyLabel(playtest.quickRestartKey)}
                </button>
              </SettingRow>
            </SettingsSection>
          </SettingsCategory>
        )}

        {show("Audio") && (
          <SettingsCategory name="Audio" words={words}>
            {onAudioSetup && (
              <SettingsSection title={t("settings.audioOutput")}>
                <SettingRow label={t("settings.audioSetup")} tip={t("settings.audioSetupHint")}>
                  <Button variant="primary" size="sm" onClick={onAudioSetup}>
                    {t("settings.calibrate")}
                  </Button>
                </SettingRow>
              </SettingsSection>
            )}
            <SettingsSection title={t("settings.volume")}>
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
              <SliderRow
                label={t("settings.unfocusedVolume")}
                tip={t("settings.unfocusedVolumeHint")}
                display={`${Math.round(unfocusedVolume * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={unfocusedVolume}
                onChange={onUnfocusedVolume}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.playback")}>
              <SettingToggle
                label={t("settings.keepPitch")}
                tip={t("settings.keepPitchHint")}
                checked={keepPitchWhenSlowed}
                onChange={onKeepPitchWhenSlowed}
              />
              <SettingToggle
                label={t("settings.playHitsounds")}
                tip={t("settings.hitsoundsHint")}
                checked={hitsoundsEnabled}
                onChange={onHitsoundsEnabled}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.interfaceSounds")}>
              <SettingToggle
                label={t("settings.uiSounds")}
                tip={t("settings.uiSoundsHint")}
                checked={uiSoundsEnabled}
                onChange={onUiSoundsEnabled}
              />
              <SliderRow
                indent
                label={t("settings.volume")}
                display={`${Math.round(uiSoundVolume * 100)}%`}
                min={0}
                max={1}
                step={0.01}
                value={uiSoundVolume}
                disabled={!uiSoundsEnabled}
                onChange={onUiSoundVolume}
              />
            </SettingsSection>
          </SettingsCategory>
        )}

        {show("Export") && (
          <SettingsCategory name="Export" words={words}>
            <SettingsSection title={t("settings.backgroundImages")}>
              <SettingToggle
                label={t("settings.convertPng")}
                tip={t("settings.convertPngHint")}
                checked={exportPngBackgroundsAsJpeg}
                onChange={onExportPngBackgroundsAsJpeg}
              />
              <SliderRow
                indent
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
            </SettingsSection>

            <SettingsSection title={t("settings.mapTags")}>
              <SettingToggle
                label={t("settings.cascadeTag")}
                tip={t("settings.cascadeTagHint")}
                checked={addCascadeTag}
                onChange={onAddCascadeTag}
              />
            </SettingsSection>

            <SettingsSection title={t("settings.mapCard")}>
              <SettingToggle
                label={t("settings.mapCardPrompt")}
                tip={t("settings.mapCardPromptHint")}
                checked={offerMapCardAfterExport}
                onChange={onOfferMapCardAfterExport}
              />
            </SettingsSection>
          </SettingsCategory>
        )}

        {show("Social") && socialEnabled && (
          <SettingsCategory name="Social" words={words}>
            <SocialPrivacySettings onOpenProfile={onOpenProfile} />
          </SettingsCategory>
        )}
        {show("Shortcuts") && (
          <SettingsCategory name="Shortcuts" words={words}>
            <ShortcutsSettings
              keybinds={editorKeybinds}
              onKeybinds={onEditorKeybinds}
              altWheelAction={altWheelAction}
              customSnapDivisors={customSnapDivisors}
              onCustomSnapDivisors={onCustomSnapDivisors}
              query={searching ? query : undefined}
            />
          </SettingsCategory>
        )}
        {searching && (
          <p className="settings-empty py-10 text-center text-sm text-slate-500">
            {t("settings.searchEmpty", { query: query.trim() })}
          </p>
        )}
      </SettingsWorkspace>
    </Modal>
  );
}

/**
 * One category's settings. While searching it gets its own heading, so the
 * results read as a list grouped by where each setting lives, and a query
 * naming the category ("audio") lists all of it.
 */
function SettingsCategory({
  name,
  words,
  children,
}: {
  name: Tab;
  words: string[];
  children: ReactNode;
}) {
  const t = useT();
  const label = t(TAB_LABELS[name]);
  if (!words.length) return <>{children}</>;
  return (
    <SettingsSearchScope words={words} title={label}>
      <div className="settings-group mb-10">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-slate-50">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="h-4 w-4 shrink-0 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {TAB_ICONS[name]}
          </svg>
          {label}
        </h2>
        {children}
      </div>
    </SettingsSearchScope>
  );
}

/** Line icons for the category rail, drawn on a 16px grid. */
const TAB_ICONS: Record<Tab, ReactNode> = {
  General: <path d="M3 4.5h6m3 0h1M3 8h2m3 0h5M3 11.5h7m3 0h0M10.5 3v3M6.5 6.5v3M11.5 10v3" />,
  Editor: <path d="M3.5 2.5v11M8 2.5v11M12.5 2.5v11M4.5 5h2.5M9 9h2.5M4.5 11.5h2.5" />,
  Playtest: <path d="M5 3.2v9.6L12.5 8 5 3.2Z" />,
  Audio: <path d="M3 6.2h2.2L8.5 3.5v9L5.2 9.8H3V6.2Zm8 -.7a3.5 3.5 0 0 1 0 5" />,
  Export: <path d="M8 2.5v7m0-7L5.5 5M8 2.5 10.5 5M3.5 9v3.5h9V9" />,
  Shortcuts: <path d="M2.5 4.5h11v7h-11v-7Zm2 2h1m2 0h1m2 0h1M5 9.5h6" />,
  Social: <path d="M6 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3.5 5a3.5 3.5 0 0 1 7 0m1-5a1.75 1.75 0 1 0 0-3.5M11 9a3 3 0 0 1 2.5 3" />,
};

/**
 * The settings workspace: categories down the left, rows in the middle and,
 * when there is room, the info pane on the right.
 */
function SettingsWorkspace({
  tab,
  onTab,
  tabs,
  wideContent,
  query,
  onQuery,
  searching,
  children,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  tabs: Tab[];
  /** Lets a table (shortcuts) use the width the info pane would take. */
  wideContent: boolean;
  query: string;
  onQuery: (query: string) => void;
  searching: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const layoutRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(0);

  // Ctrl/Cmd+F finds a setting, as it would on a page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const node = layoutRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab, searching]);

  const phone = usePhoneViewport();
  const stacked = phone || (width > 0 && width < 600);
  const pane = !phone && !wideContent && width >= 920;

  const search = (
    <label className={`relative block shrink-0 ${stacked ? "mx-2 mt-2" : "mb-2"}`}>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      >
        <path d="m13.5 13.5-3-3m1.5-3.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />
      </svg>
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          // Esc clears a search first; a second Esc closes Settings.
          if (event.key === "Escape" && query) {
            event.preventDefault();
            event.stopPropagation();
            onQuery("");
          }
        }}
        placeholder={t("settings.search")}
        aria-label={t("settings.search")}
        className={`${INPUT_CLASS} h-8 w-full py-0 pl-8 pr-2`}
      />
    </label>
  );

  return (
    <div
      ref={layoutRef}
      className={`flex h-full min-h-0 border-t border-white/[0.06] ${stacked ? "flex-col" : ""}`}
    >
      {stacked && search}
      <nav
        role="tablist"
        aria-orientation={stacked ? "horizontal" : "vertical"}
        aria-label={t("settings.title")}
        className={
          stacked
            ? "no-scrollbar flex shrink-0 gap-0.5 overflow-x-auto border-b border-white/[0.06] px-2 py-1.5"
            : "flex w-52 shrink-0 flex-col gap-px overflow-y-auto border-r border-white/[0.06] bg-black/10 p-2"
        }
      >
        {!stacked && search}
        {tabs.map((name) => {
          const active = !searching && name === tab;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(name)}
              className={`hit-line-left flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
                active
                  ? "bg-white/[0.07] font-medium text-slate-50"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className={`h-4 w-4 shrink-0 ${active ? "text-slate-200" : "text-slate-500"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {TAB_ICONS[name]}
              </svg>
              <span className="truncate">{t(TAB_LABELS[name])}</span>
            </button>
          );
        })}
      </nav>
      <SettingsInfoProvider enabled={pane} resetKey={tab}>
        <div
          ref={scrollRef}
          role="tabpanel"
          className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        >
          <div
            className={`settings-results px-6 pb-10 pt-5 uilg:px-8 ${wideContent ? "" : "max-w-[44rem]"} ${
              searching ? "settings-searching" : ""
            }`}
          >
            {!searching && (
              <h2 className="mb-4 font-display text-lg font-bold text-slate-50">
                {t(TAB_LABELS[tab])}
              </h2>
            )}
            {children}
          </div>
        </div>
        {pane && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-white/[0.06] px-5 pt-[4.25rem]">
            <SettingsInfoPane />
          </aside>
        )}
      </SettingsInfoProvider>
    </div>
  );
}

function LegalSection() {
  const { t } = useLocale();
  return (
    <SettingsSection title={t("settings.legal")}>
      <SettingsExtra
        keywords={[t("settings.terms"), t("startModal.privacyPolicy")]}
        className="flex flex-wrap gap-4 py-3 text-sm"
      >
        <a
          href={siteUrl("terms")}
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-slate-50 hover:decoration-white/50"
        >
          {t("settings.terms")}
        </a>
        <a
          href={siteUrl("privacy")}
          target="_blank"
          rel="noreferrer"
          className="text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-slate-50 hover:decoration-white/50"
        >
          {t("startModal.privacyPolicy")}
        </a>
      </SettingsExtra>
    </SettingsSection>
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
    <SettingsSection title={t("settings.resetData")}>
      <SettingRow label={t("settings.resetDataButton")} tip={t("settings.resetDataHint")}>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          {t("settings.resetDataButton")}
        </Button>
      </SettingRow>
      <HoldConfirmDialog
        open={confirming}
        title={t("settings.resetDataConfirmTitle")}
        message={t("settings.resetDataConfirmBody")}
        confirmLabel={t("settings.resetDataConfirmHold")}
        busy={busy}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
      />
    </SettingsSection>
  );
}

function OsuFolderRow() {
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
    <SettingRow
      stacked
      label={t("settings.osuFolder")}
      tip={t("settings.osuFolderHint")}
    >
      <div className="flex w-full flex-col gap-2">
        <p className="break-all font-mono text-xs text-slate-300">
          {status.root ?? (
            <span className="font-sans text-slate-500">{t("settings.osuFolderMissing")}</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => run(osuChooseRoot)} disabled={busy}>
            {t("settings.osuFolderChoose")}
          </Button>
          {status.chosen && (
            <Button size="sm" onClick={() => run(osuForgetRoot)} disabled={busy}>
              {t("settings.osuFolderReset")}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>
    </SettingRow>
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
      className={`flex shrink-0 items-center gap-1.5 text-xs ${
        status === "error" ? "text-rose-300" : "text-slate-500"
      }`}
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
    <label className="flex h-7 w-20 shrink-0 items-center rounded-md bg-black/25 pr-2 ring-1 ring-inset ring-white/[0.08] transition hover:ring-white/[0.14] focus-within:ring-accent/70">
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
        className="w-full min-w-0 bg-transparent px-2 text-right text-xs tabular-nums text-slate-100 outline-none [appearance:textfield] focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && <span className="text-xs text-slate-500">{unit}</span>}
    </label>
  );
}

function SettingToggle({
  label,
  tip,
  diagram,
  checked,
  onChange,
  disabled = false,
  indent = false,
}: {
  label: string;
  tip?: string;
  diagram?: DiagramName;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  indent?: boolean;
}) {
  return (
    <SettingRow label={label} tip={tip} diagram={diagram} disabled={disabled} indent={indent}>
      <Toggle
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
      />
    </SettingRow>
  );
}

/** A setting with a slider for quick changes and its value beside it. */
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
  indent = false,
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
  indent?: boolean;
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
    <SettingRow
      label={label}
      tip={tip}
      diagram={diagram}
      diagramValue={draft !== null && diagramValue !== undefined ? draft : diagramValue}
      disabled={disabled}
      indent={indent}
    >
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
        className="w-36 shrink-0 uimd:w-44"
      />
      <SliderValue>{typeof display === "function" ? display(shown) : display}</SliderValue>
    </SettingRow>
  );
}
