import type { Dispatch, SetStateAction } from "react";
import type { AccountReason } from "../components/menus/AccountPromptModal";
import type { SettingsTab } from "../components/menus/AppSettingsModal";
import type { PaletteCommand } from "../components/ui/CommandPalette";
import type { AudioController } from "../hooks/useAudio";
import type { Waveform } from "../hooks/useWaveform";
import type { AuthUser } from "../lib/auth";
import { canExitDesktop } from "../lib/desktopExit";
import type { FeatureFlags } from "../lib/featureFlags";
import type { MessageKey, Translate } from "../lib/i18n";
import type { MapCardPresetOption } from "../lib/mapCard";
import { countHitsounds } from "../lib/noteTools";
import type { OsuStatus } from "../lib/osuDesktop";
import { isDesktopApp } from "../lib/pwa";
import type { AppSettings, Difficulty, LoadedFile } from "../types";
import type { ModalId } from "./appTypes";
import type { PlaytestRuntimeState } from "./usePlaytest";

/**
 * Everything the Ctrl+K palette can run: the editor's actions and dialogs,
 * then one entry per setting so a setting can be found by name.
 */
export function buildPaletteCommands({
  active,
  addDifficulty,
  appSettings,
  askToLogIn,
  applyCopyHitsoundsToAll,
  audio,
  audioFile,
  authUser,
  beginExternalEdit,
  canEdit,
  canExport,
  canRedo,
  canUndo,
  cloudProjectId,
  eligibleRefs,
  exitPlaytest,
  exporting,
  featureFlags,
  getCurrentTime,
  handleCloudSave,
  handleExportMcz,
  handleExportOsu,
  handleExportOsz,
  handleExportQua,
  handleExportSm,
  handleLoadFromOsu,
  handleSave,
  handleSendToOsu,
  handleSyncToOsu,
  hasMalodyDifficulty,
  hasProject,
  hitsoundTargets,
  importingMap,
  openAiMod,
  openMapCard,
  openSettings,
  osuApp,
  osuBusy,
  playtest,
  redo,
  referenceDiff,
  setAppSettings,
  setAutoTimeOpen,
  setCommentsOpen,
  setExitConfirm,
  setJumpToTimeOpen,
  setLayoutEditing,
  setModal,
  setPackCreatorOpen,
  setReferenceId,
  setShowHomeConfirm,
  setZenMode,
  startPlaytest,
  t,
  toggleAudio,
  toggleWaveformOverlay,
  undo,
  waveform,
  zenMode,
}: {
  active: Difficulty;
  addDifficulty: () => void;
  appSettings: AppSettings;
  askToLogIn: (reason: AccountReason) => void;
  applyCopyHitsoundsToAll: () => void;
  audio: AudioController;
  audioFile: LoadedFile | null;
  authUser: AuthUser | null;
  beginExternalEdit: () => Promise<void>;
  canEdit: boolean;
  canExport: boolean;
  canRedo: boolean;
  canUndo: boolean;
  cloudProjectId: string | null;
  eligibleRefs: Difficulty[];
  exitPlaytest: () => void;
  exporting: boolean;
  featureFlags: FeatureFlags;
  getCurrentTime: () => number;
  handleCloudSave: (target?: { overwriteId?: string; asNewMap?: boolean; }) => Promise<void>;
  handleExportMcz: () => void;
  handleExportOsu: () => void;
  handleExportOsz: () => void;
  handleExportQua: () => void;
  handleExportSm: () => void;
  handleLoadFromOsu: () => Promise<void>;
  handleSave: (silent?: boolean) => Promise<void>;
  handleSendToOsu: () => void;
  handleSyncToOsu: () => void;
  hasMalodyDifficulty: boolean;
  hasProject: boolean;
  hitsoundTargets: Difficulty[];
  importingMap: boolean;
  openAiMod: () => void;
  openMapCard: (start?: MapCardPresetOption | null) => void;
  openSettings: (tab?: SettingsTab) => void;
  osuApp: OsuStatus | null;
  osuBusy: boolean;
  playtest: PlaytestRuntimeState;
  redo: () => void;
  referenceDiff: Difficulty | null;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  setAutoTimeOpen: Dispatch<SetStateAction<boolean>>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setExitConfirm: Dispatch<SetStateAction<boolean>>;
  setJumpToTimeOpen: Dispatch<SetStateAction<boolean>>;
  setLayoutEditing: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<ModalId>>;
  setPackCreatorOpen: Dispatch<SetStateAction<boolean>>;
  setReferenceId: Dispatch<SetStateAction<string | null>>;
  setShowHomeConfirm: Dispatch<SetStateAction<boolean>>;
  setZenMode: Dispatch<SetStateAction<boolean>>;
  startPlaytest: (startTime?: number, { hudEditing }?: { hudEditing?: boolean; }) => void;
  t: Translate;
  toggleAudio: () => void;
  toggleWaveformOverlay: () => void;
  undo: () => void;
  waveform: Waveform | null;
  zenMode: boolean;
}): PaletteCommand[] {

  const paletteSettingEntries: Array<{
    key: MessageKey;
    tab: SettingsTab;
    keywords?: string;
    /** Its control lives in the HUD editor, so send the user there instead. */
    hud?: boolean;
  }> = [
    { key: "settings.language", tab: "General" },
    { key: "settings.uiScale", tab: "General", keywords: "interface size zoom" },
    { key: "settings.altWheelAction", tab: "General", keywords: "mouse scroll audio" },
    { key: "settings.menuMusic", tab: "General" },
    { key: "settings.menuBackground", tab: "General", keywords: "main menu wallpaper image picture song art" },
    { key: "settings.menuTips", tab: "General", keywords: "main menu hints" },
    { key: "settings.logoSkinHitsounds", tab: "General", keywords: "main menu logo click sound" },
    { key: "settings.sessionIntro", tab: "General", keywords: "logo launch animation" },
    { key: "settings.shortcutNotices", tab: "General", keywords: "popup overlay toast" },
    { key: "settings.performanceMode", tab: "General" },
    { key: "settings.osuListener", tab: "General", keywords: "integration" },
    { key: "settings.osuFolder", tab: "General", keywords: "integration path stable lazer" },
    { key: "settings.autosave", tab: "General", keywords: "local project" },
    { key: "settings.showMenuPlayers", tab: "General", keywords: "presence online" },
    { key: "settings.hideStatus", tab: "General", keywords: "presence privacy" },
    { key: "settings.discordPresence", tab: "General", keywords: "rich status" },
    { key: "settings.resetData", tab: "General", keywords: "erase local" },
    { key: "settings.showDifficultyPanel", tab: "Editor", keywords: "layout sidebar stats" },
    { key: "settings.showBottomTimeline", tab: "Editor", keywords: "layout sv" },
    { key: "settings.simplifyBottomTimeline", tab: "Editor" },
    { key: "settings.showPpCounter", tab: "Editor", keywords: "speed" },
    { key: "settings.showPatternTools", tab: "Editor", keywords: "presets" },
    { key: "settings.showSkillsetGraph", tab: "Editor", keywords: "msd minacalc etterna stream jack chordjack difficulty graph" },
    { key: "settings.colourblindLanes", tab: "Editor", keywords: "colorblind color blind colours lanes notes accessibility" },
    { key: "settings.snapColouredNotes", tab: "Editor", keywords: "color snap divisor beat colours notes unsnapped rhythm" },
    { key: "settings.moveNotesWithTiming", tab: "Editor", keywords: "offset bpm red point timing shift follow resnap" },
    { key: "settings.backgroundDim", tab: "Editor" },
    { key: "settings.backgroundBlur", tab: "Editor", keywords: "blur background" },
    { key: "settings.sizeZoom", tab: "Editor", keywords: "playfield" },
    { key: "settings.noteHeight", tab: "Editor" },
    { key: "settings.waveformOnLane", tab: "Editor" },
    { key: "settings.waveformTransparency", tab: "Editor", keywords: "waveform opacity" },
    { key: "settings.timingLines", tab: "Editor", keywords: "bookmarks" },
    { key: "settings.smoothScrolling", tab: "Editor" },
    { key: "settings.svPreview", tab: "Editor" },
    { key: "settings.bpmAffectsScroll", tab: "Editor" },
    { key: "settings.scrollDirection", tab: "Editor", keywords: "upscroll downscroll" },
    { key: "settings.bodyWidth", tab: "Editor", keywords: "long notes ln" },
    { key: "settings.rate", tab: "Playtest", keywords: "playback speed dt ht" },
    { key: "settings.zoom", tab: "Playtest", keywords: "playfield size", hud: true },
    { key: "settings.hitPosition", tab: "Playtest", keywords: "judgement line receptor", hud: true },
    { key: "settings.quickRestartKey", tab: "Playtest", keywords: "retry keybind" },
    { key: "settings.keybinds", tab: "Playtest", keywords: "keys lanes controls" },
    { key: "settings.showJudgements", tab: "Playtest", hud: true },
    { key: "settings.showCombo", tab: "Playtest", hud: true },
    { key: "settings.showAccuracy", tab: "Playtest", hud: true },
    { key: "settings.showHitError", tab: "Playtest", hud: true },
    { key: "settings.showErrorBar", tab: "Playtest", keywords: "unstable rate ur", hud: true },
    { key: "settings.skinComboFont", tab: "Playtest", keywords: "hud typography", hud: true },
    { key: "settings.skinJudgements", tab: "Playtest", keywords: "hud graphics", hud: true },
    { key: "settings.playtestSkin", tab: "Playtest", keywords: "skin look notes osk appearance" },
    { key: "settings.showNpsGraph", tab: "Playtest", keywords: "density", hud: true },
    { key: "settings.showRunStats", tab: "Playtest", hud: true },
    { key: "settings.hudEditorTitle", tab: "Playtest", keywords: "hud layout move resize overlay" },
    { key: "settings.danRegular", tab: "Playtest", keywords: "autoplay skill dan ladder" },
    { key: "settings.danLn", tab: "Playtest", keywords: "autoplay skill dan long note ln" },
    { key: "settings.humanize", tab: "Playtest", keywords: "autoplay timing" },
    { key: "settings.humanizeJitter", tab: "Playtest", keywords: "autoplay scatter" },
    { key: "settings.humanizeBias", tab: "Playtest", keywords: "autoplay early late" },
    { key: "settings.humanizeSlipChance", tab: "Playtest", keywords: "autoplay error" },
    { key: "settings.humanizeMissChance", tab: "Playtest", keywords: "autoplay error" },
    { key: "settings.humanizeReleaseJitter", tab: "Playtest", keywords: "autoplay long note ln" },
    { key: "settings.humanizeSeed", tab: "Playtest", keywords: "autoplay random" },
    { key: "settings.audioSetup", tab: "Audio", keywords: "output calibration" },
    { key: "settings.playHitsounds", tab: "Audio" },
    { key: "settings.masterVolume", tab: "Audio", keywords: "volume sound everything" },
    { key: "settings.musicVolume", tab: "Audio", keywords: "volume song menu" },
    { key: "settings.effectsVolume", tab: "Audio", keywords: "volume hitsound" },
    { key: "settings.unfocusedVolume", tab: "Audio", keywords: "volume background inactive tab window focus alt-tab" },
    { key: "settings.keepPitch", tab: "Audio", keywords: "pitch speed slow rate playback" },
    { key: "settings.uiSounds", tab: "Audio", keywords: "interface hover click" },
    { key: "settings.convertPng", tab: "Export", keywords: "background jpeg" },
    { key: "settings.jpegQuality", tab: "Export", keywords: "background image" },
    { key: "settings.cascadeTag", tab: "Export", keywords: "tags metadata credit" },
    { key: "settings.mapCardPrompt", tab: "Export", keywords: "map card share image" },
    { key: "settings.tabShortcuts", tab: "Shortcuts", keywords: "keyboard commands hotkeys" },
  ];

  const paletteCommands: PaletteCommand[] = [
    {
      id: "new-map",
      label: t("menu.newMap"),
      group: t("palette.group.create"),
      keywords: "song beatmap project",
      run: () => setModal("newMap"),
    },
    {
      id: "my-maps",
      label: t("menu.myMaps"),
      group: t("palette.group.open"),
      keywords: "projects library cloud local",
      run: () => setModal("myProjects"),
    },
    {
      id: "import-map",
      label: t("menu.importMap"),
      group: t("palette.group.open"),
      keywords: "osz osu sm ssc qua folder",
      run: () => setModal("import"),
    },
    {
      id: "sample-maps",
      label: t("menu.tryMaps"),
      group: t("palette.group.open"),
      keywords: "examples demo",
      run: () => setModal("sampleMaps"),
    },
    {
      id: "backups",
      label: t("backups.title"),
      group: t("palette.group.file"),
      keywords: "recovery restore history crash autosave versions undo lost unsaved",
      run: () => setModal("backups"),
    },
    {
      id: "pack-creator",
      label: t("menu.packCreator"),
      group: t("palette.group.create"),
      keywords: "collection songs",
      run: () => setPackCreatorOpen(true),
    },
    ...(hasProject
      ? [
          { id: "map-settings", label: t("nav.mapSettings"), group: t("palette.group.editor"), run: () => setModal("mapSettings") },
          { id: "timing", label: t("nav.timing"), group: t("palette.group.editor"), keywords: "bpm offset", run: () => setModal("timing") },
          ...(featureFlags.sv_tools
            ? [{ id: "sv", label: t("nav.sv"), group: t("palette.group.editor"), keywords: "scroll velocity", run: () => setModal("sv" as ModalId) }]
            : []),
          { id: "difficulty", label: t("nav.difficulty"), group: t("palette.group.editor"), keywords: "keys od hp", run: () => setModal("difficulty") },
          { id: "add-difficulty", label: t("app.addDifficulty"), group: t("palette.group.editor"), keywords: "new diff", disabled: !canEdit, run: addDifficulty },
          { id: "tools", label: t("nav.tools"), group: t("palette.group.editor"), keywords: "full ln rice crop", run: () => setModal("tools") },
          { id: "map-card", label: t("file.mapCard"), group: t("palette.group.export"), keywords: "image png share description msd skillsets bbcode discord", run: () => openMapCard() },
          { id: "aimod", label: t("nav.aiMod"), group: t("palette.group.editor"), keywords: "check validation", run: openAiMod },
          ...(appSettings.showPatternTools
            ? [{ id: "presets", label: t("nav.presets"), group: t("palette.group.editor"), keywords: "patterns clipboard", run: () => setModal("presets" as ModalId) }]
            : []),
          { id: "skin", label: t("nav.skin"), group: t("palette.group.editor"), run: () => setModal("skin") },
          { id: "history", label: t("undoHistory.title"), group: t("palette.group.edit"), keywords: "versions changes", run: () => setModal("history") },
          { id: "undo", label: t("nav.undo"), group: t("palette.group.edit"), hint: "Ctrl Z", disabled: !canUndo, run: undo },
          { id: "redo", label: t("nav.redo"), group: t("palette.group.edit"), hint: "Ctrl Y", disabled: !canRedo, run: redo },
          { id: "new-open", label: t("file.newOpen"), group: t("palette.group.file"), keywords: "project map welcome", run: () => setModal("welcome") },
          { id: "save", label: t("file.saveLocally"), group: t("palette.group.file"), hint: "Ctrl S", run: () => void handleSave() },
          { id: "save-cloud", label: t("file.saveToCloud"), group: t("palette.group.file"), keywords: "account collaborate", disabled: !canEdit || (!authUser && !featureFlags.cloud_accounts), run: () => (authUser ? void handleCloudSave() : askToLogIn("cloudSave")) },
          { id: "copy-hitsounds-all", label: t("hitsounds.copyToAllCommand"), group: t("palette.group.edit"), keywords: "hitsound whistle finish clap samples apply", disabled: !canEdit || hitsoundTargets.length === 0 || countHitsounds(active.notes) === 0, run: applyCopyHitsoundsToAll },
          { id: "export-osu", label: t("file.exportOsu"), group: t("palette.group.export"), disabled: !canExport, run: handleExportOsu },
          { id: "export-osz", label: t("file.exportOsz"), group: t("palette.group.export"), disabled: !canExport || exporting, run: handleExportOsz },
          { id: "export-sm", label: t("file.exportSm"), group: t("palette.group.export"), disabled: !canExport, run: handleExportSm },
          { id: "export-qua", label: t("file.exportQua"), group: t("palette.group.export"), disabled: !canExport, run: handleExportQua },
          { id: "export-mcz", label: t("file.exportMcz"), group: t("palette.group.export"), keywords: "malody mc", disabled: !canExport || exporting || !hasMalodyDifficulty, run: handleExportMcz },
          ...(osuApp?.supported
            ? [
                { id: "import-into-osu", label: t("file.importIntoOsu"), group: "osu!", keywords: "send export stable", disabled: !canExport || osuBusy || exporting, run: handleSendToOsu },
                { id: "sync-to-osu", label: t("file.syncToOsu"), group: "osu!", keywords: "songs folder export stable", disabled: !canExport || osuBusy || exporting, run: handleSyncToOsu },
                { id: "import-from-osu", label: t("file.importFromOsu"), group: "osu!", keywords: "load selected map stable", disabled: osuBusy || importingMap, run: () => void handleLoadFromOsu() },
              ]
            : []),
          { id: "home", label: t("home.returnTitle"), group: t("palette.group.cascade"), keywords: "main menu start screen close project", run: () => setShowHomeConfirm(true) },
          {
            id: "play-pause",
            label: audio.isPlaying ? t("app.pausePlayback") : t("app.playAudio"),
            group: t("palette.group.playback"),
            hint: "Space",
            disabled: !audioFile,
            run: toggleAudio,
          },
          {
            id: "playtest",
            label: playtest.active ? t("app.exitPlaytest") : t("app.startPlaytest"),
            group: t("palette.group.playback"),
            disabled: !audioFile || !featureFlags.playtest,
            run: () => playtest.active ? exitPlaytest() : startPlaytest(getCurrentTime()),
          },
          {
            id: "zen",
            label: zenMode ? t("app.leaveZen") : t("app.enterZen"),
            group: t("palette.group.view"),
            keywords: "hide interface distraction free",
            run: () => setZenMode((value) => !value),
          },
          {
            id: "waveform",
            label: appSettings.showWaveform ? t("app.hideWaveform") : t("app.showWaveform"),
            group: t("palette.group.view"),
            run: toggleWaveformOverlay,
          },
          {
            id: "auto-time",
            label: t("app.detectBpm"),
            group: t("palette.group.timing"),
            keywords: "auto time song analysis",
            disabled: !waveform?.buffer,
            run: () => setAutoTimeOpen(true),
          },
          {
            id: "jump-time",
            label: t("app.jumpToTime"),
            group: t("palette.group.playback"),
            keywords: "seek timestamp",
            run: () => setJumpToTimeOpen(true),
          },
          {
            id: "difficulty-panel",
            label: appSettings.difficultyPanelOpen ? t("app.hideDifficultyPanel") : t("app.showDifficultyPanel"),
            group: t("palette.group.view"),
            run: () => setAppSettings((value) => ({ ...value, difficultyPanelOpen: !value.difficultyPanelOpen })),
          },
          {
            id: "bottom-timeline",
            label: appSettings.showBottomTimeline ? t("app.hideBottomTimeline") : t("app.showBottomTimeline"),
            group: t("palette.group.view"),
            run: () => setAppSettings((value) => ({ ...value, showBottomTimeline: !value.showBottomTimeline })),
          },
          {
            id: "playfield-layout",
            label: t("layout.open"),
            group: t("palette.group.view"),
            run: () => setLayoutEditing(true),
          },
          ...(!zenMode && !playtest.active
            ? [
                ...eligibleRefs.map((d) => ({
                  id: `reference-${d.id}`,
                  label: t("app.referenceItem", { name: d.name, keys: d.keyCount }),
                  group: t("palette.group.view"),
                  keywords: "compare difficulty side by side",
                  run: () => setReferenceId(d.id),
                })),
                ...(referenceDiff
                  ? [{ id: "reference-off", label: t("app.referenceOff"), group: t("palette.group.view"), keywords: "compare difficulty", run: () => setReferenceId(null) }]
                  : []),
              ]
            : []),
          ...(cloudProjectId
            ? [
                { id: "comments", label: t("nav.comments"), group: t("palette.group.collaboration"), run: () => setCommentsOpen((value) => !value) },
              ]
            : []),
          // Listed before the map is in the cloud too: the share dialog says
          // to save it first, and a logged-out mapper learns what an account adds.
          ...(cloudProjectId || featureFlags.cloud_accounts
            ? [
                { id: "share", label: t("nav.shareTitle"), group: t("palette.group.collaboration"), keywords: "invite collaborate together link public", run: () => (authUser ? setModal("share" as ModalId) : askToLogIn("share")) },
              ]
            : []),
          ...(isDesktopApp()
            ? [
                { id: "version-history", label: t("file.versionHistory"), group: t("palette.group.file"), run: () => setModal("versionHistory" as ModalId) },
                { id: "edit-externally", label: t("file.editExternally"), group: t("palette.group.file"), keywords: "text editor osu file notepad", disabled: !canEdit, run: () => void beginExternalEdit() },
              ]
            : []),
        ] satisfies PaletteCommand[]
      : []),
    {
      id: "feedback",
      label: t("app.sendFeedback"),
      group: t("palette.group.cascade"),
      keywords: "report bug suggestion",
      run: () => setModal("feedback"),
    },
    ...(canExitDesktop()
      ? [{ id: "exit", label: t("menu.exit"), group: t("palette.group.cascade"), keywords: "quit close app", run: () => setExitConfirm(true) }]
      : []),
    {
      id: "settings",
      label: t("settings.title"),
      group: t("palette.group.settings"),
      hint: "Ctrl K",
      run: () => openSettings(),
    },
    ...paletteSettingEntries.map(({ key, tab, keywords, hud }) => ({
      id: `setting-${key}`,
      label: t(key),
      group: t("palette.group.setting", { tab: t(`settings.tab${tab}` as MessageKey) }),
      keywords,
      run: () =>
        hud && hasProject && audioFile
          ? startPlaytest(0, { hudEditing: true })
          : openSettings(tab),
    })),
  ];

  return paletteCommands;
}
