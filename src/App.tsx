import {
  Fragment,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BackgroundScopeModal } from "./components/menus/BackgroundScopeModal";
import { ExportValidationModal } from "./components/menus/ExportValidationModal";
import { MapperNameModal } from "./components/menus/MapperNameModal";
import {
  runAiMod,
  resnapNotes,
  countUnsnapped,
  type AiModReport,
  type AiModIssue,
} from "./lib/aimod";
import type { SampleMap } from "./components/menus/StartModal";
import { StartScreen } from "./components/StartScreen";
import { usePhoneViewport } from "./hooks/usePhoneViewport";
import { useOnlinePresence } from "./hooks/useOnlinePresence";
import { useOsuLive } from "./hooks/useOsuLive";
import { OsuOpenPrompt } from "./components/OsuOpenPrompt";
import {
  findSharedMapForProject,
  publishSharedMap,
  sharedMapUrl,
  slugFromPath,
  summarise as summariseSharedMap,
} from "./lib/sharedMap";
import { previewStartMs } from "./lib/sharedMapPreview";
import { renderShareCard } from "./lib/shareCard";
import { VersionHistoryModal } from "./components/menus/VersionHistoryModal";
import { batchApplyDifficulties, type BatchRequest } from "./lib/batchApply";
import { describeNoteOp, describeSnapshotChange, jumpSnapshotHistory } from "./lib/editorHistory";
import { AudioSetupModal } from "./components/menus/AudioSetupModal";
import { readExclusivePreference } from "./lib/nativeAudio";
import { NowPlaying } from "./components/NowPlaying";
import { ExitCurtain } from "./components/ExitCurtain";
import {
  canExitDesktop,
  exitAnimationMs,
  exitDesktopApp,
} from "./lib/desktopExit";
import { useMenuMusic } from "./hooks/useMenuMusic";
import { dialogIsOpen } from "./hooks/useDialog";
import type { AudioSeekTransition } from "./lib/audioSeek";
import { lazyWithPreload } from "./lib/lazyPreload";
const loadEditorWorkspace = () => import("./components/EditorWorkspace");
const BottomTimeline = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.BottomTimeline })),
);
const CommentsSidebar = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.CommentsSidebar })),
);
const DifficultySidebar = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.DifficultySidebar })),
);
const ManiaEditor = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.ManiaEditor })),
);
const PlaytestNpsGraph = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PlaytestNpsGraph })),
);
const PlaytestOverlay = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PlaytestOverlay })),
);
const PlaytestRunStats = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PlaytestRunStats })),
);
const PPCounter = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.PPCounter })),
);
const TransportBar = lazyWithPreload(() =>
  loadEditorWorkspace().then((m) => ({ default: m.TransportBar })),
);
const SharedMapPage = lazyWithPreload(() =>
  import("./components/SharedMapPage").then((m) => ({
    default: m.SharedMapPage,
  })),
);
const SettingsModal = lazyWithPreload(() =>
  import("./components/menus/SettingsModal").then((m) => ({
    default: m.SettingsModal,
  })),
);
const AppSettingsModal = lazyWithPreload(() =>
  import("./components/menus/AppSettingsModal").then((m) => ({
    default: m.AppSettingsModal,
  })),
);
const SkinModal = lazyWithPreload(() =>
  import("./components/menus/SkinModal").then((m) => ({
    default: m.SkinModal,
  })),
);
const DifficultyModal = lazyWithPreload(() =>
  import("./components/menus/DifficultyModal").then((m) => ({
    default: m.DifficultyModal,
  })),
);
const TimingModal = lazyWithPreload(() =>
  import("./components/menus/TimingModal").then((m) => ({
    default: m.TimingModal,
  })),
);
const SvModal = lazyWithPreload(() =>
  import("./components/menus/SvModal").then((m) => ({ default: m.SvModal })),
);
const ToolsModal = lazyWithPreload(() =>
  import("./components/menus/ToolsModal").then((m) => ({
    default: m.ToolsModal,
  })),
);
const MapCardModal = lazyWithPreload(() =>
  import("./components/menus/MapCardModal").then((m) => ({
    default: m.MapCardModal,
  })),
);
const MapCardPrompt = lazyWithPreload(() =>
  import("./components/menus/MapCardPrompt").then((m) => ({
    default: m.MapCardPrompt,
  })),
);
const AiModModal = lazyWithPreload(() =>
  import("./components/menus/AiModModal").then((m) => ({
    default: m.AiModModal,
  })),
);
const WelcomeModal = lazyWithPreload(() =>
  import("./components/menus/StartModal").then((m) => ({
    default: m.WelcomeModal,
  })),
);
const SampleMapsModal = lazyWithPreload(() =>
  import("./components/menus/StartModal").then((m) => ({
    default: m.SampleMapsModal,
  })),
);
const MyMapsModal = lazyWithPreload(() =>
  import("./components/menus/MyMapsModal").then((m) => ({
    default: m.MyMapsModal,
  })),
);
const ImportModal = lazyWithPreload(() =>
  import("./components/menus/ImportModal").then((m) => ({
    default: m.ImportModal,
  })),
);
const NewMapModal = lazyWithPreload(() =>
  import("./components/menus/NewMapModal").then((m) => ({
    default: m.NewMapModal,
  })),
);
const PresetBrowserModal = lazyWithPreload(() =>
  import("./components/menus/PresetBrowserModal").then((m) => ({
    default: m.PresetBrowserModal,
  })),
);
const PublishPresetModal = lazyWithPreload(() =>
  import("./components/menus/PublishPresetModal").then((m) => ({
    default: m.PublishPresetModal,
  })),
);
const FeedbackModal = lazyWithPreload(() =>
  import("./components/menus/FeedbackModal").then((m) => ({
    default: m.FeedbackModal,
  })),
);
const HistoryModal = lazyWithPreload(() =>
  import("./components/menus/HistoryModal").then((m) => ({
    default: m.HistoryModal,
  })),
);
const ShareModal = lazyWithPreload(() =>
  import("./components/menus/ShareModal").then((m) => ({
    default: m.ShareModal,
  })),
);
const PackBrowserModal = lazyWithPreload(() =>
  import("./components/menus/PackBrowserModal").then((m) => ({
    default: m.PackBrowserModal,
  })),
);
const AutoTimePrompt = lazyWithPreload(() =>
  import("./components/AutoTimePrompt").then((m) => ({
    default: m.AutoTimePrompt,
  })),
);
const PackCreator = lazyWithPreload(() =>
  import("./components/PackCreator").then((m) => ({ default: m.PackCreator })),
);
import {
  CommentIcon,
  SampleMapsIcon,
  UsersIcon,
} from "./components/ui/StartIcons";
import {
  MusicNoteIcon,
  RedoIcon,
  UndoIcon,
  UserIcon,
} from "./components/ui/Icons";
import {
  createRateDifficulty as makeRateDifficulty,
  difficultyRate,
  type RateCreateOptions,
} from "./lib/rateChange";
import type { Comment } from "./lib/comments";
import {
  saveProjectCloud,
  saveProjectDataCloud,
  loadProjectCloud,
  loadProjectChartCloud,
  publishProjectAsset,
  loadProjectAssets,
  listMyProjectsRich,
} from "./lib/cloud";
import type { PatternNote } from "./lib/patterns";
import { computeStarRating } from "./lib/starRating";
import { supabase, getSupabaseToken } from "./lib/supabase";
import {
  useCollab,
  type AssetChange,
  type ProjectSyncChange,
} from "./hooks/useCollab";
import {
  applyNoteOp,
  applyOp,
  applyDiffFieldOp,
  invertNoteOp,
  type NoteOp,
  type DiffFieldOp,
  type CollabOp,
} from "./lib/ops";
import { myAccess, type AccessRole } from "./lib/collab";
import { chooseMapperName } from "./lib/mapperName";
import { validateProject, type ValidationResult } from "./lib/validation";
import { Button } from "./components/ui/Controls";
import { TimedNotification } from "./components/ui/TimedNotification";
import { pushClip, type DifficultyClip } from "./lib/clipboardStore";
import { formatOsuTimestamp } from "./lib/osuTimestamp";
import {
  loadClipAssets,
  placeClipAssets,
  saveClipAssets,
  type ClipAsset,
  type ClipAssetKind,
} from "./lib/clipboardAssets";
import { adoptCopiedDifficulty } from "./lib/editorClipboard";
import {
  CommandPalette,
  type PaletteCommand,
} from "./components/ui/CommandPalette";
import { VolumeRings, type VolumeMeter } from "./components/ui/VolumeRings";
import { SessionIntro } from "./components/ui/SessionIntro";
import type { SettingsTab } from "./components/menus/AppSettingsModal";
import { Menu } from "./components/ui/Menu";
import { HistoryPopover } from "./components/ui/HistoryPopover";
import { Modal } from "./components/ui/Modal";
import { HoldConfirmDialog } from "./components/ui/HoldConfirmDialog";
import { AccountControl } from "./components/auth/LoginButton";
import { LanguagePicker } from "./components/LanguagePicker";
import { isDesktopApp, setLaunchFileConsumer } from "./lib/pwa";
import {
  osuChooseRoot,
  osuFolderName,
  osuMapLabel,
  osuReadMap,
  osuSelectedMap,
  osuSendMap,
  osuStatus,
  osuSyncMap,
  type OsuStatus,
} from "./lib/osuDesktop";
import { watchLaunchFiles } from "./lib/desktopFiles";
import { updatePresence } from "./lib/discordPresence";
import {
  checkDesktopUpdate,
  installDesktopUpdate,
  type DesktopUpdate,
} from "./lib/desktopUpdate";
import { siteAsset } from "./lib/siteAssets";
import { usePwa } from "./hooks/usePwa";
import { DesktopDownloadLink } from "./components/DesktopDownloadLink";
import { NotificationInbox } from "./components/NotificationInbox";
const AdminPanel = lazyWithPreload(() =>
  import("./components/admin/AdminPanel").then((m) => ({
    default: m.AdminPanel,
  })),
);
/** Fetches every split-out editor and menu surface so none suspends on first open. */
function preloadLazyChunks(): Promise<unknown> {
  return Promise.allSettled(
    [
      BottomTimeline,
      CommentsSidebar,
      DifficultySidebar,
      ManiaEditor,
      PlaytestNpsGraph,
      PlaytestOverlay,
      PlaytestRunStats,
      PPCounter,
      TransportBar,
      SettingsModal,
      AppSettingsModal,
      SkinModal,
      DifficultyModal,
      TimingModal,
      SvModal,
      ToolsModal,
      MapCardModal,
      MapCardPrompt,
      AiModModal,
      WelcomeModal,
      SampleMapsModal,
      MyMapsModal,
      ImportModal,
      NewMapModal,
      PresetBrowserModal,
      PublishPresetModal,
      FeedbackModal,
      HistoryModal,
      ShareModal,
      PackBrowserModal,
      AutoTimePrompt,
      PackCreator,
      AdminPanel,
    ].map((component) => component.preload()),
  );
}
import {
  InviteNotifications,
  type InviteNotice,
} from "./components/InviteNotifications";
import {
  installUiSoundInteractions,
  playUiSound,
  preloadUiSounds,
  setUiSoundsEnabled,
  setUiSoundVolume,
} from "./lib/uiSounds";
import { setPerformanceMode } from "./lib/performanceMode";
import { useAuth } from "./lib/auth";
import { useLocale, useT, type MessageKey } from "./lib/i18n";
import {
  downloadCloudMenuBackground,
  downloadCloudSkin,
  listCloudSkins,
  loadAccountSettings,
  loadCloudMenuBackground,
  normalizeAccountSettings,
  removeCloudMenuBackground,
  removeCloudSkin,
  saveAccountSettings,
  uploadCloudMenuBackground,
  uploadCloudSkin,
  type AccountSettings,
  type CloudMenuBackground,
  type CloudSkin,
} from "./lib/accountCloud";
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InboxNotification,
} from "./lib/notifications";
import { logAnalyticsEvent } from "./lib/analytics";
import { useAudio } from "./hooks/useAudio";
import { useWaveform } from "./hooks/useWaveform";
import { useHitsounds } from "./hooks/useHitsounds";
import { usePlaytestInput } from "./hooks/usePlaytestInput";
import { usePlaytestAutoplay } from "./hooks/usePlaytestAutoplay";
import {
  fullLongNotes,
  fullRiceNotes,
  fullLongNotesWithin,
  fullRiceNotesWithin,
  shiftLongNoteEnds,
  dropShortLongNotes,
  copyHitsounds,
  countHitsounds,
} from "./lib/noteTools";
import {
  hasNoteCollisions,
  sameNoteGeometry,
  withoutNoteCollisions,
} from "./lib/noteCollision";
import { downloadOsu, setFilename } from "./lib/osuExport";
import {
  adoptOsuDifficulty,
  importOsz,
  isManiaOsu,
  isSameSong,
  parseOsuFile,
  type ParsedOsu,
} from "./lib/osuImport";
import { MALODY_MAX_KEYS } from "./lib/malody";
import { setLaneColourScheme } from "./lib/laneColours";
import { useSkillsetTimeline } from "./lib/msd/useMsd";
import { msdSupportsKeyCount } from "./lib/msd/minacalc";
import { SkillsetGraph } from "./components/SkillsetGraph";
import { snapshotBlob, snapshotBlobMap } from "./lib/blobSnapshot";
import { parseSmFile } from "./lib/smImport";
import type { PackSong } from "./lib/smPackImport";
import { assertTextImportSize } from "./lib/importLimits";
import {
  maniaJudgementWindows,
  maniaReleaseWindows,
  clampPlaytestRate,
} from "./lib/playtestJudgements";
import { createPlaytestEngine, type PlaytestEngine } from "./lib/playtestEngine";
import { createPlaytestScoreStore } from "./lib/playtestScoreStore";
import { PLAYHEAD_FROM_EDGE as PLAYTEST_HIT_LINE_FROM_EDGE } from "./lib/playfieldGeometry";
import {
  buildPlaytestNoteIndex,
  firstNoteAtOrAfter,
  nearestPlayableNote,
  type PlaytestNoteIndex,
} from "./lib/playtestIndex";
import { normalizePlaytestKeybinds } from "./lib/playtestKeybinds";
import { normalizeHudLayout } from "./lib/hudLayout";
import { normalizePlaytestSkin } from "./lib/playtestSkin";
import { PRESET_SKINS } from "./lib/presetSkins";
import {
  loadProject,
  requestPersistentStorage,
  saveProject,
  PROJECT_VERSION,
  savePreferences,
  loadPreferences,
  saveSkinBlob,
  loadSkinBlob,
  saveHitsoundSkinBlob,
  loadHitsoundSkinBlob,
  saveSkinToLibrary,
  loadSkinLibrary,
  saveHitsoundSkinSource,
  loadHitsoundSkinSource,
  saveVolume,
  loadVolume,
  saveViewPreferences,
  loadViewPreferences,
  projectStorageKey,
  type SavedSkinBlob,
  type SavedProject,
} from "./lib/persistence";
import { restoreSnapshot } from "./lib/projectVault";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SONG_META,
  DEFAULT_VIEW,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  defaultTimingPoints,
  isAltWheelAction,
  makeDifficulty,
  makeRedPoint,
  normalizeTimingPoints,
  uid,
  type AppSettings,
  type BackgroundScope,
  type Difficulty,
  type HitsoundSkinSource,
  type HumanizeSettings,
  type LoadedFile,
  type LoadedSkin,
  type ManiaNote,
  type PlaytestSettings,
  type SongMeta,
  type TimingPoint,
  type ViewState,
} from "./types";
import type { MapCardPresetOption } from "./lib/mapCard";
import { detectBpmFromBuffer, type BpmDetection } from "./lib/bpmDetect";
import { notesFollowingTiming, sortedPoints } from "./lib/timing";
import { hasSv } from "./lib/sv";
import {
  editorKeyLabel,
  matchesBind,
  normalizeEditorKeybinds,
  snapDivisorForBind,
  timelineZoomDirection,
  type EditorAction,
} from "./lib/editorKeybinds";
import { MAX_UI_SCALE, MIN_UI_SCALE, clampUiScale, uiScaleFromWheel } from "./lib/uiScale";
import { OnScreenDisplay } from "./components/ui/OnScreenDisplay";
import {
  MAX_PLAYTEST_SCROLL_SPEED,
  MIN_PLAYTEST_SCROLL_SPEED,
  gameplayTime,
  inputTime,
  normalizePlaytestTiming,
  runStartTime,
  type PlaytestTiming,
} from "./lib/playtestClock";
import { osdRange, osdToggle, type OsdNotice } from "./lib/osd";
import {
  clearUiBreakpointAttributes,
  syncUiBreakpointAttributes,
} from "./lib/uiBreakpoints";
import {
  MAX_PLAYFIELD_SCALE,
  MIN_PLAYFIELD_SCALE,
  playfieldScaleFromWheel,
  timelineZoomFromWheel,
  volumeFromWheel,
} from "./lib/altWheel";
import {
  fetchFeatureFlags,
  loadCachedFlags,
  type FeatureFlags,
} from "./lib/featureFlags";
import { parseOsuBeatmapLink } from "./lib/osuLinks";
import {
  formatBytes,
  readBlobWithProgress,
  scopedProgress,
  type ProgressFn,
  type ProgressReport,
} from "./lib/progress";
import type { AutoTimeStatus } from "./components/AutoTimePrompt";
import { useMountedModals } from "./hooks/useMountedModals";
import {
  bookmarkInDirection,
  bookmarkKey,
  loopAroundTime,
  remapBookmarkLabels,
  sortedBookmarks,
} from "./lib/bookmarks";

const MemoizedManiaEditor = memo(ManiaEditor);
const MemoizedBottomTimeline = memo(BottomTimeline);
const MemoizedDifficultySidebar = memo(DifficultySidebar);
const MemoizedPPCounter = memo(PPCounter);
const MemoizedPlaytestNpsGraph = memo(PlaytestNpsGraph);

type ModalId =
  | "history"
  | "audioSetup"
  | "newMap"
  | "welcome"
  | "myProjects"
  | "import"
  | "sampleMaps"
  | "mapSettings"
  | "settings"
  | "skin"
  | "timing"
  | "sv"
  | "difficulty"
  | "tools"
  | "mapCard"
  | "aimod"
  | "myMaps"
  | "presets"
  | "publishPreset"
  | "feedback"
  | "versionHistory"
  | "admin"
  | "share"
  | "packBrowser"
  | null;

type DocSnapshot = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

type BookmarkLoopState = {
  diffId: string;
  startMs: number;
  endMs: number;
  enabled: boolean;
};

type OsuEntry = { file: File; parsed: ParsedOsu };

function decodeJwtClaims(
  token: string,
): { sub?: string; role?: string; exp?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function newLocalProjectId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `local-${random}`;
}

async function loadFile(file: File): Promise<LoadedFile> {
  const blob = await snapshotBlob(file);
  return { name: file.name, url: URL.createObjectURL(blob), blob };
}

const LOCAL_AUTOSAVE_MS = 60000;
/** osu!mania's DelayedResumeOverlay counts 3 over two seconds. */
const PLAYTEST_RESUME_COUNTDOWN_MS = 2000;

function describeSaveError(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  if (err.name === "QuotaExceededError") {
    return "browser storage is full";
  }
  if (err.name === "AbortError" || err.name === "NotReadableError") {
    return "a source file changed on disk, re-add your audio/background files";
  }
  return err.message || err.name || null;
}

/**
 * Where a playtest run is, not how it is going: the score lives in a store
 * the HUD reads (see playtestScoreStore), so judgements do not re-render the
 * editor.
 */
type PlaytestRuntimeState = {
  active: boolean;
  /** Where the run's notes start: the playhead it was started from. */
  startTime: number;
  ended: boolean;
  paused: boolean;
  autoplay: boolean;
  runKey: number;
  countdownEndsAt: number | null;
  /** The countdown is bringing a paused run back rather than starting one. */
  resuming: boolean;
};

function initialPlaytestState(): PlaytestRuntimeState {
  return {
    active: false,
    startTime: 0,
    ended: false,
    paused: false,
    autoplay: false,
    runKey: 0,
    countdownEndsAt: null,
    resuming: false,
  };
}

function normalizeHumanize(
  saved: Partial<HumanizeSettings> | undefined,
): HumanizeSettings {
  const legacy = saved as { greatChance?: number } | undefined;
  const { slipChance, ...rest } = saved ?? {};
  return {
    ...DEFAULT_APP_SETTINGS.playtest.humanize,
    ...rest,
    slipChance:
      slipChance ??
      (typeof legacy?.greatChance === "number"
        ? Math.min(0.1, legacy.greatChance / 4)
        : DEFAULT_APP_SETTINGS.playtest.humanize.slipChance),
  };
}

function normalizeAppSettings(
  prefs: Partial<AppSettings> | null,
): AppSettings {
  const playtestPrefs = prefs?.playtest as Partial<PlaytestSettings> | undefined;
  const suggestedUiScale =
    typeof window !== "undefined" &&
    (window.innerWidth >= 2000 || window.innerHeight >= 1200)
      ? 1.15
      : 1;
  const uiScale =
    typeof prefs?.uiScale === "number" && Number.isFinite(prefs.uiScale)
      ? clampUiScale(prefs.uiScale)
      : suggestedUiScale;
  return {
    ...DEFAULT_APP_SETTINGS,
    ...(prefs ?? {}),
    uiScale,
    masterVolume:
      typeof prefs?.masterVolume === "number" &&
      Number.isFinite(prefs.masterVolume)
        ? Math.max(0, Math.min(1, prefs.masterVolume))
        : DEFAULT_APP_SETTINGS.masterVolume,
    altWheelAction: isAltWheelAction(prefs?.altWheelAction)
      ? prefs.altWheelAction
      : DEFAULT_APP_SETTINGS.altWheelAction,
    playtest: {
      ...normalizePlaytestTiming(
        { ...DEFAULT_APP_SETTINGS.playtest, ...(playtestPrefs ?? {}) },
        DEFAULT_APP_SETTINGS.playtest,
      ),
      keybinds: normalizePlaytestKeybinds(playtestPrefs?.keybinds),
      hud: normalizeHudLayout(playtestPrefs?.hud),
      skin: normalizePlaytestSkin(playtestPrefs?.skin),
      humanize: normalizeHumanize(playtestPrefs?.humanize),
      skill: {
        ...DEFAULT_APP_SETTINGS.playtest.skill,
        ...(playtestPrefs?.skill ?? {}),
        enabled: true,
        lnProfile: playtestPrefs?.skill
          ? playtestPrefs.skill.lnProfile
          : DEFAULT_APP_SETTINGS.playtest.skill.lnProfile,
        danSelections: playtestPrefs?.skill
          ? (playtestPrefs.skill.danSelections ?? {})
          : DEFAULT_APP_SETTINGS.playtest.skill.danSelections,
      },
    },
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    !!el?.isContentEditable
  );
}

function blurActiveControl(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !document.getElementById("root")?.contains(el)) return;
  if (isTypingTarget(el) && (el as HTMLInputElement).type !== "range") return;
  if (typeof el.blur === "function") el.blur();
}

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes("Files");
}

const TRIM_BROADCAST_MS = 90;

export default function App() {
  const {
    user: authUser,
    loading: authLoading,
    refresh: refreshAuth,
    login: authLogin,
  } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const [meta, setMeta] = useState<SongMeta>(DEFAULT_SONG_META);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>(
    defaultTimingPoints,
  );
  const [difficulties, setDifficulties] = useState<Difficulty[]>(() => [
    makeDifficulty("Normal", 4),
  ]);
  const [activeId, setActiveId] = useState<string>(() => difficulties[0].id);
  const [view, setView] = useState<ViewState>(
    () => loadViewPreferences() ?? DEFAULT_VIEW,
  );

  const [audioFiles, setAudioFiles] = useState<Record<string, LoadedFile>>({});
  const [bgFiles, setBgFiles] = useState<Record<string, LoadedFile>>({});
  const [videoFiles, setVideoFiles] = useState<Record<string, LoadedFile>>({});
  const [pendingBgName, setPendingBgName] = useState<string | null>(null);
  const [skin, setSkin] = useState<LoadedSkin | null>(null);
  const [hitsoundSkin, setHitsoundSkin] = useState<LoadedSkin | null>(null);
  const [hitsoundSkinSource, setHitsoundSkinSource] =
    useState<HitsoundSkinSource>(() => loadHitsoundSkinSource());
  const [skinLibrary, setSkinLibrary] = useState<SavedSkinBlob[]>([]);
  const [cloudSkins, setCloudSkins] = useState<CloudSkin[]>([]);
  const [cloudSkinsLoading, setCloudSkinsLoading] = useState(false);
  const [menuBackground, setMenuBackground] =
    useState<CloudMenuBackground | null>(null);
  const [menuBackgroundUrl, setMenuBackgroundUrl] = useState<string | null>(null);
  const [menuBackgroundBusy, setMenuBackgroundBusy] = useState(false);
  const [menuBackgroundError, setMenuBackgroundError] = useState<string | null>(
    null,
  );
  const [skinError, setSkinError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mapCardStart, setMapCardStart] = useState<MapCardPresetOption | null>(null);
  const [mapCardOffer, setMapCardOffer] = useState<{
    target: string;
    open: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const [invisibleMode, setInvisibleMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem("mania:invisible") === "1";
    } catch {
      return false;
    }
  });
  const toggleInvisibleMode = useCallback(() => {
    setInvisibleMode((v) => {
      const next = !v;
      try {
        localStorage.setItem("mania:invisible", next ? "1" : "0");
      } catch {
        // ignore storage failures (private mode etc.)
      }
      return next;
    });
  }, []);
  const [modal, setModal] = useState<ModalId>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("General");
  const [historyPanel, setHistoryPanel] = useState(false);
  const modalMounted = useMountedModals(modal);
  const [timingSelection, setTimingSelection] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const packCreatorEverOpenedRef = useRef(false);
  const adminEverOpenedRef = useRef(false);
  const [selectionRange, setSelectionRange] = useState<{
    start: number;
    end: number;
    count: number;
    ids: ReadonlySet<string>;
  } | null>(null);
  // Admin kill switches; cached copy renders instantly, then the fetch and a
  // realtime subscription keep it current. Fails open (see lib/featureFlags).
  const [featureFlags, setFeatureFlags] =
    useState<FeatureFlags>(loadCachedFlags);
  const featureFlagsRef = useRef(featureFlags);
  featureFlagsRef.current = featureFlags;
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchFeatureFlags().then((flags) => {
        if (!cancelled) setFeatureFlags(flags);
      });
    };
    refresh();
    const ch = supabase
      .channel("feature-flags")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_flags" },
        refresh,
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);
  const [packCreatorOpen, setPackCreatorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const phoneViewport = usePhoneViewport();
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [pendingDeleteDiffIds, setPendingDeleteDiffIds] = useState<
    string[] | null
  >(null);
  const [projectStarted, setProjectStarted] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [shortcutNotice, setShortcutNotice] = useState<
    (OsdNotice & { id: number }) | null
  >(null);
  const [volumeHudKey, setVolumeHudKey] = useState(0);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => ({
    ...normalizeAppSettings(loadPreferences()),
  }));
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;
  // Set before the children render so every playfield drawing picks it up.
  setLaneColourScheme(appSettings.colourblindLanes ? "colourblind" : "default");
  /** Shows the on-screen display: a setting with its new value, or a message. */
  const announceShortcut = useCallback((notice: OsdNotice | string) => {
    if (!appSettingsRef.current.shortcutNoticesEnabled) return;
    const body = typeof notice === "string" ? { label: notice } : notice;
    setShortcutNotice({ ...body, id: Date.now() + Math.random() });
    playUiSound("notice");
  }, []);
  const hideShortcutNotice = useCallback(() => setShortcutNotice(null), []);
  const openSettings = useCallback((tab: SettingsTab = "General") => {
    setSettingsTab(tab);
    setModal("settings");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "k")
        return;
      event.preventDefault();
      event.stopPropagation();
      setPaletteOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
  // Layout effect so the scaled font size and the breakpoint attributes land
  // before first paint, instead of flashing an unscaled/compact header.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = `${16 * appSettings.uiScale}px`;
    const syncBreakpoints = () =>
      syncUiBreakpointAttributes(root, window.innerWidth, appSettings.uiScale);
    syncBreakpoints();
    window.addEventListener("resize", syncBreakpoints);
    return () => {
      window.removeEventListener("resize", syncBreakpoints);
      clearUiBreakpointAttributes(root);
      root.style.fontSize = previous;
    };
  }, [appSettings.uiScale]);
  const [bgScope, setBgScope] = useState<BackgroundScope>("mapset");
  const [askBgScope, setAskBgScope] = useState(false);
  const [lnTicks, setLnTicks] = useState(1);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [osuBusy, setOsuBusy] = useState(false);
  const {
    live: osuLive,
    connectedAt: osuConnectedAt,
    acknowledge: acknowledgeOsu,
  } = useOsuLive(appSettings.osuListenerEnabled);
  const [osuApp, setOsuApp] = useState<OsuStatus | null>(null);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [pendingOsuDiffs, setPendingOsuDiffs] = useState<OsuEntry[] | null>(
    null,
  );
  const [importingMap, setImportingMap] = useState(false);
  useEffect(() => {
    if (importingMap) void loadEditorWorkspace();
  }, [importingMap]);
  // Long jobs report a 0-1 ratio plus a label so the loader can say what it is
  // actually doing instead of spinning indefinitely.
  const [importProgress, setImportProgress] = useState<ProgressReport | null>(
    null,
  );
  const [exportProgress, setExportProgress] = useState<ProgressReport | null>(
    null,
  );
  const [scannedPackSongs, setScannedPackSongs] = useState<PackSong[]>([]);
  const [scanningPack, setScanningPack] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [currentHitSound, setCurrentHitSound] = useState(0);
  const [currentSampleSet, setCurrentSampleSet] = useState(0);
  const [saveStatus, setSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [saveErrorDetail, setSaveErrorDetail] = useState<string | null>(null);
  const [needsSongHint, setNeedsSongHint] = useState(false);
  const { updateReady: pwaUpdateReady, applyPendingUpdate } = usePwa();
  const [localProjectId, setLocalProjectId] = useState(newLocalProjectId);
  const [exportCheck, setExportCheck] = useState<{
    result: ValidationResult;
    target: string;
    run: () => void;
  } | null>(null);
  const [mapperPrompt, setMapperPrompt] = useState<{
    target: string;
    run: (songMeta: SongMeta) => void;
  } | null>(null);
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [cloudOwnerId, setCloudOwnerId] = useState<string | null>(null);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudSyncRetry, setCloudSyncRetry] = useState(0);
  const [invites, setInvites] = useState<InviteNotice[]>([]);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null,
  );
  const [accountSyncStatus, setAccountSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");
  const [accountSyncError, setAccountSyncError] = useState<string | null>(null);
  const [publishPattern, setPublishPattern] = useState<PatternNote[] | null>(
    null,
  );
  const [publishKeyCount, setPublishKeyCount] = useState(4);
  const importStartedRef = useRef(false);

  const [myRole, setMyRole] = useState<AccessRole>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentUnreadCount, setCommentUnreadCount] = useState(0);
  const [bookmarkLoop, setBookmarkLoop] = useState<BookmarkLoopState | null>(
    null,
  );
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [commentMarkers, setCommentMarkers] = useState<
    {
      time_ms: number;
      resolved: boolean;
      body: string;
      author: string;
      difficulty_id: string | null;
    }[]
  >([]);
  const [peerNotice, setPeerNotice] = useState<{
    key: number;
    text: string;
    avatar: string | null;
  } | null>(null);
  const active =
    difficulties.find((d) => d.id === activeId) ?? difficulties[0];
  const activeCommentMarkers = useMemo(
    () => commentMarkers.filter((c) => c.difficulty_id === active.id),
    [commentMarkers, active.id],
  );
  const activeBookmarkLoop =
    bookmarkLoop?.diffId === active.id ? bookmarkLoop : null;
  const [playtest, setPlaytest] = useState<PlaytestRuntimeState>(
    initialPlaytestState,
  );
  const playtestRef = useRef(playtest);
  playtestRef.current = playtest;
  const playtestEngineRef = useRef<PlaytestEngine | null>(null);
  /** The notes the engine was built from, to notice edits during a run. */
  const playtestEngineNotesRef = useRef<ManiaNote[] | null>(null);
  const [playtestScore] = useState(createPlaytestScoreStore);
  const playtestNoteIndexRef = useRef<PlaytestNoteIndex | null>(null);
  const playtestEndArmedRef = useRef(false);
  /** A run counting in over silence before the song's start. */
  const playtestPreRollRef = useRef<{
    from: number;
    startedAt: number;
    pausedAt: number | null;
    timer: number;
  } | null>(null);
  // The playfield reads the engine's note states through these.
  const playtestHiddenView = useMemo(
    () => ({ current: { has: (id: string) => playtestEngineRef.current?.hidden.has(id) ?? false } }),
    [],
  );
  const playtestHoldingView = useMemo(
    () => ({ current: { has: (id: string) => playtestEngineRef.current?.holding.has(id) ?? false } }),
    [],
  );
  const playtestDroppedView = useMemo(
    () => ({ current: { has: (id: string) => playtestEngineRef.current?.dropped.has(id) ?? false } }),
    [],
  );
  const difficultiesRef = useRef(difficulties);
  difficultiesRef.current = difficulties;
  const audioFilesRef = useRef(audioFiles);
  audioFilesRef.current = audioFiles;
  const bgFilesRef = useRef(bgFiles);
  bgFilesRef.current = bgFiles;
  const videoFilesRef = useRef(videoFiles);
  videoFilesRef.current = videoFiles;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const timingPointsRef = useRef(timingPoints);
  timingPointsRef.current = timingPoints;
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;
  useEffect(() => {
    if (!isDesktopApp()) return;
    let live = true;
    void osuStatus().then((status) => {
      if (live) setOsuApp(status);
    });
    void checkDesktopUpdate()
      .then((update) => {
        if (live) setDesktopUpdate(update);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const timer = window.setTimeout(() => {
      void updatePresence({
        mode: appSettings.discordPresence,
        projectOpen: projectStarted,
        song: projectStarted ? `${meta.artist} - ${meta.title}`.trim() : null,
        difficulty: active?.name ?? null,
        keyCount: active?.keyCount ?? null,
        playtesting: playtest.active,
      }).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    appSettings.discordPresence,
    projectStarted,
    meta.artist,
    meta.title,
    active?.name,
    active?.keyCount,
    playtest.active,
  ]);

  const applyDesktopUpdate = useCallback(() => {
    setUpdating(true);
    void installDesktopUpdate().catch((error: unknown) => {
      setUpdating(false);
      setImportError(
        error instanceof Error ? error.message : t("app.updateFailed"),
      );
    });
  }, [t]);
  const appOpenLoggedRef = useRef(false);
  useEffect(() => {
    if (authLoading || appOpenLoggedRef.current) return;
    appOpenLoggedRef.current = true;
    void logAnalyticsEvent("app_opened", authUserRef.current?.id).catch(
      () => {},
    );
  }, [authLoading]);
  const refreshCloudSkins = useCallback(async () => {
    const userId = authUserRef.current?.id;
    if (!userId) {
      setCloudSkins([]);
      setCloudSkinsLoading(false);
      return;
    }
    setCloudSkinsLoading(true);
    try {
      setCloudSkins(await listCloudSkins(userId));
    } catch {
      setCloudSkins([]);
    } finally {
      setCloudSkinsLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshCloudSkins();
  }, [authUser?.id, refreshCloudSkins]);
  const refreshMenuBackground = useCallback(async () => {
    const userId = authUserRef.current?.id;
    if (!userId) {
      setMenuBackground(null);
      return;
    }
    try {
      setMenuBackground(await loadCloudMenuBackground(userId));
    } catch {
      setMenuBackground(null);
    }
  }, []);
  useEffect(() => {
    void refreshMenuBackground();
  }, [authUser?.id, refreshMenuBackground]);
  const cloudProjectIdRef = useRef(cloudProjectId);
  cloudProjectIdRef.current = cloudProjectId;
  const inviteNoticeProjectsRef = useRef<Set<string>>(new Set());

  const liveEnabled = !!cloudProjectId && !!authUser;
  const canEdit =
    !playtest.active &&
    (!cloudProjectId || myRole === "owner" || myRole === "editor");
  const sessionActiveRef = useRef(false);
  sessionActiveRef.current = liveEnabled;
  const canEditRef = useRef(true);
  canEditRef.current = canEdit;

  const applyingRemoteRef = useRef(false);
  const opUndoRef = useRef<NoteOp[]>([]);
  const opRedoRef = useRef<NoteOp[]>([]);
  const pendingDiffOpRef = useRef<DiffFieldOp | null>(null);
  const lastDiffOpSendRef = useRef(0);
  const diffOpTimerRef = useRef<number | null>(null);
  const pendingDocSyncRef = useRef(false);
  const cloudSyncTimerRef = useRef<number | null>(null);
  const localEditVersionRef = useRef(0);
  const cloudRevisionRef = useRef<number | null>(null);
  const ownMutationIdsRef = useRef<Set<string>>(new Set());
  const collabRef = useRef<ReturnType<typeof useCollab> | null>(null);
  const publishedAssetBlobsRef = useRef<Map<string, Blob>>(new Map());
  const assetPublishPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const cloudSavePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const [assetPublishTick, setAssetPublishTick] = useState(0);
  const [assetSyncTick, setAssetSyncTick] = useState(0);
  const assetAttemptsRef = useRef<Map<string, number>>(new Map());
  const forcedAssetReloadsRef = useRef<Set<string>>(new Set());
  const cloudRefreshIdRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const accountSettingsReadyUserRef = useRef<string | null>(null);
  const lastCloudSettingsRef = useRef<string | null>(null);
  const accountSettingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const accountSettingsSaveVersionRef = useRef(0);

  const markStructural = useCallback(() => {
    localEditVersionRef.current += 1;
    if (sessionActiveRef.current) pendingDocSyncRef.current = true;
  }, []);

  useEffect(() => {
    if (!cloudProjectId || !authUser) return;
    if (cloudOwnerId === authUser.id) {
      setMyRole("owner");
      return;
    }
    const ch = supabase
      .channel(`collab:${cloudProjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_collaborators",
          filter: `project_id=eq.${cloudProjectId}`,
        },
        () => {
          myAccess(cloudProjectId, authUser.id)
            .then(setMyRole)
            .catch(() => {});
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [cloudProjectId, cloudOwnerId, authUser]);

  const applyRemoteOp = useCallback((op: CollabOp) => {
    applyingRemoteRef.current = true;
    setDifficulties((prev) => applyOp(prev, op));
  }, []);
  const refreshFromCloud = useCallback((change?: ProjectSyncChange) => {
    const pid = cloudProjectIdRef.current;
    if (!pid) return;
    if (change?.mutationId && ownMutationIdsRef.current.has(change.mutationId)) {
      if (change.revision !== null) cloudRevisionRef.current = change.revision;
      return;
    }
    if (
      change?.revision !== null &&
      change?.revision !== undefined &&
      cloudRevisionRef.current !== null &&
      change.revision <= cloudRevisionRef.current
    ) {
      return;
    }
    const refreshId = ++cloudRefreshIdRef.current;
    const editVersion = localEditVersionRef.current;
    void loadProjectChartCloud(pid)
      .then((snapshot) => {
        if (refreshId !== cloudRefreshIdRef.current) return;
        if (
          localEditVersionRef.current !== editVersion ||
          pendingDocSyncRef.current ||
          cloudSyncTimerRef.current !== null
        ) {
          return;
        }
        if (
          snapshot.revision !== null &&
          cloudRevisionRef.current !== null &&
          snapshot.revision <= cloudRevisionRef.current
        ) {
          return;
        }
        if (snapshot.revision !== null) cloudRevisionRef.current = snapshot.revision;
        const data = snapshot.data;
        const localChart = JSON.stringify({
          meta: metaRef.current,
          timingPoints: timingPointsRef.current,
          difficulties: difficultiesRef.current,
        });
        const remoteChart = JSON.stringify({
          meta: data.meta,
          timingPoints: data.timingPoints,
          difficulties: data.difficulties,
        });
        if (localChart === remoteChart) return;
        applyingRemoteRef.current = true;
        setMeta(data.meta);
        setTimingPoints(normalizeTimingPoints(data.timingPoints));
        const diffs = (
          data.difficulties?.length ? data.difficulties : [makeDifficulty()]
        ).map((d) => ({
          ...d,
          timingPoints: normalizeTimingPoints(d.timingPoints),
        }));
        setDifficulties(diffs);
        setActiveId((cur) =>
          diffs.some((d) => d.id === cur) ? cur : diffs[0].id,
        );
      })
      .catch(() => {});
  }, []);

  const showPeerNotice = useCallback((text: string, avatar: string | null) => {
    setPeerNotice({ key: Date.now(), text, avatar });
  }, []);

  const collab = useCollab({
    projectId: cloudProjectId,
    enabled: liveEnabled,
    invisible: invisibleMode,
    me: authUser
      ? { id: authUser.id, username: authUser.username, avatar: authUser.avatar_url }
      : null,
    onRemoteOp: applyRemoteOp,
    onRefresh: refreshFromCloud,
    onAssetChange: useCallback((change: AssetChange) => {
      if (change.filename) {
        forcedAssetReloadsRef.current.add(change.filename);
        assetAttemptsRef.current.delete(change.filename);
      }
      setAssetSyncTick((tick) => tick + 1);
    }, []),
    onPeerJoin: useCallback(
      (p: { username: string; avatar: string | null }) =>
        showPeerNotice(`${p.username} joined the session`, p.avatar),
      [showPeerNotice],
    ),
    onPeerLeave: useCallback(
      (p: { username: string; avatar: string | null }) =>
        showPeerNotice(`${p.username} left`, p.avatar),
      [showPeerNotice],
    ),
    onNotice: useCallback(
      (n: { text: string; avatar: string | null }) =>
        showPeerNotice(n.text, n.avatar),
      [showPeerNotice],
    ),
  });
  collabRef.current = collab;

  const queueCloudSave = useCallback(
    (projectId: string, data: Parameters<typeof saveProjectDataCloud>[1]) => {
      const mutationId = crypto.randomUUID();
      ownMutationIdsRef.current.add(mutationId);
      if (ownMutationIdsRef.current.size > 1_000) {
        const oldest = ownMutationIdsRef.current.values().next().value;
        if (oldest) ownMutationIdsRef.current.delete(oldest);
      }
      const save = async () => {
        await assetPublishPromiseRef.current;
        const stamp = await saveProjectDataCloud(projectId, data, mutationId);
        if (stamp.revision !== null) cloudRevisionRef.current = stamp.revision;
      };
      const queued = cloudSavePromiseRef.current
        .catch(() => {})
        .then(save)
        .catch((error) => {
          ownMutationIdsRef.current.delete(mutationId);
          throw error;
        });
      cloudSavePromiseRef.current = queued;
      return queued;
    },
    [],
  );

  const commitNoteOp = useCallback((op: NoteOp) => {
    if (!canEditRef.current) return;
    markStructural();
    setDifficulties((prev) => applyNoteOp(prev, op));
    if (sessionActiveRef.current) {
      opUndoRef.current.push(op);
      if (opUndoRef.current.length > 300) opUndoRef.current.shift();
      opRedoRef.current = [];
      collabRef.current?.sendOp(op);
    }
  }, [markStructural]);

  const flushDiffOp = useCallback(() => {
    if (diffOpTimerRef.current !== null) {
      window.clearTimeout(diffOpTimerRef.current);
      diffOpTimerRef.current = null;
    }
    const op = pendingDiffOpRef.current;
    pendingDiffOpRef.current = null;
    if (!op) return;
    lastDiffOpSendRef.current = Date.now();
    collabRef.current?.sendOp(op);
  }, []);

  const commitDiffFields = useCallback(
    (fields: Partial<Record<keyof DiffFieldOp["fields"], number | null>>) => {
      if (!canEditRef.current) return;
      markStructural();
      const diffId = activeIdRef.current;
      const op: DiffFieldOp = { t: "diff.fields", diffId, fields };
      setDifficulties((prev) => applyDiffFieldOp(prev, op));
      if (!sessionActiveRef.current) return;
      const prevOp = pendingDiffOpRef.current;
      pendingDiffOpRef.current =
        prevOp && prevOp.diffId === diffId
          ? { t: "diff.fields", diffId, fields: { ...prevOp.fields, ...fields } }
          : op;
      const elapsed = Date.now() - lastDiffOpSendRef.current;
      if (elapsed >= TRIM_BROADCAST_MS) {
        flushDiffOp();
      } else if (diffOpTimerRef.current === null) {
        diffOpTimerRef.current = window.setTimeout(
          flushDiffOp,
          TRIM_BROADCAST_MS - elapsed,
        );
      }
    },
    [flushDiffOp, markStructural],
  );

  const announceAssetChange = useCallback((action: string) => {
    if (!sessionActiveRef.current) return;
    const name = authUserRef.current?.username ?? "A collaborator";
    collabRef.current?.sendNotice(`${name} ${action}`);
  }, []);

  const noop = useCallback(() => {}, []);

  const updateMeta = useCallback(
    (m: SongMeta) => {
      if (!canEditRef.current) return;
      markStructural();
      setMeta(m);
    },
    [markStructural],
  );

  useEffect(() => {
    if (liveEnabled) collabRef.current?.updatePresence({ activeDiffId: activeId });
  }, [activeId, liveEnabled]);

  const audioFile = useMemo<LoadedFile | null>(() => {
    const named = active.audioFilename ? audioFiles[active.audioFilename] : null;
    if (named) return named;
    const all = Object.values(audioFiles);
    return all.length === 1 ? all[0] : null;
  }, [active.audioFilename, audioFiles]);

  const waveform = useWaveform(audioFile?.blob ?? null);
  const [exclusiveAudio, setExclusiveAudio] = useState(readExclusivePreference);
  const changeExclusiveAudio = useCallback((enabled: boolean) => {
    setExclusiveAudio(enabled);
    try { localStorage.setItem("cascade.audio.exclusive", String(enabled)); } catch { /* Session preference still applies. */ }
  }, []);
  // Rate difficulties keep the original audio file and are played faster or
  // slower; the hook re-scales the whole timeline around that.
  const activeRate = difficultyRate(active);
  const audio = useAudio(
    audioFile?.url ?? null,
    waveform ? waveform.duration * 1000 : null,
    waveform?.buffer ?? null,
    activeBookmarkLoop?.enabled
      ? {
          startMs: activeBookmarkLoop.startMs,
          endMs: activeBookmarkLoop.endMs,
          loop: true,
        }
      : {
          startMs: active.trimStartMs,
          endMs: active.trimEndMs,
          fadeInMs: active.fadeInMs,
          fadeOutMs: active.fadeOutMs,
        },
    activeRate,
    active.preservePitch === true,
    exclusiveAudio && modal !== "audioSetup" && projectStarted,
    appSettings.masterVolume,
    appSettings.keepPitchWhenSlowed,
  );
  // Alt+wheel runs from a window listener mounted once, so it needs a live
  // handle on the controller rather than the render-time closure.
  const audioCtlRef = useRef(audio);
  audioCtlRef.current = audio;
  const currentTimeRef = useRef(audio.getCurrentTime());
  currentTimeRef.current = audio.getCurrentTime();
  const getCurrentTime = audio.getCurrentTime;
  const getVisualCurrentTime = audio.getVisualCurrentTime;
  const isVisualSeekActive = audio.isVisualSeekActive;
  const audioSeek = audio.seek;
  const smoothScrollingRef = useRef(appSettings.smoothScrolling);
  smoothScrollingRef.current = appSettings.smoothScrolling;
  const seekAudio = useCallback(
    (time: number, transition: AudioSeekTransition = "instant") =>
      audioSeek(
        time,
        smoothScrollingRef.current ? transition : "instant",
      ),
    [audioSeek],
  );
  const playAudio = audio.play;
  const pauseAudio = audio.pause;
  const toggleAudio = audio.toggle;
  const setAudioVolume = audio.setVolume;
  const setAudioPlaybackRate = audio.setPlaybackRate;
  const setAudioAmbientDucking = audio.setAmbientDucking;
  const cancelVisualSeek = audio.cancelVisualSeek;
  useEffect(() => {
    if (!appSettings.smoothScrolling) cancelVisualSeek();
  }, [appSettings.smoothScrolling, cancelVisualSeek]);
  const audioVolumeRef = useRef(audio.volume);
  audioVolumeRef.current = audio.volume;
  const toggleWaveformOverlay = useCallback(() => {
    setAppSettings((settings) => {
      const showWaveform = !settings.showWaveform;
      announceShortcut(
        osdToggle(t("osd.waveform"), showWaveform, [
          editorKeyLabel(editorKeybindsRef.current.waveformOverlay),
        ]),
      );
      return { ...settings, showWaveform };
    });
  }, [announceShortcut, t]);

  useEffect(() => {
    if (!activeBookmarkLoop?.enabled) return;
    const current = getCurrentTime();
    if (
      current < activeBookmarkLoop.startMs ||
      current >= activeBookmarkLoop.endMs
    ) {
      seekAudio(activeBookmarkLoop.startMs);
    }
  }, [
    activeBookmarkLoop?.enabled,
    activeBookmarkLoop?.startMs,
    activeBookmarkLoop?.endMs,
    getCurrentTime,
    seekAudio,
  ]);

  const durationRef = useRef(audio.duration);
  durationRef.current = audio.duration;
  const sourceDurationRef = useRef(0);
  sourceDurationRef.current = audio.duration * audio.timeScale;
  const modalAtmosphereOpen =
    (modal !== null && modal !== "timing" && modal !== "sv") ||
    askBgScope ||
    pendingImport !== null ||
    exportCheck !== null ||
    mapperPrompt !== null ||
    showHomeConfirm ||
    pendingDeleteDiffIds !== null;
  const modalAtmosphereActive = modalAtmosphereOpen && audio.isPlaying;
  const effectiveHitsounds = useMemo(() => {
    if (hitsoundSkinSource === "default") return null;
    if (hitsoundSkinSource === "selected") {
      return hitsoundSkin?.hitsounds ?? null;
    }
    return skin?.hitsounds ?? null;
  }, [hitsoundSkin, hitsoundSkinSource, skin]);

  const { playNote: playtestHitsound } = useHitsounds(
    getCurrentTime,
    audio.isPlaying && !playtest.active,
    active.notes,
    active.timingPoints?.length ? active.timingPoints : timingPoints,
    appSettings.hitsoundVolume * appSettings.masterVolume,
    appSettings.hitsoundsEnabled,
    modalAtmosphereActive,
    effectiveHitsounds,
    audio.duration > 0,
  );

  useEffect(() => {
    if (!liveEnabled) return;
    const id = window.setInterval(() => {
      collabRef.current?.updatePresence({
        playheadMs: Math.round(currentTimeRef.current),
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [liveEnabled]);

  useEffect(() => {
    if (!cloudProjectId) return;
    const savePosition = () => {
      try {
        localStorage.setItem(
          `mania:pos:${cloudProjectId}`,
          JSON.stringify({
            activeId,
            playheadMs: Math.round(currentTimeRef.current),
          }),
        );
      } catch {
      }
    };
    const id = window.setInterval(savePosition, 1000);
    return () => {
      window.clearInterval(id);
      savePosition();
    };
  }, [cloudProjectId, activeId]);

  useEffect(() => {
    if (pendingSeekRef.current != null && audio.duration > 0) {
      seekAudio(Math.min(pendingSeekRef.current, audio.duration));
      pendingSeekRef.current = null;
    }
  }, [audio.duration, seekAudio]);

  useEffect(() => {
    if (!cloudProjectId || !liveEnabled || !canEdit) return;
    const pending: { kind: "audio" | "bg"; file: LoadedFile }[] = [];
    for (const f of Object.values(audioFiles))
      if (publishedAssetBlobsRef.current.get(`audio:${f.name}`) !== f.blob)
        pending.push({ kind: "audio", file: f });
    for (const f of Object.values(bgFiles))
      if (publishedAssetBlobsRef.current.get(`bg:${f.name}`) !== f.blob)
        pending.push({ kind: "bg", file: f });
    if (!pending.length) return;

    const publish = async () => {
      for (const { kind, file } of pending) {
        const key = `${kind}:${file.name}`;
        if (publishedAssetBlobsRef.current.get(key) === file.blob) continue;
        let published = false;
        let lastError: unknown;
        for (let attempt = 0; attempt < 3 && !published; attempt += 1) {
          try {
            await publishProjectAsset(cloudProjectId, kind, {
              name: file.name,
              blob: file.blob,
            });
            publishedAssetBlobsRef.current.set(key, file.blob);
            published = true;
          } catch (error) {
            lastError = error;
            if (attempt < 2)
              await new Promise((resolve) =>
                window.setTimeout(resolve, 500 * 2 ** attempt),
              );
          }
        }
        if (!published) throw lastError;
      }
    };
    const queued = assetPublishPromiseRef.current.catch(() => {}).then(publish);
    assetPublishPromiseRef.current = queued;
    let retryTimer: number | undefined;
    let cancelled = false;
    void queued.catch(() => {
      if (cancelled) return;
      retryTimer = window.setTimeout(
        () => setAssetPublishTick((tick) => tick + 1),
        1500,
      );
    });
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [cloudProjectId, liveEnabled, canEdit, audioFiles, bgFiles, assetPublishTick]);

  useEffect(() => {
    if (!cloudProjectId || !liveEnabled) return;
    const ATTEMPT_CAP = 20;
    const wanted = new Set<string>();
    const referenced = new Set<string>();
    for (const d of difficulties) {
      if (d.audioFilename) {
        referenced.add(d.audioFilename);
        if (!audioFiles[d.audioFilename]) wanted.add(d.audioFilename);
      }
      if (d.backgroundFilename) {
        referenced.add(d.backgroundFilename);
        if (!bgFiles[d.backgroundFilename]) wanted.add(d.backgroundFilename);
      }
    }
    for (const name of forcedAssetReloadsRef.current)
      if (referenced.has(name)) wanted.add(name);
    const attempts = assetAttemptsRef.current;
    for (const name of [...attempts.keys()])
      if (!wanted.has(name)) attempts.delete(name);

    const todo = [...wanted].filter((n) => (attempts.get(n) ?? 0) < ATTEMPT_CAP);
    if (!todo.length) return;

    let cancelled = false;
    let retry: number | undefined;
    void (async () => {
      for (const n of todo) attempts.set(n, (attempts.get(n) ?? 0) + 1);
      let fetched: Awaited<ReturnType<typeof loadProjectAssets>> = [];
      try {
        fetched = await loadProjectAssets(cloudProjectId, todo);
      } catch {
        fetched = [];
      }
      if (cancelled) return;
      if (fetched.length) {
        const newAudio: Record<string, LoadedFile> = {};
        const newBg: Record<string, LoadedFile> = {};
        for (const a of fetched) {
          const lf: LoadedFile = {
            name: a.name,
            url: URL.createObjectURL(a.blob),
            blob: a.blob,
          };
          if (a.kind === "audio") newAudio[a.name] = lf;
          else newBg[a.name] = lf;
          publishedAssetBlobsRef.current.set(`${a.kind}:${a.name}`, a.blob);
          forcedAssetReloadsRef.current.delete(a.name);
          attempts.delete(a.name);
        }
        if (Object.keys(newAudio).length) {
          setAudioFiles((prev) => {
            for (const [name, file] of Object.entries(newAudio)) {
              const old = prev[name];
              if (old && old.blob !== file.blob) URL.revokeObjectURL(old.url);
            }
            return { ...prev, ...newAudio };
          });
        }
        if (Object.keys(newBg).length) {
          setBgFiles((prev) => {
            for (const [name, file] of Object.entries(newBg)) {
              const old = prev[name];
              if (old && old.blob !== file.blob) URL.revokeObjectURL(old.url);
            }
            return { ...prev, ...newBg };
          });
        }
      }
      const anyRetryable = todo.some(
        (n) =>
          !fetched.some((f) => f.name === n) &&
          (attempts.get(n) ?? 0) < ATTEMPT_CAP,
      );
      if (anyRetryable && !cancelled)
        retry = window.setTimeout(() => setAssetSyncTick((t) => t + 1), 1200);
    })();
    return () => {
      cancelled = true;
      if (retry) window.clearTimeout(retry);
    };
  }, [cloudProjectId, liveEnabled, difficulties, audioFiles, bgFiles, assetSyncTick]);

  // Alt+wheel adjusts whichever volume ring was last hovered, Master by default.
  const volumeTargetRef = useRef<VolumeMeter>("master");
  const [volumeTarget, setVolumeTarget] = useState<VolumeMeter>("master");
  const selectVolumeMeter = useCallback((meter: VolumeMeter) => {
    volumeTargetRef.current = meter;
    setVolumeTarget(meter);
  }, []);
  const resetVolumeMeter = useCallback(
    () => selectVolumeMeter("master"),
    [selectVolumeMeter],
  );
  const adjustVolumeMeter = useCallback(
    (meter: VolumeMeter, deltaY: number) => {
      if (meter === "music") {
        const controller = audioCtlRef.current;
        controller.setVolume(volumeFromWheel(controller.getVolume(), deltaY));
      } else {
        const key = meter === "master" ? "masterVolume" : "hitsoundVolume";
        setAppSettings((settings) => ({
          ...settings,
          [key]: volumeFromWheel(settings[key], deltaY),
        }));
      }
      setVolumeHudKey((value) => value + 1);
    },
    [],
  );

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      if (e.altKey) {
        e.preventDefault();
        if (e.deltaY !== 0) {
          const action = appSettingsRef.current.altWheelAction;
          if (action === "timelineZoom") {
            setView((current) => {
              const scrollSpeed = timelineZoomFromWheel(current.scrollSpeed, e.deltaY);
              announceShortcut(
                osdRange(t("osd.timelineZoom"), String(scrollSpeed), scrollSpeed, MIN_SCROLL_SPEED, MAX_SCROLL_SPEED, ["Alt", t("osd.wheel")]),
              );
              return { ...current, scrollSpeed };
            });
          } else if (action === "playfieldScale") {
            setAppSettings((settings) => {
              const playfieldScale = playfieldScaleFromWheel(
                settings.playfieldScale,
                e.deltaY,
              );
              announceShortcut(
                osdRange(t("osd.playfieldSize"), `${Math.round(playfieldScale * 100)}%`, playfieldScale, MIN_PLAYFIELD_SCALE, MAX_PLAYFIELD_SCALE, ["Alt", t("osd.wheel")]),
              );
              return { ...settings, playfieldScale };
            });
          } else if (action === "volume") {
            adjustVolumeMeter(volumeTargetRef.current, e.deltaY);
          } else {
            setAppSettings((settings) => {
              const uiScale = uiScaleFromWheel(settings.uiScale, e.deltaY);
              announceShortcut(
                osdRange(t("osd.interfaceSize"), `${Math.round(uiScale * 100)}%`, uiScale, MIN_UI_SCALE, MAX_UI_SCALE, ["Alt", t("osd.wheel")]),
              );
              return { ...settings, uiScale };
            });
          }
        }
      } else if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("wheel", onWheel);
    };
  }, [adjustVolumeMeter, announceShortcut, t]);

  const activeBg = active.backgroundFilename ? bgFiles[active.backgroundFilename] ?? null : null;
  const activeVideo = active.videoFilename ? videoFiles[active.videoFilename] ?? null : null;

  const activeTimingPoints =
    active.timingPoints?.length ? active.timingPoints : timingPoints;
  const toggleSkillsetGraphCollapsed = useCallback(
    () =>
      setAppSettings((s) => ({
        ...s,
        skillsetGraphCollapsed: !s.skillsetGraphCollapsed,
      })),
    [],
  );
  const skillsetTimeline = useSkillsetTimeline(
    active.notes,
    active.keyCount,
    appSettings.showSkillsetGraph,
  );

  const [autoTimeOpen, setAutoTimeOpen] = useState(false);
  const [autoTimeStatus, setAutoTimeStatus] = useState<AutoTimeStatus>("idle");
  const [autoTimeResult, setAutoTimeResult] = useState<BpmDetection | null>(
    null,
  );

  const playtestSettings = appSettings.playtest;
  const playtestSettingsRef = useRef(playtestSettings);
  playtestSettingsRef.current = playtestSettings;

  // Playtest can draw with a different skin than the editor. It is imported
  // as soon as it is picked, so starting a run never waits on it; until it is
  // ready, or if it has gone missing, the editor's skin stands in.
  const [playtestSkin, setPlaytestSkin] = useState<LoadedSkin | null>(null);
  const playtestSkinChoice = playtestSettings.skin;
  const playtestSkinSource = playtestSkinChoice?.source ?? null;
  const playtestSkinFile =
    playtestSkinChoice && playtestSkinChoice.source !== "none"
      ? playtestSkinChoice.fileName
      : null;
  const skinLibraryRef = useRef(skinLibrary);
  skinLibraryRef.current = skinLibrary;
  const playtestSavedSkin =
    playtestSkinSource === "saved"
      ? skinLibrary.find((saved) => saved.name === playtestSkinFile)
      : undefined;
  // Reloading the library hands back fresh blobs; only a re-import of this
  // skin should load it again.
  const playtestSavedStamp = playtestSavedSkin
    ? (playtestSavedSkin.savedAt ?? 0)
    : null;
  const playtestReusesEditorSkin =
    playtestSkinFile !== null && skin?.fileName === playtestSkinFile;
  useEffect(() => {
    const replace = (next: LoadedSkin | null) =>
      setPlaytestSkin((prev) => {
        if (prev && prev !== next) prev.objectUrls.forEach(URL.revokeObjectURL);
        return next;
      });
    if (!playtestSkinFile || playtestReusesEditorSkin) {
      replace(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      let blob: Blob | null = null;
      if (playtestSkinSource === "preset") {
        const preset = PRESET_SKINS.find((p) => p.fileName === playtestSkinFile);
        if (preset) {
          blob = await fetch(preset.url)
            .then((res) => (res.ok ? res.blob() : null))
            .catch(() => null);
        }
      } else {
        blob =
          skinLibraryRef.current.find((saved) => saved.name === playtestSkinFile)
            ?.blob ?? null;
      }
      const { importOsk } = await import("./lib/skinImport");
      const loaded = blob
        ? await importOsk(blob, playtestSkinFile).catch(() => null)
        : null;
      if (cancelled) {
        loaded?.objectUrls.forEach(URL.revokeObjectURL);
        return;
      }
      replace(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    playtestSkinFile,
    playtestSkinSource,
    playtestSavedStamp,
    playtestReusesEditorSkin,
  ]);

  const playtestLook =
    playtest.active && playtestSkinChoice
      ? playtestSkinChoice.source === "none"
        ? null
        : (playtestSkin ?? skin)
      : skin;
  const activeSkin = playtestLook?.keymodes[active.keyCount] ?? null;
  const playtestRate = clampPlaytestRate(playtestSettings.rate);
  const playtestWindows = useMemo(
    () => maniaJudgementWindows(active.overallDifficulty, playtestRate),
    [active.overallDifficulty, playtestRate],
  );
  const playtestReleaseWindows = useMemo(
    () => maniaReleaseWindows(active.overallDifficulty, playtestRate),
    [active.overallDifficulty, playtestRate],
  );
  const playtestWindowsRef = useRef(playtestWindows);
  playtestWindowsRef.current = playtestWindows;
  const playtestTiming = useMemo<PlaytestTiming>(
    () => ({
      rate: playtestRate,
      audioOffsetMs: playtestSettings.audioOffsetMs,
      inputOffsetMs: playtestSettings.inputOffsetMs,
    }),
    [playtestRate, playtestSettings.audioOffsetMs, playtestSettings.inputOffsetMs],
  );
  const playtestTimingRef = useRef(playtestTiming);
  playtestTimingRef.current = playtestTiming;

  const ensurePlaytestNoteIndex = useCallback(
    (notes: ManiaNote[], keyCount: number): PlaytestNoteIndex => {
      const existing = playtestNoteIndexRef.current;
      if (existing && existing.source === notes && existing.keyCount === keyCount) {
        return existing;
      }
      const next = buildPlaytestNoteIndex(notes, keyCount);
      playtestNoteIndexRef.current = next;
      return next;
    },
    [],
  );

  /** The music's time, or the count-in's while a run starts before zero. */
  const playtestAudioTime = useCallback(
    (now = performance.now()) => {
      const preRoll = playtestPreRollRef.current;
      if (preRoll) {
        const at = preRoll.pausedAt ?? now;
        const time =
          preRoll.from + (at - preRoll.startedAt) * playtestTimingRef.current.rate;
        if (time < 0) return time;
      }
      return getCurrentTime();
    },
    [getCurrentTime],
  );

  /** The time the playfield shows, which is also where misses are judged. */
  const playtestGameplayTime = useCallback(
    () => gameplayTime(playtestAudioTime(), playtestTimingRef.current),
    [playtestAudioTime],
  );

  /** The time a key press or release with this event stamp lands on. */
  const playtestInputTime = useCallback(
    (stamp?: number) => {
      const now = performance.now();
      return inputTime(playtestAudioTime(now), now, stamp, playtestTimingRef.current);
    },
    [playtestAudioTime],
  );

  const clearPlaytestPreRoll = useCallback(() => {
    const preRoll = playtestPreRollRef.current;
    if (preRoll?.timer) window.clearTimeout(preRoll.timer);
    playtestPreRollRef.current = null;
  }, []);

  /** Starts the song once the count-in before zero has run out. */
  const armPlaytestPreRoll = useCallback(() => {
    const preRoll = playtestPreRollRef.current;
    if (!preRoll) return;
    if (preRoll.timer) window.clearTimeout(preRoll.timer);
    const remaining =
      -preRoll.from / playtestTimingRef.current.rate -
      (performance.now() - preRoll.startedAt);
    preRoll.timer = window.setTimeout(() => {
      preRoll.timer = 0;
      playAudio();
    }, Math.max(0, remaining));
  }, [playAudio]);

  const playtestNoteById = useMemo(
    () => new Map(active.notes.map((note) => [note.id, note])),
    [active.notes],
  );

  const resetPlaytestRuntime = useCallback(
    (startTime: number) => {
      playtestEngineRef.current = createPlaytestEngine({
        notes: active.notes,
        keyCount: active.keyCount,
        windows: playtestWindowsRef.current,
        startTime,
      });
      playtestEngineNotesRef.current = active.notes;
      playtestScore.reset(startTime);
      playtestEndArmedRef.current = false;
    },
    [active.keyCount, active.notes, playtestScore],
  );

  const handlePlaytestPress = useCallback(
    (column: number, atMs?: number, targetId?: string, stamp?: number) => {
      const pt = playtestRef.current;
      const engine = playtestEngineRef.current;
      if (!engine || !pt.active || pt.ended || pt.paused || pt.countdownEndsAt !== null) {
        return;
      }
      const time = atMs ?? playtestInputTime(stamp);
      const events = engine.press(column, time, targetId);
      playtestScore.apply(events);
      // osu!mania sounds every key press: the note it hit, or else the
      // nearest note in that column.
      const hit = events[0]?.kind === "judgement" ? events[0].result.noteId : null;
      const note = hit
        ? playtestNoteById.get(hit)
        : nearestPlayableNote(
            ensurePlaytestNoteIndex(active.notes, active.keyCount).byColumn[column] ?? [],
            time,
            Infinity,
            () => false,
          );
      if (note) playtestHitsound(note);
    },
    [
      active.keyCount,
      active.notes,
      ensurePlaytestNoteIndex,
      playtestHitsound,
      playtestInputTime,
      playtestNoteById,
      playtestScore,
    ],
  );

  const handlePlaytestRelease = useCallback(
    (column: number, atMs?: number, targetId?: string, stamp?: number) => {
      const pt = playtestRef.current;
      const engine = playtestEngineRef.current;
      if (!engine || !pt.active || pt.ended || pt.paused || pt.countdownEndsAt !== null) {
        return;
      }
      playtestScore.apply(
        engine.release(column, atMs ?? playtestInputTime(stamp), targetId),
      );
    },
    [playtestInputTime, playtestScore],
  );

  const exitPlaytest = useCallback(() => {
    clearPlaytestPreRoll();
    pauseAudio();
    setPlaytest((prev) => ({
      ...prev,
      active: false,
      ended: false,
      paused: false,
      countdownEndsAt: null,
      resuming: false,
    }));
    playtestEngineRef.current = null;
    playtestEngineNotesRef.current = null;
  }, [clearPlaytestPreRoll, pauseAudio]);

  // Starts a run at `startTime` like osu!'s editor test play: notes before it
  // are left out, and play goes on from there. The music starts right away,
  // backed up when needed so the first note has the lead-in, and before the
  // song's start the run counts in over silence.
  const startPlaytest = useCallback(
    (startTime = getCurrentTime()) => {
      if (!audioFile || !projectStarted) return;
      const clamped = Math.max(0, Math.min(startTime, audio.duration || startTime));
      setModal(null);
      setCommentsOpen(false);
      void logAnalyticsEvent("playtest_started", authUserRef.current?.id).catch(
        () => {},
      );
      clearPlaytestPreRoll();
      pauseAudio();
      const rate = clampPlaytestRate(playtestSettingsRef.current.rate);
      setAudioPlaybackRate(rate, 0);
      const index = ensurePlaytestNoteIndex(active.notes, active.keyCount);
      const first = index.sorted[firstNoteAtOrAfter(index.sorted, clamped)];
      const from = runStartTime(clamped, first?.startTime ?? null, rate);
      resetPlaytestRuntime(clamped);
      setPlaytest((prev) => ({
        ...initialPlaytestState(),
        active: true,
        startTime: clamped,
        autoplay: prev.autoplay,
        runKey: prev.runKey + 1,
      }));
      if (from >= 0) {
        seekAudio(from);
        playAudio();
      } else {
        seekAudio(0);
        playtestPreRollRef.current = {
          from,
          startedAt: performance.now(),
          pausedAt: null,
          timer: 0,
        };
        armPlaytestPreRoll();
      }
    },
    [
      active.keyCount,
      active.notes,
      armPlaytestPreRoll,
      audio.duration,
      audioFile,
      clearPlaytestPreRoll,
      ensurePlaytestNoteIndex,
      getCurrentTime,
      pauseAudio,
      playAudio,
      projectStarted,
      resetPlaytestRuntime,
      seekAudio,
      setAudioPlaybackRate,
    ],
  );

  const restartPlaytest = useCallback(() => {
    startPlaytest(playtestRef.current.startTime ?? 0);
  }, [startPlaytest]);

  // Resuming counts down (osu!mania's DelayedResumeOverlay) and then plays on.
  useEffect(() => {
    const countdownEndsAt = playtest.countdownEndsAt;
    if (!playtest.active || playtest.ended || countdownEndsAt === null) return;
    const start = () => {
      const current = playtestRef.current;
      if (!current.active || current.countdownEndsAt !== countdownEndsAt) return;
      setPlaytest((prev) =>
        prev.active && prev.countdownEndsAt === countdownEndsAt
          ? { ...prev, countdownEndsAt: null, resuming: false }
          : prev,
      );
      // The rate may have been changed from the pause menu.
      setAudioPlaybackRate(playtestTimingRef.current.rate, 0);
      const preRoll = playtestPreRollRef.current;
      if (preRoll && preRoll.pausedAt !== null) {
        preRoll.startedAt += performance.now() - preRoll.pausedAt;
        preRoll.pausedAt = null;
        if (playtestAudioTime() < 0) {
          armPlaytestPreRoll();
          return;
        }
      }
      playAudio();
    };
    const remaining = countdownEndsAt - performance.now();
    if (remaining <= 0) {
      start();
      return;
    }
    const timer = window.setTimeout(start, remaining);
    return () => window.clearTimeout(timer);
  }, [
    armPlaytestPreRoll,
    playAudio,
    playtest.active,
    playtest.countdownEndsAt,
    playtest.ended,
    playtestAudioTime,
    setAudioPlaybackRate,
  ]);

  const pausePlaytest = useCallback(() => {
    const preRoll = playtestPreRollRef.current;
    if (preRoll && preRoll.pausedAt === null) {
      if (preRoll.timer) window.clearTimeout(preRoll.timer);
      preRoll.timer = 0;
      preRoll.pausedAt = performance.now();
    }
    setPlaytest((prev) =>
      prev.active && !prev.ended && !prev.paused
        ? { ...prev, paused: true }
        : prev,
    );
    pauseAudio();
  }, [pauseAudio]);

  const resumePlaytest = useCallback(() => {
    setPlaytest((prev) =>
      prev.active && !prev.ended && prev.paused
        ? {
            ...prev,
            paused: false,
            resuming: true,
            countdownEndsAt: performance.now() + PLAYTEST_RESUME_COUNTDOWN_MS,
          }
        : prev,
    );
  }, []);

  const togglePlaytestPause = useCallback(() => {
    const pt = playtestRef.current;
    if (!pt.active || pt.ended) return;
    if (pt.paused) resumePlaytest();
    else pausePlaytest();
  }, [pausePlaytest, resumePlaytest]);

  const toggleAutoplay = useCallback(() => {
    setPlaytest((prev) =>
      prev.active && !prev.ended ? { ...prev, autoplay: !prev.autoplay } : prev,
    );
  }, []);

  const handleHumanPress = useCallback(
    (column: number, stamp: number) => {
      if (playtestRef.current.autoplay) return;
      handlePlaytestPress(column, undefined, undefined, stamp);
    },
    [handlePlaytestPress],
  );

  const handleHumanRelease = useCallback(
    (column: number, stamp: number) => {
      if (playtestRef.current.autoplay) return;
      handlePlaytestRelease(column, undefined, undefined, stamp);
    },
    [handlePlaytestRelease],
  );

  // In-game scroll speed, on osu!'s keys.
  const adjustPlaytestScrollSpeed = useCallback(
    (direction: 1 | -1) => {
      setAppSettings((s) => {
        const scrollSpeed = Math.round(
          Math.min(
            MAX_PLAYTEST_SCROLL_SPEED,
            Math.max(MIN_PLAYTEST_SCROLL_SPEED, s.playtest.scrollSpeed + direction),
          ),
        );
        announceShortcut(
          osdRange(
            t("osd.scrollSpeed"),
            String(scrollSpeed),
            scrollSpeed,
            MIN_PLAYTEST_SCROLL_SPEED,
            MAX_PLAYTEST_SCROLL_SPEED,
            [
              editorKeyLabel(editorKeybindsRef.current.zoomOut),
              editorKeyLabel(editorKeybindsRef.current.zoomIn),
            ],
          ),
        );
        return { ...s, playtest: { ...s.playtest, scrollSpeed } };
      });
    },
    [announceShortcut, t],
  );

  const playtestSpeedKeys = useMemo(
    () => normalizeEditorKeybinds(appSettings.editorKeybinds),
    [appSettings.editorKeybinds],
  );
  const { heldKeys: heldPlaytestKeys, pressedColumnsRef: playtestPressedColumnsRef } =
    usePlaytestInput({
      active: playtest.active && playtest.countdownEndsAt === null,
      paused: playtest.paused,
      keyCount: active.keyCount,
      keybinds: playtestSettings.keybinds,
      quickRestartCode: playtestSettings.quickRestartKey,
      scrollSpeedDownCode: playtestSpeedKeys.zoomOut,
      scrollSpeedUpCode: playtestSpeedKeys.zoomIn,
      onPress: handleHumanPress,
      onRelease: handleHumanRelease,
      onPause: togglePlaytestPause,
      onRestart: restartPlaytest,
      onToggleAutoplay: toggleAutoplay,
      onScrollSpeed: adjustPlaytestScrollSpeed,
    });

  const playtestRunNotes = useMemo(() => {
    if (!playtest.active) return active.notes;
    return active.notes.filter((note) => note.startTime >= playtest.startTime);
  }, [active.notes, playtest.active, playtest.startTime]);

  const { summary: autoplaySummary, profile: skillProfile } = usePlaytestAutoplay({
    enabled: playtest.autoplay,
    active: playtest.active && playtest.countdownEndsAt === null,
    paused: playtest.paused,
    ended: playtest.ended,
    notes: playtestRunNotes,
    keyCount: active.keyCount,
    humanize: playtestSettings.humanize,
    skill: playtestSettings.skill,
    windows: playtestWindows,
    releaseWindows: playtestReleaseWindows,
    rate: playtestRate,
    getCurrentTime: playtestInputTime,
    onPress: handlePlaytestPress,
    onRelease: handlePlaytestRelease,
    runKey: playtest.runKey,
  });

  const playtestTickRef = useRef({
    audio,
    active,
    playtestInputTime,
    playtestScore,
  });
  playtestTickRef.current = {
    audio,
    active,
    playtestInputTime,
    playtestScore,
  };

  // Once a frame while running: misses for whatever time has passed, and the
  // end of the song.
  useEffect(() => {
    if (
      !playtest.active ||
      playtest.ended ||
      playtest.paused ||
      playtest.countdownEndsAt !== null
    )
      return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { audio, active, playtestInputTime, playtestScore } = playtestTickRef.current;
      const time = playtestInputTime();
      if (playtestEngineNotesRef.current !== active.notes) {
        // The map changed under the run (a collaborator's edit): judge the new
        // notes from here on.
        playtestEngineRef.current = createPlaytestEngine({
          notes: active.notes,
          keyCount: active.keyCount,
          windows: playtestWindowsRef.current,
          startTime: time,
        });
        playtestEngineNotesRef.current = active.notes;
      }
      const engine = playtestEngineRef.current;
      if (engine) playtestScore.apply(engine.update(time));
      if (playtestPreRollRef.current && time < 0) return;
      const now = audio.getCurrentTime();
      if (!playtestEndArmedRef.current) {
        const runStart = playtestRef.current.startTime ?? 0;
        if (now <= runStart + 1000) playtestEndArmedRef.current = true;
      }
      if (
        playtestEndArmedRef.current &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0 &&
        now >= audio.duration - 10
      ) {
        audio.pause();
        setPlaytest((prev) => ({ ...prev, ended: true }));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    playtest.active,
    playtest.countdownEndsAt,
    playtest.ended,
    playtest.paused,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesBind(e.code, editorKeybindsRef.current.playtestToggle))
        return;
      e.preventDefault();
      if (playtestRef.current.active) exitPlaytest();
      else if (!modalRef.current && featureFlagsRef.current.playtest)
        startPlaytest(getCurrentTime());
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [exitPlaytest, getCurrentTime, startPlaytest]);

  const eligibleRefs = useMemo(() => {
    const resolve = (d: Difficulty): string | null => {
      if (d.audioFilename && audioFiles[d.audioFilename]) return d.audioFilename;
      const names = Object.keys(audioFiles);
      return names.length === 1 ? names[0] : null;
    };
    const act = difficulties.find((d) => d.id === activeId) ?? difficulties[0];
    const activeAudio = act ? resolve(act) : null;
    if (!act || !activeAudio) return [];
    return difficulties
      .filter((d) => d.id !== act.id && resolve(d) === activeAudio)
      .map((d) => ({ d, star: computeStarRating(d.notes, d.keyCount) }))
      .sort((a, b) => a.star - b.star)
      .map((x) => x.d);
  }, [difficulties, activeId, audioFiles]);
  const referenceDiff =
    !playtest.active && referenceId && referenceId !== active.id
      ? (eligibleRefs.find((d) => d.id === referenceId) ?? null)
      : null;
  const referenceTimingPoints =
    referenceDiff && referenceDiff.timingPoints?.length
      ? referenceDiff.timingPoints
      : timingPoints;
  const referenceSkin = referenceDiff
    ? (skin?.keymodes[referenceDiff.keyCount] ?? null)
    : null;
  const totalNotes = difficulties.reduce((s, d) => s + d.notes.length, 0);
  const hasProject = projectStarted;
  const previousProjectRef = useRef(hasProject);
  const [sceneEntering, setSceneEntering] = useState(false);
  useLayoutEffect(() => {
    const wasOpen = previousProjectRef.current;
    previousProjectRef.current = hasProject;
    if (wasOpen || !hasProject) return;
    setSceneEntering(true);
    const timer = window.setTimeout(() => setSceneEntering(false), 560);
    return () => window.clearTimeout(timer);
  }, [hasProject]);
  const firstDifficulty = difficulties[0];
  const firstDifficultyTiming = firstDifficulty?.timingPoints[0];
  const hasDefaultDifficulty =
    difficulties.length === 1 &&
    firstDifficulty?.name === "Normal" &&
    firstDifficulty?.keyCount === 4 &&
    firstDifficulty?.hpDrainRate === 7 &&
    firstDifficulty?.overallDifficulty === 7 &&
    firstDifficulty?.previewTime === -1 &&
    firstDifficulty?.notes.length === 0 &&
    !firstDifficulty?.audioFilename &&
    !firstDifficulty?.backgroundFilename &&
    firstDifficulty?.timingPoints.length === 1 &&
    firstDifficultyTiming?.time === 0 &&
    firstDifficultyTiming?.uninherited === true &&
    firstDifficultyTiming?.bpm === 120;
  const hasProjectContent =
    Object.keys(audioFiles).length > 0 ||
    Object.keys(bgFiles).length > 0 ||
    Object.keys(videoFiles).length > 0 ||
    totalNotes > 0 ||
    meta.title !== DEFAULT_SONG_META.title ||
    meta.artist !== DEFAULT_SONG_META.artist ||
    meta.creator !== DEFAULT_SONG_META.creator ||
    Boolean(meta.titleUnicode) ||
    Boolean(meta.artistUnicode) ||
    Boolean(meta.source) ||
    Boolean(meta.tags) ||
    timingPoints.length !== 1 ||
    timingPoints[0]?.bpm !== 120 ||
    !hasDefaultDifficulty;
  const showChrome = hasProject && !zenMode && !playtest.active;
  const diffPanelOpen = appSettings.difficultyPanelOpen !== false;
  const diffPanelShown = showChrome && diffPanelOpen;
  const showChromeRef = useRef(showChrome);
  showChromeRef.current = showChrome;
  // During a run the playfield draws on the gameplay clock, the same one the
  // judge uses, so a note is on the line exactly when it is on time.
  const playtestActive = playtest.active;
  const getEditorCurrentTime = useCallback(
    () => (playtestActive ? playtestGameplayTime() : getCurrentTime()),
    [getCurrentTime, playtestActive, playtestGameplayTime],
  );
  const getEditorVisualCurrentTime = useCallback(
    (frameNow?: number) =>
      playtestActive ? playtestGameplayTime() : getVisualCurrentTime(frameNow),
    [getVisualCurrentTime, playtestActive, playtestGameplayTime],
  );
  // Scroll speed is how fast notes move in real time, so a faster rate does
  // not make them race (osu! multiplies its time range by the rate).
  const editorView = useMemo(
    () =>
      playtest.active
        ? { ...view, scrollSpeed: playtestSettings.scrollSpeed / playtestRate }
        : view,
    [playtest.active, playtestRate, playtestSettings.scrollSpeed, view],
  );
  const editorDimBackground = playtest.active
    ? playtestSettings.backgroundDim
    : appSettings.dimBackground;
  const editorPlayfieldScale = playtest.active
    ? playtestSettings.zoom
    : appSettings.playfieldScale;

  const onAudioFile = useCallback(
    (file: File) => {
      setProjectStarted(true);
      void loadFile(file).then((loaded) => {
        setAudioFiles((prev) => {
          const existing = prev[loaded.name];
          if (existing) URL.revokeObjectURL(existing.url);
          return { ...prev, [loaded.name]: loaded };
        });
        markStructural();
        announceAssetChange("changed the audio");
        setDifficulties((prev) =>
          prev.map((d) =>
            d.id === activeId || !d.audioFilename
              ? { ...d, audioFilename: loaded.name }
              : d,
          ),
        );
      });
    },
    [activeId, markStructural, announceAssetChange],
  );

  const onBackgroundFile = useCallback((file: File) => {
    setProjectStarted(true);
    void loadFile(file).then((loaded) => {
      setBgFiles((prev) => {
        if (prev[loaded.name]) URL.revokeObjectURL(prev[loaded.name].url);
        return { ...prev, [loaded.name]: loaded };
      });
      setPendingBgName(loaded.name);
      setAskBgScope(true);
    });
  }, []);

  const onVideoFile = useCallback((file: File) => {
    setProjectStarted(true);
    void loadFile(file).then((loaded) => {
      setVideoFiles((prev) => {
        if (prev[loaded.name]) URL.revokeObjectURL(prev[loaded.name].url);
        return { ...prev, [loaded.name]: loaded };
      });
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => ({ ...d, videoFilename: loaded.name })),
      );
    });
  }, [markStructural]);

  const onClearVideo = useCallback(() => {
    const videoName = active.videoFilename;
    if (!videoName) return;
    markStructural();
    setDifficulties((prev) =>
      prev.map((d) =>
        d.videoFilename === videoName
          ? { ...d, videoFilename: undefined, videoOffsetMs: undefined }
          : d,
      ),
    );
    setVideoFiles((prev) => {
      const next = { ...prev };
      if (next[videoName]) URL.revokeObjectURL(next[videoName].url);
      delete next[videoName];
      return next;
    });
  }, [active.videoFilename, markStructural]);

  const onVideoOffsetMs = useCallback((ms: number) => {
    const videoName = active.videoFilename;
    if (!videoName) return;
    markStructural();
    setDifficulties((prev) =>
      prev.map((d) =>
        d.videoFilename === videoName
          ? { ...d, videoOffsetMs: ms || undefined }
          : d,
      ),
    );
  }, [active.videoFilename, markStructural]);

  const onClearBackground = useCallback(() => {
    const bgName = active.backgroundFilename;
    if (!bgName) return;
    markStructural();
    announceAssetChange("removed the background");
    setDifficulties((prev) => {
      const updated = prev.map((d) =>
        (bgScope === "mapset" || d.id === activeId) && d.backgroundFilename === bgName
          ? { ...d, backgroundFilename: undefined }
          : d,
      );
      if (!updated.some((d) => d.backgroundFilename === bgName)) {
        setBgFiles((prev2) => {
          const next = { ...prev2 };
          if (next[bgName]) URL.revokeObjectURL(next[bgName].url);
          delete next[bgName];
          return next;
        });
      }
      return updated;
    });
  }, [
    active.backgroundFilename,
    activeId,
    bgScope,
    markStructural,
    announceAssetChange,
  ]);

  const refreshSkinLibrary = useCallback(async () => {
    const saved = await loadSkinLibrary().catch(() => []);
    setSkinLibrary(saved);
  }, []);

  const applyLoadedSkin = useCallback(
    (loaded: LoadedSkin, target: "visual" | "hitsound") => {
      void logAnalyticsEvent("skin_imported", authUserRef.current?.id).catch(
        () => {},
      );
      if (target === "hitsound") {
        setHitsoundSkin((prev) => {
          if (prev && prev !== skin) prev.objectUrls.forEach(URL.revokeObjectURL);
          return loaded;
        });
        setHitsoundSkinSource("selected");
      } else {
        setSkin((prev) => {
          if (prev && prev !== hitsoundSkin) {
            prev.objectUrls.forEach(URL.revokeObjectURL);
          }
          return loaded;
        });
      }
    },
    [hitsoundSkin, skin],
  );

  const loadSkin = useCallback(
    async (
      blob: Blob,
      fileName: string,
      target: "visual" | "hitsound",
      saveToLibrary: boolean,
    ) => {
      setSkinError(null);
      try {
        const snapshot = await snapshotBlob(blob);
        const { importOsk } = await import("./lib/skinImport");
        const loaded = await importOsk(snapshot, fileName);
        applyLoadedSkin(loaded, target);
        if (saveToLibrary) {
          await saveSkinToLibrary({ name: fileName, blob: snapshot });
          await refreshSkinLibrary();
        }
      } catch (err) {
        setSkinError(
          err instanceof Error ? err.message : "Failed to load skin (.osk).",
        );
      }
    },
    [applyLoadedSkin, refreshSkinLibrary],
  );

  const onSkinFile = useCallback(
    (file: File, target: "visual" | "hitsound") => {
      void loadSkin(file, file.name, target, true);
    },
    [loadSkin],
  );

  const onApplyLocalSkin = useCallback(
    (saved: SavedSkinBlob, target: "visual" | "hitsound") => {
      void loadSkin(saved.blob, saved.name, target, false);
    },
    [loadSkin],
  );

  const onApplyPresetSkin = useCallback(
    async (url: string, fileName: string, target: "visual" | "hitsound") => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(t("app.presetSkinFailed"));
        await loadSkin(await res.blob(), fileName, target, false);
      } catch (err) {
        setSkinError(
          err instanceof Error ? err.message : "Couldn't load that preset skin.",
        );
      }
    },
    [loadSkin, t],
  );

  const onUploadCloudSkin = useCallback(
    async (slot: 1 | 2, file: File) => {
      setSkinError(null);
      try {
        await uploadCloudSkin(slot, file);
        await refreshCloudSkins();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Couldn't upload that skin.";
        setSkinError(message);
        throw error;
      }
    },
    [refreshCloudSkins],
  );

  const onDownloadCloudSkin = useCallback(
    async (cloudSkin: CloudSkin) => {
      setSkinError(null);
      try {
        const blob = await downloadCloudSkin(cloudSkin.slot);
        await loadSkin(blob, cloudSkin.filename, "visual", true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Couldn't download that skin.";
        setSkinError(message);
        throw error;
      }
    },
    [loadSkin],
  );

  const onDeleteCloudSkin = useCallback(
    async (cloudSkin: CloudSkin) => {
      setSkinError(null);
      try {
        await removeCloudSkin(cloudSkin.slot);
        await refreshCloudSkins();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Couldn't remove that skin.";
        setSkinError(message);
        throw error;
      }
    },
    [refreshCloudSkins],
  );

  // The picture itself is only fetched once it is going to be shown, so an
  // account that stays on song art never pays for the download. Keyed by the
  // checksum so replacing the picture swaps the object URL.
  const menuBackgroundKey =
    appSettings.menuBackgroundMode === "custom" && menuBackground
      ? menuBackground.sha256
      : null;
  useEffect(() => {
    if (!menuBackgroundKey) {
      setMenuBackgroundUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    downloadCloudMenuBackground()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setMenuBackgroundUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setMenuBackgroundUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [menuBackgroundKey]);

  const onUploadMenuBackground = useCallback(async (file: File) => {
    setMenuBackgroundError(null);
    setMenuBackgroundBusy(true);
    try {
      setMenuBackground(await uploadCloudMenuBackground(file));
      // Uploading one is a clear request to see it.
      setAppSettings((s) => ({ ...s, menuBackgroundMode: "custom" }));
    } catch (error) {
      setMenuBackgroundError(
        error instanceof Error ? error.message : "Couldn't upload that image.",
      );
    } finally {
      setMenuBackgroundBusy(false);
    }
  }, []);

  const onRemoveMenuBackground = useCallback(async () => {
    setMenuBackgroundError(null);
    setMenuBackgroundBusy(true);
    try {
      await removeCloudMenuBackground();
      setMenuBackground(null);
      setAppSettings((s) =>
        s.menuBackgroundMode === "custom"
          ? { ...s, menuBackgroundMode: "song" }
          : s,
      );
    } catch (error) {
      setMenuBackgroundError(
        error instanceof Error ? error.message : "Couldn't remove that image.",
      );
    } finally {
      setMenuBackgroundBusy(false);
    }
  }, []);

  const onClearSkin = useCallback(() => {
    setSkinError(null);
    setSkin((prev) => {
      if (prev) prev.objectUrls.forEach(URL.revokeObjectURL);
      return null;
    });
  }, []);

  const onUseDefaultHitsounds = useCallback(() => {
    setSkinError(null);
    setHitsoundSkinSource("default");
  }, []);

  const onUseVisualHitsounds = useCallback(() => {
    setSkinError(null);
    setHitsoundSkinSource("visual");
  }, []);

  const [sharedSlug, setSharedSlug] = useState<string | null>(() =>
    typeof location === "undefined" ? null : slugFromPath(location.pathname),
  );

  // Phones never open the radial start menu, so without the phone clause the
  // header — and with it sign-in, the account menu and the admin panel —
  // would be unreachable on mobile. The shared-map page draws its own
  // Cascade header, so the floating one would collide with it there.
  // A playtest run shows only the playfield and its HUD, as a game would;
  // Esc opens the pause menu for everything else.
  const showHeader =
    !zenMode &&
    !playtest.active &&
    (hasProject || menuOpen || (phoneViewport && !sharedSlug));

  const importMapFile = useCallback(async (
    file: File,
    preferredBeatmapId?: number,
    // Set when the archive arrived from a download that already used part of
    // the bar, so unzipping continues rather than restarting at zero.
    onProgress: ProgressFn = setImportProgress,
  ) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    onProgress({ ratio: 0, label: t("app.readingArchive") });
    try {
      const map = await importOsz(file, onProgress);
      setPublicMapUrl(null);
      setCloudProjectId(null);
      setCloudOwnerId(null);
      setMyRole(null);
      setReferenceId(null);
      setProjectStarted(true);
      setAudioFiles((prev) => {
        Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
        return map.audioFiles;
      });
      setBgFiles((prev) => {
        Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
        return map.backgroundFiles;
      });
      setVideoFiles((prev) => {
        Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
        return map.videoFiles;
      });
      setMeta(map.meta);
      setTimingPoints(
        map.timingPoints.length
          ? normalizeTimingPoints(map.timingPoints)
          : defaultTimingPoints(),
      );
      const diffs = (map.difficulties.length
        ? map.difficulties
        : [makeDifficulty()]
      ).map((d) => ({ ...d, timingPoints: normalizeTimingPoints(d.timingPoints) }));
      setDifficulties(diffs);
      const preferred = preferredBeatmapId
        ? diffs.find((d) => d.beatmapId === preferredBeatmapId)
        : undefined;
      setActiveId((preferred ?? diffs[0]).id);
      setPendingImport(null);
      setModal(null);
      setLocalProjectId(newLocalProjectId());
      void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
        () => {},
      );
      void logAnalyticsEvent("import_osz", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : t("app.importOszFailed"),
      );
    } finally {
      setImportingMap(false);
      setImportProgress(null);
    }
  }, [t]);

  const [publicMapUrl, setPublicMapUrl] = useState<string | null>(null);

  useEffect(() => {
    setPublicMapUrl(null);
  }, [cloudProjectId]);

  useEffect(() => {
    if (modal !== "share" || !cloudProjectId) return;
    let cancelled = false;
    findSharedMapForProject(cloudProjectId)
      .then((slug) => {
        if (!cancelled && slug) setPublicMapUrl(sharedMapUrl(slug));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modal, cloudProjectId]);

  const publishCurrentMap = useCallback(async (): Promise<string> => {
    const owner = authUserRef.current;
    if (!owner) throw new Error(t("app.publishSignIn"));
    const projectId = cloudProjectIdRef.current;
    if (!projectId) {
      throw new Error(t("app.publishSaveFirst"));
    }
    const data = {
      meta: metaRef.current,
      timingPoints: timingPointsRef.current,
      difficulties: difficultiesRef.current,
    };
    const referencedAudioNames = new Set(
      data.difficulties.flatMap((difficulty) =>
        difficulty.audioFilename ? [difficulty.audioFilename] : [],
      ),
    );
    const missingAudioName = [...referencedAudioNames].find(
      (name) => !audioFilesRef.current[name],
    );
    if (missingAudioName) {
      throw new Error(t("app.publishMissingAudio", { name: missingAudioName }));
    }
    let sharedAudioFiles = [...referencedAudioNames].flatMap((name) => {
      const file = audioFilesRef.current[name];
      return file ? [{ name: file.name, blob: file.blob }] : [];
    });
    if (!sharedAudioFiles.length) {
      const available = Object.values(audioFilesRef.current);
      if (available.length === 1) {
        sharedAudioFiles = [{ name: available[0].name, blob: available[0].blob }];
      }
    }
    const bgName = data.difficulties.find((d) => d.backgroundFilename)
      ?.backgroundFilename;
    const bgFile = bgName ? bgFilesRef.current[bgName] : null;

    const summary = summariseSharedMap(data);
    const card = await renderShareCard({
      title: data.meta.title,
      artist: data.meta.artist,
      creator: data.meta.creator,
      keyCounts: summary.keyCounts,
      starRating: summary.starRating,
      lengthMs: summary.lengthMs,
      bpm: summary.bpm,
      noteCount: summary.noteCount,
      backgroundUrl: bgFile?.url ?? null,
    }).catch(() => null);

    const previewDifficulty = data.difficulties.find((d) => d.notes.length);
    const slug = await publishSharedMap({
      ownerId: owner.id,
      projectId,
      data,
      audioFiles: sharedAudioFiles,
      previewAudioName: previewDifficulty?.audioFilename ?? null,
      background: bgFile ? { name: bgFile.name, blob: bgFile.blob } : null,
      card,
      previewStartMs: previewStartMs(
        previewDifficulty?.notes ?? [],
        previewDifficulty?.previewTime ?? -1,
      ) * (previewDifficulty?.audioRate ?? 1),
    });
    const url = sharedMapUrl(slug);
    setPublicMapUrl(url);
    return url;
  }, [t]);

  const openSharedMap = useCallback(
    (file: File) => {
      setSharedSlug(null);
      if (typeof history !== "undefined") {
        history.replaceState(null, "", "/");
      }
      void importMapFile(file);
    },
    [importMapFile],
  );

  const requestImportMap = useCallback(
    (file: File) => {
      if (hasProjectContent) {
        setPendingImport(file);
      } else {
        void importMapFile(file);
      }
    },
    [hasProjectContent, importMapFile],
  );

  const importArchive = useCallback(
    async (file: File) => {
      if (/\.zip$/i.test(file.name)) {
        setImportingMap(true);
        try {
          const { scanPackFromZip } = await import("./lib/smPackImport");
          const songs = await scanPackFromZip(file);
          if (songs.length > 0) {
            setScannedPackSongs(songs);
            setImportingMap(false);
            setModal("packBrowser");
            return;
          }
        } catch (error) {
          setImportingMap(false);
          setImportError(
            error instanceof Error
              ? t("app.scanFailedDetail", { detail: error.message })
              : t("app.scanFailed"),
          );
          return;
        }
        setImportingMap(false);
      }
      requestImportMap(file);
    },
    [requestImportMap, t],
  );

  const importFromOsu = useCallback(
    async (input: string) => {
      const worker = import.meta.env.VITE_WORKER_URL;
      if (!worker) {
        throw new Error(t("app.beatmapImportUnconfigured"));
      }
      const parsed = parseOsuBeatmapLink(input);
      if (!parsed) {
        throw new Error(t("app.pasteBeatmapLink"));
      }
      if (
        hasProjectContent &&
        !window.confirm(
          t("app.importReplaceConfirm"),
        )
      ) {
        return;
      }
      setImportingMap(true);
      setImportProgress({ ratio: 0, label: t("app.lookingUpBeatmap") });
      try {
        let setId = parsed.setId;
        if (!setId && parsed.beatmapId) {
          const lookup = await fetch(
            `${worker}/mirror/beatmap/${parsed.beatmapId}`,
          );
          if (!lookup.ok) {
            throw new Error(t("app.beatmapNotFound"));
          }
          const data = (await lookup.json()) as { setId?: number };
          setId = data.setId;
        }
        if (!setId) {
          throw new Error(t("app.pasteBeatmapLink"));
        }
        setImportProgress({ ratio: 0, label: t("app.contactingMirrors") });
        const res = await fetch(`${worker}/mirror/${setId}`);
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? t("app.beatmapsetUnavailable")
              : t("app.mirrorsDown"),
          );
        }
        const blob = await readBlobWithProgress(res, (loaded, total) => {
          // The download is roughly the first third of the wait; unzipping and
          // decoding assets is the rest, and importOsz reports that itself.
          setImportProgress({
            ratio: total ? (loaded / total) * 0.35 : 0.1,
            label: total
              ? t("app.downloadingOf", { loaded: formatBytes(loaded), total: formatBytes(total) })
              : t("app.downloading", { loaded: formatBytes(loaded) }),
          });
        });
        const file = new File([blob], `${setId}.osz`, {
          type: "application/octet-stream",
        });
        await importMapFile(
          file,
          parsed.beatmapId,
          scopedProgress(setImportProgress, 0.35, 1),
        );
      } finally {
        setImportingMap(false);
        setImportProgress(null);
      }
      void logAnalyticsEvent(
        "beatmap_import_by_id",
        authUserRef.current?.id,
      ).catch(() => {});
    },
    [hasProjectContent, importMapFile, t],
  );

  const importSmFile = useCallback(async (file: File) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    try {
      assertTextImportSize(file);
      const text = await file.text();
      const map = parseSmFile(text);
      void logAnalyticsEvent("import_sm", authUserRef.current?.id).catch(
        () => {},
      );
      setCloudProjectId(null);
      setCloudOwnerId(null);
      setMyRole(null);
      setReferenceId(null);
      setAudioFiles((previous) => {
        Object.values(previous).forEach((entry) => URL.revokeObjectURL(entry.url));
        return {};
      });
      setBgFiles((previous) => {
        Object.values(previous).forEach((entry) => URL.revokeObjectURL(entry.url));
        return {};
      });
      setVideoFiles((previous) => {
        Object.values(previous).forEach((entry) => URL.revokeObjectURL(entry.url));
        return {};
      });
      setProjectStarted(true);
      setMeta(map.meta);
      setTimingPoints(
        map.timingPoints.length
          ? normalizeTimingPoints(map.timingPoints)
          : defaultTimingPoints(),
      );
      const smBgFilename = map.backgroundFilename;
      const diffs = (map.difficulties.length
        ? map.difficulties
        : [makeDifficulty()]
      ).map((d) => ({
        ...d,
        backgroundFilename: d.backgroundFilename || smBgFilename || undefined,
        timingPoints: normalizeTimingPoints(d.timingPoints),
      }));
      setDifficulties(diffs);
      setActiveId(diffs[0].id);
      setPendingImport(null);
      setModal(null);
      setLocalProjectId(newLocalProjectId());
      void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : t("app.importSmFailed"),
      );
    } finally {
      setImportingMap(false);
    }
  }, [t]);

  const importQuaFile = useCallback(async (file: File) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    try {
      assertTextImportSize(file);
      const malody = /\.mc$/i.test(file.name);
      const source = await file.text();
      const map = malody
        ? { ...(await import("./lib/malody")).parseMalodyChart(source), bpmAffectsScroll: null }
        : (await import("./lib/qua")).parseQuaFile(source);
      setAudioFiles((previous) => {
        Object.values(previous).forEach((entry) => URL.revokeObjectURL(entry.url));
        return {};
      });
      setBgFiles((previous) => {
        Object.values(previous).forEach((entry) => URL.revokeObjectURL(entry.url));
        return {};
      });
      setVideoFiles((previous) => {
        Object.values(previous).forEach((entry) => URL.revokeObjectURL(entry.url));
        return {};
      });
      setCloudProjectId(null);
      setCloudOwnerId(null);
      setMyRole(null);
      setReferenceId(null);
      setProjectStarted(true);
      setMeta(map.meta);
      setTimingPoints(normalizeTimingPoints(map.timingPoints));
      const difficulty = {
        ...map.difficulty,
        timingPoints: normalizeTimingPoints(map.difficulty.timingPoints),
      };
      setDifficulties([difficulty]);
      setActiveId(difficulty.id);
      const bpmAffectsScroll = map.bpmAffectsScroll;
      if (bpmAffectsScroll !== null) {
        setAppSettings((settings) => ({ ...settings, bpmAffectsScroll }));
      }
      setNeedsSongHint(true);
      setPendingImport(null);
      setModal(null);
      setLocalProjectId(newLocalProjectId());
      void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : t("import.failed", { name: file.name }),
      );
    } finally {
      setImportingMap(false);
    }
  }, [t]);

  const requestImportSm = useCallback(
    (file: File) => {
      if (hasProjectContent) {
        setPendingImport(file);
      } else {
        void importSmFile(file);
      }
    },
    [hasProjectContent, importSmFile],
  );

  const requestImportQua = useCallback(
    (file: File) => {
      if (hasProjectContent) setPendingImport(file);
      else void importQuaFile(file);
    },
    [hasProjectContent, importQuaFile],
  );

  const readOsuFiles = useCallback(async (files: File[]) => {
    const entries: OsuEntry[] = [];
    for (const file of files) {
      assertTextImportSize(file);
      const text = await file.text();
      if (!isManiaOsu(text)) {
        throw new Error(t("app.notMania", { name: file.name }));
      }
      entries.push({ file, parsed: parseOsuFile(text) });
    }
    return entries;
  }, [t]);

  const openOsuAsProject = useCallback((entries: OsuEntry[]) => {
    if (!entries.length) return;
    importStartedRef.current = true;
    setImportError(null);
    setAudioFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return {};
    });
    setBgFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return {};
    });
    setVideoFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return {};
    });
    setPublicMapUrl(null);
    setCloudProjectId(null);
    setCloudOwnerId(null);
    setMyRole(null);
    setReferenceId(null);
    setProjectStarted(true);
    setMeta(entries[0].parsed.meta);
    setTimingPoints(normalizeTimingPoints(entries[0].parsed.timingPoints));
    const names: string[] = [];
    const diffs = entries.map(({ parsed }) => {
      const diff = adoptOsuDifficulty(parsed, {
        audioFilenames: [],
        backgroundFilenames: [],
        videoFilenames: [],
        existingNames: names,
      });
      names.push(diff.name);
      return { ...diff, timingPoints: normalizeTimingPoints(diff.timingPoints) };
    });
    setDifficulties(diffs);
    setActiveId(diffs[0].id);
    setNeedsSongHint(true);
    setPendingImport(null);
    setPendingOsuDiffs(null);
    setModal(null);
    setLocalProjectId(newLocalProjectId());
    void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
      () => {},
    );
  }, []);

  const importOsuProjectFile = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        openOsuAsProject(await readOsuFiles([file]));
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : t("app.importOsuFailed"),
        );
      }
    },
    [readOsuFiles, openOsuAsProject, t],
  );

  const addOsuDifficulties = useCallback(
    (entries: OsuEntry[]) => {
      if (!entries.length) return;
      if (!canEditRef.current) {
        setImportError(t("app.noEditAccess"));
        return;
      }
      const audioFilenames = Object.keys(audioFilesRef.current);
      const backgroundFilenames = Object.keys(bgFilesRef.current);
      const videoFilenames = Object.keys(videoFilesRef.current);
      const current = difficultiesRef.current;
      const base =
        current.find((d) => d.id === activeIdRef.current) ?? current[0];
      const inherit = (wanted: string | undefined, pool: string[]) =>
        wanted && pool.includes(wanted)
          ? wanted
          : pool.length === 1
            ? pool[0]
            : undefined;
      const names = current.map((d) => d.name);
      const takenBeatmapIds = current.flatMap((d) =>
        d.beatmapId ? [d.beatmapId] : [],
      );
      const added = entries.map(({ parsed }) => {
        const diff = adoptOsuDifficulty(parsed, {
          audioFilenames,
          backgroundFilenames,
          videoFilenames,
          fallbackAudioFilename: inherit(base?.audioFilename, audioFilenames),
          fallbackBackgroundFilename: inherit(
            base?.backgroundFilename,
            backgroundFilenames,
          ),
          existingNames: names,
          takenBeatmapIds,
        });
        names.push(diff.name);
        if (diff.beatmapId) takenBeatmapIds.push(diff.beatmapId);
        return {
          ...diff,
          timingPoints: normalizeTimingPoints(diff.timingPoints),
        };
      });
      markStructural();
      setDifficulties((prev) => [...prev, ...added]);
      setActiveId(added[added.length - 1].id);
      setPendingOsuDiffs(null);
      setModal(null);
      announceAssetChange(
        added.length === 1
          ? `added the difficulty ${added[0].name}`
          : `added ${added.length} difficulties`,
      );
      setImportNotice(
        added.length === 1
          ? `Added ${added[0].name} as a new difficulty`
          : `Added ${added.length} difficulties`,
      );
    },
    [markStructural, announceAssetChange, t],
  );

  const openOsuFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setImportError(null);
      let entries: OsuEntry[];
      try {
        entries = await readOsuFiles(files);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : t("app.readOsuFailed"),
        );
        return;
      }
      if (!projectStartedRef.current) {
        openOsuAsProject(entries);
        return;
      }
      if (entries.every(({ parsed }) => isSameSong(metaRef.current, parsed.meta))) {
        addOsuDifficulties(entries);
        return;
      }
      setPendingOsuDiffs(entries);
    },
    [readOsuFiles, openOsuAsProject, addOsuDifficulties, t],
  );

  const importPackSong = useCallback(
    (song: PackSong) => {
      void (async () => {
        const audioBlobs = await snapshotBlobMap(song.audioBlobs);
        const bgBlobs = await snapshotBlobMap(song.bgBlobs);
        setAudioFiles((prev) => {
          Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
          return Object.fromEntries(
            Object.entries(audioBlobs).map(([name, blob]) => [
              name,
              { name, url: URL.createObjectURL(blob), blob },
            ]),
          );
        });
        setBgFiles((prev) => {
          Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
          return Object.fromEntries(
            Object.entries(bgBlobs).map(([name, blob]) => [
              name,
              { name, url: URL.createObjectURL(blob), blob },
            ]),
          );
        });
        setVideoFiles((prev) => {
          Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
          return {};
        });
        setCloudProjectId(null);
        setCloudOwnerId(null);
        setMyRole(null);
        setReferenceId(null);
        setProjectStarted(true);
        setMeta(song.parsed.meta);
        setTimingPoints(
          song.parsed.timingPoints.length
            ? normalizeTimingPoints(song.parsed.timingPoints)
            : defaultTimingPoints(),
        );
        const audioKeys = Object.keys(audioBlobs);
        const bgKeys = Object.keys(bgBlobs);
        const smAudioFilename = song.parsed.audioFilename ?? (audioKeys.length > 0 ? audioKeys[0] : undefined);
        const smBgFilename = song.parsed.backgroundFilename ?? (bgKeys.length > 0 ? bgKeys[0] : undefined);
        const diffs = (song.parsed.difficulties.length
          ? song.parsed.difficulties
          : [makeDifficulty()]
        ).map((d) => ({
          ...d,
          audioFilename: d.audioFilename || smAudioFilename || undefined,
          backgroundFilename: d.backgroundFilename || smBgFilename || undefined,
          timingPoints: normalizeTimingPoints(d.timingPoints),
        }));
        setDifficulties(diffs);
        setActiveId(diffs[0].id);
        setModal(null);
        setLocalProjectId(newLocalProjectId());
        void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
          () => {},
        );
      })();
    },
    [],
  );

  const onImportSmPack = useCallback(async () => {
    if (!("showDirectoryPicker" in window)) {
      setPackError("Folder picker is not supported in this browser. Please drag & drop the pack folder instead.");
      setModal("packBrowser");
      return;
    }
    setScanningPack(true);
    setPackError(null);
    setModal("packBrowser");
    try {
      const dirHandle = await (window as unknown as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker();
      const { scanPackFromPicker } = await import("./lib/smPackImport");
      const songs = await scanPackFromPicker(dirHandle);
      setScannedPackSongs(songs);
      if (songs.length === 0) {
        setPackError("No .sm / .ssc beatmaps found in the selected folder.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setModal(null);
        setScannedPackSongs([]);
      } else {
        setPackError(err instanceof Error ? err.message : t("app.scanPackFailed"));
      }
    } finally {
      setScanningPack(false);
    }
  }, [t]);

  const loadSampleMap = useCallback(
    async (map: SampleMap) => {
      setModal(null);
      setImportingMap(true);
      try {
        const res = await fetch(siteAsset(map.osz));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const name = map.osz.split("/").pop() ?? `${map.id}.osz`;
        const file = new File([blob], name, { type: "application/octet-stream" });
        await importMapFile(file);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : t("app.loadMapFailed"),
        );
        setImportingMap(false);
      }
    },
    [importMapFile, t],
  );

  const patchDifficulty = useCallback(
    (id: string, patch: Partial<Difficulty>) => {
      if (!canEditRef.current) return;
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d;
          const next = { ...d, ...patch };
          if (patch.keyCount !== undefined) {
            next.notes = next.notes.filter((n) => n.column < next.keyCount);
          }
          return next;
        }),
      );
    },
    [markStructural],
  );

  const applyTimingPoints = useCallback(
    (points: TimingPoint[]) => {
      if (!appSettingsRef.current.moveNotesWithTiming) {
        patchDifficulty(activeIdRef.current, { timingPoints: points });
        return;
      }
      if (!canEditRef.current) return;
      const id = activeIdRef.current;
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                timingPoints: points,
                notes: notesFollowingTiming(
                  d.notes,
                  d.timingPoints?.length ? d.timingPoints : timingPointsRef.current,
                  points,
                ),
              }
            : d,
        ),
      );
    },
    [patchDifficulty, markStructural],
  );

  const applyBatch = useCallback((request: BatchRequest) => {
    if (!canEditRef.current) return;
    markStructural();
    if (request.meta) setMeta(request.meta);
    setDifficulties(prev => batchApplyDifficulties(prev, request, timingPoints));
  }, [markStructural, timingPoints]);

  const shiftTimingMarkers = useCallback(
    (deltaMs: number) => {
      if (!deltaMs || !canEditRef.current) return;
      const id = activeIdRef.current;
      const moveNotes = appSettingsRef.current.moveNotesWithTiming;
      markStructural();
      setDifficulties((previous) =>
        previous.map((difficulty) => {
          if (difficulty.id !== id) return difficulty;
          const mapTime = (time: number) => Math.max(0, time + deltaMs);
          const bookmarks = difficulty.bookmarks?.map(mapTime);
          const timingPoints = difficulty.timingPoints.map((point) => ({
            ...point,
            time: point.time + deltaMs,
          }));
          return {
            ...difficulty,
            timingPoints,
            notes: moveNotes
              ? notesFollowingTiming(difficulty.notes, difficulty.timingPoints, timingPoints)
              : difficulty.notes,
            previewTime:
              difficulty.previewTime >= 0
                ? mapTime(difficulty.previewTime)
                : difficulty.previewTime,
            bookmarks,
            bookmarkLabels: remapBookmarkLabels(
              difficulty.bookmarks,
              difficulty.bookmarkLabels,
              mapTime,
            ),
          };
        }),
      );
    },
    [markStructural],
  );

  const runAutoTime = useCallback(() => {
    const buffer = waveform?.buffer;
    if (!buffer) return;
    setAutoTimeStatus("detecting");
    const points = activeTimingPoints;
    const rate = activeRate;
    // Let the "Listening..." state paint before detection blocks the thread.
    window.setTimeout(() => {
      const raw = detectBpmFromBuffer(buffer);
      if (!raw) {
        setAutoTimeStatus("failed");
        return;
      }
      // Detection runs in audio-file time; a rate-changed difficulty hears
      // the song rate× faster, so its BPM scales up and offsets shrink.
      const bpm = Math.round(raw.bpm * rate * 1000) / 1000;
      const offsetMs = Math.round(raw.offsetMs / rate);
      const reds = sortedPoints(points).filter((p) => p.uninherited);
      const target =
        [...reds].reverse().find((p) => p.time <= offsetMs) ?? reds[0];
      applyTimingPoints(
        target
          ? points.map((p) =>
              p.id === target.id ? { ...p, bpm, time: offsetMs } : p,
            )
          : [...points, makeRedPoint(offsetMs, bpm)],
      );
      setAutoTimeResult({ bpm, offsetMs, confidence: raw.confidence });
      setAutoTimeStatus("done");
    }, 30);
  }, [waveform, activeRate, activeTimingPoints, applyTimingPoints]);

  const setPreviewPoint = useCallback(
    (ms: number) => {
      patchDifficulty(activeIdRef.current, { previewTime: Math.round(ms) });
    },
    [patchDifficulty],
  );

  const menuMusicEnabled =
    appSettings.menuMusicEnabled && !hasProject && !packCreatorOpen && !sharedSlug;
  const menuMusic = useMenuMusic(
    menuMusicEnabled,
    osuLive.running,
    audio.volume * appSettings.masterVolume,
  );
  const toggleMenuMusic = menuMusic.toggle;
  const nextMenuTrack = menuMusic.next;
  const previousMenuTrack = menuMusic.previous;
  const setMenuMusicDucking = menuMusic.setAmbientDucking;
  const fadeOutMenuMusic = menuMusic.fadeOut;

  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const handleExitApp = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    const ms = exitAnimationMs();
    setExiting(true);
    fadeOutMenuMusic(ms);
    window.setTimeout(() => {
      exitDesktopApp().catch(() => {
        exitingRef.current = false;
        setExiting(false);
      });
    }, ms);
  }, [fadeOutMenuMusic]);
  const onlinePlayers = useOnlinePresence(
    () => {
      const title = meta.title.trim();
      return hasProject ? title || null : null;
    },
    appSettings.hideStatus,
  );

  const [aiModReport, setAiModReport] = useState<AiModReport | null>(null);
  const [confirmResnap, setConfirmResnap] = useState(false);

  const runAiModCheck = useCallback(() => {
    setAiModReport(
      runAiMod({
        meta: metaRef.current,
        difficulties: difficultiesRef.current,
        audioFiles,
        bgFiles,
        audioDurationMs: sourceDurationRef.current
          ? Math.round(sourceDurationRef.current)
          : undefined,
      }),
    );
  }, [audioFiles, bgFiles]);

  const openAiMod = useCallback(() => {
    runAiModCheck();
    setModal("aimod");
  }, [runAiModCheck]);

  const aiModUnsnapped = useMemo(() => {
    const d = difficulties.find((x) => x.id === activeId);
    if (!d) return 0;
    const pts = d.timingPoints?.length ? d.timingPoints : [];
    return countUnsnapped(d.notes, pts);
  }, [difficulties, activeId]);

  const handleAiModJump = useCallback(
    (issue: AiModIssue, time?: number) => {
      if (issue.diffId && issue.diffId !== activeIdRef.current)
        setActiveId(issue.diffId);
      const target = time ?? issue.time;
      if (target !== undefined) seekAudio(Math.max(0, target));
    },
    [seekAudio],
  );

  const handleResnap = useCallback(() => {
    setConfirmResnap(false);
    const id = activeIdRef.current;
    const d = difficultiesRef.current.find((x) => x.id === id);
    if (!d) return;
    const pts = d.timingPoints?.length ? d.timingPoints : [];
    const { notes, moved } = resnapNotes(d.notes, pts);
    if (moved > 0) {
      patchDifficulty(id, { notes });
      // Re-run against the updated notes so the panel reflects the fix.
      setAiModReport(
        runAiMod({
          meta: metaRef.current,
          difficulties: difficultiesRef.current.map((x) =>
            x.id === id ? { ...x, notes } : x,
          ),
          audioFiles,
          bgFiles,
          audioDurationMs: sourceDurationRef.current
            ? Math.round(sourceDurationRef.current)
            : undefined,
        }),
      );
    }
  }, [patchDifficulty, audioFiles, bgFiles]);

  const addBookmark = useCallback(
    (ms: number, label?: string) => {
      if (!canEditRef.current) return;
      const t = Math.round(ms);
      if (!(t >= 0)) return;
      const name = label?.trim().slice(0, 80) ?? "";
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          const existing = d.bookmarks ?? [];
          const nearby = existing.find((b) => Math.abs(b - t) <= 5);
          if (nearby !== undefined && !name) return d;
          const time = nearby ?? t;
          const nextBookmarks = nearby
            ? existing
            : [...existing, time].sort((a, b) => a - b);
          const nextLabels = { ...(d.bookmarkLabels ?? {}) };
          if (name) nextLabels[bookmarkKey(time)] = name;
          return {
            ...d,
            bookmarks: nextBookmarks,
            bookmarkLabels: Object.keys(nextLabels).length
              ? nextLabels
              : undefined,
          };
        }),
      );
    },
    [markStructural],
  );

  const renameBookmark = useCallback(
    (ms: number, label: string) => {
      if (!canEditRef.current) return;
      const name = label.trim().slice(0, 80);
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current || !d.bookmarks?.includes(ms)) return d;
          const labels = { ...(d.bookmarkLabels ?? {}) };
          if (name) labels[bookmarkKey(ms)] = name;
          else delete labels[bookmarkKey(ms)];
          return {
            ...d,
            bookmarkLabels: Object.keys(labels).length ? labels : undefined,
          };
        }),
      );
    },
    [markStructural],
  );

  const removeBookmark = useCallback(
    (ms: number) => {
      if (!canEditRef.current) return;
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          const existing = d.bookmarks ?? [];
          const next = existing.filter((b) => b !== ms);
          if (next.length === existing.length) return d;
          const labels = { ...(d.bookmarkLabels ?? {}) };
          delete labels[bookmarkKey(ms)];
          return {
            ...d,
            bookmarks: next.length ? next : undefined,
            bookmarkLabels: Object.keys(labels).length ? labels : undefined,
          };
        }),
      );
      setBookmarkLoop((loop) =>
        loop?.diffId === activeIdRef.current &&
        (loop.startMs === ms || loop.endMs === ms)
          ? null
          : loop,
      );
    },
    [markStructural],
  );

  const seekBookmark = useCallback(
    (direction: "previous" | "next") => {
      const d = difficultiesRef.current.find(
        (item) => item.id === activeIdRef.current,
      );
      const target = bookmarkInDirection(
        d?.bookmarks,
        currentTimeRef.current,
        direction,
      );
      if (target !== null) seekAudio(target, "smooth");
    },
    [seekAudio],
  );
  const seekPreviousBookmark = useCallback(
    () => seekBookmark("previous"),
    [seekBookmark],
  );
  const seekNextBookmark = useCallback(
    () => seekBookmark("next"),
    [seekBookmark],
  );
  const setWaveformSensitivity = useCallback((value: number) => {
    setAppSettings((settings) => ({
      ...settings,
      waveformSensitivity: value,
    }));
  }, []);
  const openTimelineComment = useCallback(
    (time: number) => {
      seekAudio(time, "smooth");
      setCommentsOpen(true);
    },
    [seekAudio],
  );
  const queueDifficultyDelete = useCallback(
    (ids: string[]) => setPendingDeleteDiffIds(ids),
    [],
  );
  const renameDifficulty = useCallback(
    (id: string, name: string) => patchDifficulty(id, { name }),
    [patchDifficulty],
  );

  const setBookmarkLoopStart = useCallback((ms: number) => {
    const d = difficultiesRef.current.find(
      (item) => item.id === activeIdRef.current,
    );
    const after = sortedBookmarks(d?.bookmarks).find((value) => value > ms);
    setBookmarkLoop((loop) => {
      const end =
        loop?.diffId === activeIdRef.current && loop.endMs > ms
          ? loop.endMs
          : after;
      if (end === undefined) return loop;
      return {
        diffId: activeIdRef.current,
        startMs: ms,
        endMs: end,
        enabled: loop?.diffId === activeIdRef.current && loop.enabled,
      };
    });
  }, []);

  const setBookmarkLoopEnd = useCallback((ms: number) => {
    const d = difficultiesRef.current.find(
      (item) => item.id === activeIdRef.current,
    );
    const prior = sortedBookmarks(d?.bookmarks).filter((value) => value < ms);
    const before = prior[prior.length - 1];
    setBookmarkLoop((loop) => {
      const start =
        loop?.diffId === activeIdRef.current && loop.startMs < ms
          ? loop.startMs
          : before;
      if (start === undefined) return loop;
      return {
        diffId: activeIdRef.current,
        startMs: start,
        endMs: ms,
        enabled: loop?.diffId === activeIdRef.current && loop.enabled,
      };
    });
  }, []);

  const toggleBookmarkLoop = useCallback(() => {
    setBookmarkLoop((loop) => {
      if (loop?.diffId === activeIdRef.current) {
        return { ...loop, enabled: !loop.enabled };
      }
      const d = difficultiesRef.current.find(
        (item) => item.id === activeIdRef.current,
      );
      const range = loopAroundTime(d?.bookmarks, currentTimeRef.current);
      return range
        ? { diffId: activeIdRef.current, ...range, enabled: true }
        : loop;
    });
  }, []);

  const clearBookmarkLoop = useCallback(() => {
    setBookmarkLoop((loop) =>
      loop?.diffId === activeIdRef.current ? null : loop,
    );
  }, []);

  const setTrimStart = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const end = d.trimEndMs ?? durationRef.current;
      const t = Math.round(Math.max(0, Math.min(ms, end - 10)));
      commitDiffFields({ trimStartMs: t <= 0 ? null : t });
    },
    [commitDiffFields],
  );

  const setTrimEnd = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const dur = durationRef.current;
      const start = d.trimStartMs ?? 0;
      const t = Math.round(Math.max(start + 10, Math.min(ms, dur)));
      commitDiffFields({ trimEndMs: t >= dur - 0.5 ? null : t });
    },
    [commitDiffFields],
  );

  const setFadeIn = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const start = d.trimStartMs ?? 0;
      const end = d.trimEndMs ?? durationRef.current;
      const max = Math.max(0, end - start);
      const t = Math.round(Math.max(0, Math.min(ms, max)));
      commitDiffFields({ fadeInMs: t <= 0 ? null : t });
    },
    [commitDiffFields],
  );

  const setFadeOut = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const start = d.trimStartMs ?? 0;
      const end = d.trimEndMs ?? durationRef.current;
      const max = Math.max(0, end - start);
      const t = Math.round(Math.max(0, Math.min(ms, max)));
      commitDiffFields({ fadeOutMs: t <= 0 ? null : t });
    },
    [commitDiffFields],
  );

  const addDifficulty = useCallback(() => {
    if (!canEditRef.current) return;
    const base = difficulties.find((d) => d.id === activeId);
    const diff = makeDifficulty("New Difficulty", base?.keyCount ?? 4);
    diff.audioFilename = base?.audioFilename;
    diff.timingPoints = (base?.timingPoints?.length
      ? base.timingPoints
      : timingPoints
    ).map((p) => ({ ...p, id: uid("tp") }));
    markStructural();
    setDifficulties((prev) => [...prev, diff]);
    setActiveId(diff.id);
  }, [difficulties, activeId, timingPoints, markStructural]);

  /**
   * Builds a rate-shifted copy of the active difficulty. The source is left
   * untouched; the copy carries its own audioRate so the editor plays the
   * shared audio file at that rate. Picked up by the snapshot history like any
   * other structural change, so it undoes/redoes for free.
   */
  const createRateDifficulty = useCallback(
    (options: RateCreateOptions) => {
      if (!canEditRef.current) return;
      const source = difficultiesRef.current.find(
        (d) => d.id === activeIdRef.current,
      );
      if (!source) return;
      const rated = makeRateDifficulty(source, {
        ...options,
        existingNames: difficultiesRef.current.map((d) => d.name),
      });
      markStructural();
      setDifficulties((prev) => [...prev, rated]);
      setActiveId(rated.id);
      void logAnalyticsEvent("rate_change_export", authUserRef.current?.id).catch(
        () => {},
      );
    },
    [markStructural],
  );

  const duplicateDifficulty = useCallback(
    (id: string) => {
      if (!canEditRef.current) return;
      markStructural();
      setDifficulties((prev) => {
        const src = prev.find((d) => d.id === id);
        if (!src) return prev;
        const copy: Difficulty = {
          ...src,
          id: uid("diff"),
          name: t("app.copyName", { name: src.name }),
          // Unsubmitted copy: reusing the source's id would collide with it.
          beatmapId: undefined,
          timingPoints: src.timingPoints.map((p) => ({ ...p, id: uid("tp") })),
          notes: src.notes.map((n) => ({ ...n, id: uid("n") })),
        };
        return [...prev, copy];
      });
    },
    [markStructural, t],
  );

  // Copying needs no edit access: a map someone shared read-only is still a
  // fine source to paste into one of your own. The music, background and video
  // it plays go along, so it pastes whole into any project.
  const copyDifficulty = useCallback(async (id: string) => {
    const difficulty = difficultiesRef.current.find((d) => d.id === id);
    if (!difficulty) return;
    const audioNames = Object.keys(audioFilesRef.current);
    const audio =
      (difficulty.audioFilename && audioFilesRef.current[difficulty.audioFilename]) ||
      (audioNames.length === 1 ? audioFilesRef.current[audioNames[0]] : null);
    const background = difficulty.backgroundFilename
      ? bgFilesRef.current[difficulty.backgroundFilename]
      : null;
    const video = difficulty.videoFilename
      ? videoFilesRef.current[difficulty.videoFilename]
      : null;
    const files: ClipAsset[] = [];
    if (audio) files.push({ kind: "audio", name: audio.name, blob: audio.blob });
    if (background) {
      files.push({ kind: "background", name: background.name, blob: background.blob });
    }
    if (video) files.push({ kind: "video", name: video.name, blob: video.blob });

    const clipId = uid("clip");
    const saved =
      files.length > 0 &&
      (await saveClipAssets(clipId, files).then(
        () => true,
        () => false,
      ));
    const label = difficulty.name || "the difficulty";
    pushClip({
      kind: "difficulty",
      id: clipId,
      // Named after the song it plays, so a map that only had one song and
      // never named it still pastes with the right one.
      difficulty: { ...difficulty, audioFilename: audio?.name ?? difficulty.audioFilename },
      source: `${metaRef.current.artist} - ${metaRef.current.title}`,
      meta: metaRef.current,
      assets: saved
        ? files.map(({ kind, name, blob }) => ({ kind, name, bytes: blob.size }))
        : [],
    });
    setImportNotice(
      files.length && !saved
        ? `Copied ${label}, but its music and background didn't fit in browser storage`
        : `Copied ${label} to the clipboard`,
    );
  }, []);

  const pasteDifficulty = useCallback(
    async (clip: DifficultyClip) => {
      if (!canEditRef.current) return;
      const expected = clip.assets?.length ?? 0;
      const stored = expected
        ? await loadClipAssets(clip.id).catch((): ClipAsset[] => [])
        : [];
      const { names, added } = await placeClipAssets(stored, {
        audio: audioFilesRef.current,
        background: bgFilesRef.current,
        video: videoFilesRef.current,
      });
      if (!canEditRef.current) return;

      const addedOf = (kind: ClipAssetKind) =>
        added.filter((file) => file.kind === kind);
      const loaded = (kind: ClipAssetKind): LoadedFile[] =>
        addedOf(kind).map((file) => ({
          name: file.name,
          blob: file.blob,
          url: URL.createObjectURL(file.blob),
        }));
      const register =
        (files: LoadedFile[]) => (prev: Record<string, LoadedFile>) =>
          files.length
            ? { ...prev, ...Object.fromEntries(files.map((f) => [f.name, f])) }
            : prev;
      const newAudio = loaded("audio");
      const newBackgrounds = loaded("background");
      const newVideos = loaded("video");

      const current = difficultiesRef.current;
      const base =
        current.find((d) => d.id === activeIdRef.current) ?? current[0];
      const source = clip.difficulty;
      const diff = adoptCopiedDifficulty(
        {
          ...source,
          audioFilename: names.audio ?? source.audioFilename,
          backgroundFilename: names.background ?? source.backgroundFilename,
          videoFilename: names.video ?? source.videoFilename,
        },
        {
          existingNames: current.map((d) => d.name),
          audioFilenames: [
            ...Object.keys(audioFilesRef.current),
            ...newAudio.map((f) => f.name),
          ],
          backgroundFilenames: [
            ...Object.keys(bgFilesRef.current),
            ...newBackgrounds.map((f) => f.name),
          ],
          videoFilenames: [
            ...Object.keys(videoFilesRef.current),
            ...newVideos.map((f) => f.name),
          ],
          base,
        },
      );

      // Difficulties that play this map's only song without naming it would
      // lose it once a second song arrives, so name it for them first.
      const ownSongs = Object.keys(audioFilesRef.current);
      const lone = newAudio.length && ownSongs.length === 1 ? ownSongs[0] : null;
      const pinned = (list: Difficulty[]) =>
        lone
          ? list.map((d) =>
              d.audioFilename && audioFilesRef.current[d.audioFilename]
                ? d
                : { ...d, audioFilename: lone },
            )
          : list;

      markStructural();
      setAudioFiles(register(newAudio));
      setBgFiles(register(newBackgrounds));
      setVideoFiles(register(newVideos));
      setDifficulties((prev) => [...pinned(prev), diff]);
      setActiveId(diff.id);
      // A fresh project takes the song details along with the song.
      const own = metaRef.current;
      if (
        clip.meta &&
        own.title === DEFAULT_SONG_META.title &&
        own.artist === DEFAULT_SONG_META.artist
      ) {
        setMeta({ ...clip.meta, beatmapSetId: undefined });
      }
      announceAssetChange(`added the difficulty ${diff.name}`);
      setImportNotice(
        expected > stored.length
          ? `Added ${diff.name}, but its copied music and background are no longer in browser storage`
          : `Added ${diff.name} as a new difficulty`,
      );
    },
    [markStructural, announceAssetChange],
  );

  const pruneOrphanAssets = useCallback((remaining: Difficulty[]) => {
    const prune = (
      reg: Record<string, LoadedFile>,
      used: Set<string>,
    ): Record<string, LoadedFile> => {
      let changed = false;
      const next: Record<string, LoadedFile> = {};
      for (const [name, file] of Object.entries(reg)) {
        if (used.has(name)) next[name] = file;
        else {
          if (file.url) URL.revokeObjectURL(file.url);
          changed = true;
        }
      }
      return changed ? next : reg;
    };

    setAudioFiles((prev) => {
      const names = Object.keys(prev);
      const lone = names.length === 1 ? names[0] : null;
      const used = new Set<string>();
      for (const d of remaining) {
        const name =
          d.audioFilename && prev[d.audioFilename] ? d.audioFilename : lone;
        if (name) used.add(name);
      }
      return prune(prev, used);
    });

    setBgFiles((prev) =>
      prune(
        prev,
        new Set(
          remaining
            .map((d) => d.backgroundFilename)
            .filter((n): n is string => !!n),
        ),
      ),
    );

    setVideoFiles((prev) =>
      prune(
        prev,
        new Set(
          remaining.map((d) => d.videoFilename).filter((n): n is string => !!n),
        ),
      ),
    );
  }, []);

  const deleteDifficulties = useCallback(
    (ids: string[]) => {
      if (!canEditRef.current || ids.length === 0) return;
      const prev = difficultiesRef.current;
      const remove = new Set(ids);
      let next = prev.filter((d) => !remove.has(d.id));
      if (next.length === 0) next = prev.slice(0, 1);
      if (next.length === prev.length) return;
      markStructural();
      setDifficulties(next);
      if (!next.some((d) => d.id === activeIdRef.current))
        setActiveId(next[0].id);
      pruneOrphanAssets(next);
    },
    [markStructural, pruneOrphanAssets],
  );

  const placeNote = useCallback(
    (note: ManiaNote) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const accepted = withoutNoteCollisions([note], target.notes);
      if (!accepted.length) return;
      commitNoteOp({ t: "note.add", diffId: did, notes: accepted });
    },
    [commitNoteOp],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      const note = target?.notes.find((n) => n.id === noteId);
      if (!note) return;
      commitNoteOp({ t: "note.remove", diffId: did, notes: [note] });
    },
    [commitNoteOp],
  );

  const addNotes = useCallback(
    (notes: ManiaNote[]) => {
      if (!notes.length) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const accepted = withoutNoteCollisions(notes, target.notes);
      if (!accepted.length) return;
      commitNoteOp({ t: "note.add", diffId: did, notes: accepted });
    },
    [commitNoteOp],
  );

  const deleteNotes = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      const set = new Set(ids);
      const removed = target ? target.notes.filter((n) => set.has(n.id)) : [];
      if (!removed.length) return;
      commitNoteOp({ t: "note.remove", diffId: did, notes: removed });
    },
    [commitNoteOp],
  );

  const applyFullLong = useCallback(
    (ticks: number) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const points = target.timingPoints?.length
        ? target.timingPoints
        : timingPointsRef.current;
      const after = fullLongNotes(target.notes, points, view.snapDivisor, ticks);
      if (hasNoteCollisions(after)) return;
      commitNoteOp({
        t: "note.update",
        diffId: did,
        before: target.notes,
        after,
      });
    },
    [commitNoteOp, view.snapDivisor],
  );

  const applyFullRice = useCallback(() => {
    const did = activeIdRef.current;
    const target = difficultiesRef.current.find((d) => d.id === did);
    if (!target) return;
    const after = fullRiceNotes(target.notes);
    if (hasNoteCollisions(after)) return;
    commitNoteOp({
      t: "note.update",
      diffId: did,
      before: target.notes,
      after,
    });
  }, [commitNoteOp]);

  /**
   * The selection-scoped note tools. Each takes the ids the editor reports and
   * commits one undoable update, the same way the difficulty-wide tools do.
   */
  const commitSelectionEdit = useCallback(
    (edit: (notes: ManiaNote[], ids: ReadonlySet<string>) => ManiaNote[]) => {
      const ids = selectionRange?.ids;
      if (!ids?.size) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const after = edit(target.notes, ids);
      if (after === target.notes || hasNoteCollisions(after)) return;
      commitNoteOp({
        t: "note.update",
        diffId: did,
        before: target.notes,
        after,
      });
    },
    [commitNoteOp, selectionRange],
  );

  const applySelectionLong = useCallback(
    (ticks: number) =>
      commitSelectionEdit((notes, ids) => {
        const target = difficultiesRef.current.find(
          (d) => d.id === activeIdRef.current,
        );
        const points = target?.timingPoints?.length
          ? target.timingPoints
          : timingPointsRef.current;
        return fullLongNotesWithin(notes, ids, points, view.snapDivisor, ticks);
      }),
    [commitSelectionEdit, view.snapDivisor],
  );

  const applySelectionRice = useCallback(
    () => commitSelectionEdit((notes, ids) => fullRiceNotesWithin(notes, ids)),
    [commitSelectionEdit],
  );

  const applyShiftLnEnds = useCallback(
    (deltaMs: number) =>
      commitSelectionEdit((notes, ids) =>
        shiftLongNoteEnds(notes, ids, deltaMs),
      ),
    [commitSelectionEdit],
  );

  const applyDropShortLns = useCallback(
    (minMs: number) =>
      commitSelectionEdit((notes, ids) =>
        dropShortLongNotes(notes, ids, minMs),
      ),
    [commitSelectionEdit],
  );

  const applyCopyHitsounds = useCallback(
    (sourceId: string) => {
      const did = activeIdRef.current;
      if (sourceId === did) return;
      const diffs = difficultiesRef.current;
      const target = diffs.find((d) => d.id === did);
      const source = diffs.find((d) => d.id === sourceId);
      if (!target || !source) return;
      const { before, after } = copyHitsounds(target.notes, source.notes);
      const name = source.name || t("hitsounds.unnamed");
      if (after.length === 0) {
        announceShortcut(t("hitsounds.nothingNewFrom", { name }));
        return;
      }
      commitNoteOp({ t: "note.update", diffId: did, before, after });
      announceShortcut(
        t("hitsounds.copiedFrom", {
          name,
          notes: t("hitsounds.noteCount", { count: after.length }),
        }),
      );
    },
    [commitNoteOp, announceShortcut, t],
  );

  // Rate-changed difficulties sit on a stretched copy of the song, so only
  // difficulties on the same audio line up note for note.
  const hitsoundTargets = useMemo(
    () =>
      difficulties.filter(
        (d) =>
          d.id !== activeId &&
          (d.audioFilename ?? "") === (active.audioFilename ?? ""),
      ),
    [difficulties, activeId, active.audioFilename],
  );

  const applyCopyHitsoundsToAll = useCallback(() => {
    const did = activeIdRef.current;
    const diffs = difficultiesRef.current;
    const source = diffs.find((d) => d.id === did);
    if (!source) return;
    let changedNotes = 0;
    let changedDiffs = 0;
    for (const target of diffs) {
      if (target.id === did) continue;
      if ((target.audioFilename ?? "") !== (source.audioFilename ?? "")) continue;
      const { before, after } = copyHitsounds(target.notes, source.notes);
      if (after.length === 0) continue;
      commitNoteOp({ t: "note.update", diffId: target.id, before, after });
      changedNotes += after.length;
      changedDiffs += 1;
    }
    announceShortcut(
      changedNotes
        ? t("hitsounds.copiedToAll", {
            notes: t("hitsounds.noteCount", { count: changedNotes }),
            difficulties: t("hitsounds.difficultyCount", { count: changedDiffs }),
          })
        : t("hitsounds.allMatch"),
    );
  }, [commitNoteOp, announceShortcut, t]);

  const hitsoundSources = useMemo(
    () =>
      difficulties
        .filter((d) => d.id !== activeId)
        .map((d) => ({
          id: d.id,
          name: d.name || "(unnamed)",
          noteCount: d.notes.length,
          hitsoundCount: countHitsounds(d.notes),
        })),
    [difficulties, activeId],
  );

  const applyCropToBrackets = useCallback(() => {
    const did = activeIdRef.current;
    const target = difficultiesRef.current.find((d) => d.id === did);
    if (!target) return;
    const start = target.trimStartMs ?? 0;
    const hasEnd = target.trimEndMs !== undefined;
    const end = target.trimEndMs ?? Infinity;
    if (start <= 0.5 && !hasEnd) return;

    const toRemove: ManiaNote[] = [];
    const clampBefore: ManiaNote[] = [];
    const clampAfter: ManiaNote[] = [];
    for (const n of target.notes) {
      if (n.startTime < start - 0.5 || n.startTime > end + 0.5) {
        toRemove.push(n);
      } else if (hasEnd && n.endTime !== undefined && n.endTime > end + 0.5) {
        clampBefore.push(n);
        clampAfter.push(
          end > n.startTime
            ? { ...n, endTime: Math.round(end) }
            : { ...n, endTime: undefined },
        );
      }
    }
    if (toRemove.length) {
      commitNoteOp({ t: "note.remove", diffId: did, notes: toRemove });
    }
    if (clampAfter.length) {
      commitNoteOp({
        t: "note.update",
        diffId: did,
        before: clampBefore,
        after: clampAfter,
      });
    }
  }, [commitNoteOp]);

  const moveNotes = useCallback(
    (updated: ManiaNote[]) => {
      if (!updated.length) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const byId = new Map(updated.map((n) => [n.id, n]));
      const before = target.notes.filter((n) => byId.has(n.id));
      if (!before.length) return;
      const beforeById = new Map(before.map((n) => [n.id, n]));
      const changedGeometry = updated.some((n) => {
        const old = beforeById.get(n.id);
        return old ? !sameNoteGeometry(old, n) : true;
      });
      if (changedGeometry) {
        const nextNotes = target.notes.map((n) => byId.get(n.id) ?? n);
        if (hasNoteCollisions(nextNotes)) return;
      }
      commitNoteOp({ t: "note.update", diffId: did, before, after: updated });
    },
    [commitNoteOp],
  );

  const snapshot = useMemo<DocSnapshot>(
    () => ({ meta, timingPoints, difficulties }),
    [meta, timingPoints, difficulties],
  );
  const undoStackRef = useRef<DocSnapshot[]>([]);
  const redoStackRef = useRef<DocSnapshot[]>([]);
  const presentRef = useRef<DocSnapshot | null>(null);
  const applyingHistoryRef = useRef(false);
  const [historyRevision, bumpHistory] = useState(0);

  useEffect(() => {
    if (presentRef.current === null) {
      presentRef.current = snapshot;
      return;
    }
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      presentRef.current = snapshot;
      return;
    }
    if (sessionActiveRef.current || applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      presentRef.current = snapshot;
      return;
    }
    const previous = presentRef.current;
    if (previous === snapshot || (previous.meta === snapshot.meta && previous.timingPoints === snapshot.timingPoints && previous.difficulties.length === snapshot.difficulties.length && previous.difficulties.every((d, i) => d === snapshot.difficulties[i]))) {
      presentRef.current = snapshot;
      return;
    }
    undoStackRef.current.push(presentRef.current);
    if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    redoStackRef.current = [];
    presentRef.current = snapshot;
    bumpHistory((v) => v + 1);
  }, [snapshot]);

  useEffect(() => {
    if (!sessionActiveRef.current || !pendingDocSyncRef.current) return;
    if (cloudSyncTimerRef.current !== null) {
      window.clearTimeout(cloudSyncTimerRef.current);
    }
    cloudSyncTimerRef.current = window.setTimeout(() => {
      cloudSyncTimerRef.current = null;
      if (!pendingDocSyncRef.current) return;
      pendingDocSyncRef.current = false;
      const pid = cloudProjectIdRef.current;
      if (!pid || !canEditRef.current) return;
      void queueCloudSave(pid, {
        meta: metaRef.current,
        timingPoints: timingPointsRef.current,
        difficulties: difficultiesRef.current,
        activeId: activeIdRef.current,
        view,
        bgScope,
      })
        // doc.bump keeps old deployments functional; revision-aware peers ignore
        // the duplicate refresh produced by Postgres Changes.
        .then(() => {
          if (cloudProjectIdRef.current !== pid) return;
          setCloudError((current) =>
            current?.startsWith("Live collaboration save failed:") ? null : current,
          );
          collabRef.current?.sendRefresh();
        })
        .catch((error) => {
          if (cloudProjectIdRef.current !== pid || !canEditRef.current) return;
          pendingDocSyncRef.current = true;
          const detail = error instanceof Error ? error.message : t("app.unknownError");
          setCloudError(
            t("app.liveSaveFailed", { detail }),
          );
          if (cloudSyncTimerRef.current !== null) {
            window.clearTimeout(cloudSyncTimerRef.current);
          }
          cloudSyncTimerRef.current = window.setTimeout(() => {
            cloudSyncTimerRef.current = null;
            setCloudSyncRetry((value) => value + 1);
          }, 2_000);
        });
    }, 250);
    return () => {
      if (cloudSyncTimerRef.current !== null) {
        window.clearTimeout(cloudSyncTimerRef.current);
        cloudSyncTimerRef.current = null;
      }
    };
  }, [
    t,
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    bgScope,
    cloudSyncRetry,
    queueCloudSave,
  ]);

  const applySnapshot = useCallback((s: DocSnapshot) => {
    applyingHistoryRef.current = true;
    presentRef.current = s;
    setMeta(s.meta);
    setTimingPoints(s.timingPoints);
    setDifficulties(s.difficulties);
    setActiveId(id => s.difficulties.some(d => d.id === id) ? id : s.difficulties[0]?.id ?? id);
  }, []);

  const undo = useCallback(() => {
    if (sessionActiveRef.current) {
      const op = opUndoRef.current.pop();
      if (!op) return;
      const inv = invertNoteOp(op);
      markStructural();
      setDifficulties((prev) => applyNoteOp(prev, inv));
      opRedoRef.current.push(op);
      collabRef.current?.sendOp(inv);
      bumpHistory((v) => v + 1);
      return;
    }
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    if (presentRef.current) redoStackRef.current.push(presentRef.current);
    applySnapshot(prev);
    bumpHistory((v) => v + 1);
  }, [applySnapshot, markStructural]);

  const redo = useCallback(() => {
    if (sessionActiveRef.current) {
      const op = opRedoRef.current.pop();
      if (!op) return;
      markStructural();
      setDifficulties((prev) => applyNoteOp(prev, op));
      opUndoRef.current.push(op);
      collabRef.current?.sendOp(op);
      bumpHistory((v) => v + 1);
      return;
    }
    const next = redoStackRef.current.pop();
    if (!next) return;
    if (presentRef.current) undoStackRef.current.push(presentRef.current);
    applySnapshot(next);
    bumpHistory((v) => v + 1);
  }, [applySnapshot, markStructural]);

  const canUndo = liveEnabled
    ? opUndoRef.current.length > 0
    : undoStackRef.current.length > 0;
  const canRedo = liveEnabled
    ? opRedoRef.current.length > 0
    : redoStackRef.current.length > 0;

  const historyCurrent = liveEnabled ? opUndoRef.current.length : undoStackRef.current.length;
  const historyEntries = useMemo(() => {
    void historyRevision;
    if (modal !== "history" && !historyPanel) return [];
    if (liveEnabled) {
      const names = new Map(difficulties.map(d => [d.id, d.name]));
      return [t("app.historyStart"), ...[...opUndoRef.current, ...opRedoRef.current.slice().reverse()].map(op => describeNoteOp(op, names))];
    }
    const states = [...undoStackRef.current, presentRef.current ?? snapshot, ...redoStackRef.current.slice().reverse()];
    return states.map((s, i) => i === 0 ? t("app.historyStart") : describeSnapshotChange(states[i - 1], s));
  }, [modal, historyPanel, liveEnabled, difficulties, snapshot, historyRevision, t]);

  const jumpHistory = useCallback((index: number) => {
    if (!canEditRef.current) return;
    if (sessionActiveRef.current) {
      if (!Number.isInteger(index) || index < 0 || index > opUndoRef.current.length + opRedoRef.current.length) return;
      const operations: NoteOp[] = [];
      while (opUndoRef.current.length > index) {
        const op = opUndoRef.current.pop()!;
        opRedoRef.current.push(op); operations.push(invertNoteOp(op));
      }
      while (opUndoRef.current.length < index) {
        const op = opRedoRef.current.pop()!;
        opUndoRef.current.push(op); operations.push(op);
      }
      if (!operations.length) return;
      markStructural();
      setDifficulties(prev => operations.reduce((state, op) => applyNoteOp(state, op), prev));
      for (const op of operations) collabRef.current?.sendOp(op);
    } else {
      if (!presentRef.current || index === undoStackRef.current.length) return;
      const result = jumpSnapshotHistory(undoStackRef.current, presentRef.current, redoStackRef.current, index);
      if (!result) return;
      undoStackRef.current = result.past; redoStackRef.current = result.future;
      applySnapshot(result.present);
    }
    bumpHistory(v => v + 1);
  }, [applySnapshot, markStructural]);

  const applySavedProject = useCallback((saved: SavedProject) => {
    applyingHistoryRef.current = true;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setProjectStarted(true);
    setMeta(saved.meta);
    setTimingPoints(normalizeTimingPoints(saved.timingPoints));

    const restoredAudio: Record<string, LoadedFile> = {};
    for (const a of saved.audioFiles ?? []) {
      restoredAudio[a.name] = {
        name: a.name,
        url: URL.createObjectURL(a.blob),
        blob: a.blob,
      };
    }
    const legacyAudio =
      !saved.audioFiles?.length && saved.audio ? saved.audio : null;
    if (legacyAudio) {
      restoredAudio[legacyAudio.name] = {
        name: legacyAudio.name,
        url: URL.createObjectURL(legacyAudio.blob),
        blob: legacyAudio.blob,
      };
    }
    setAudioFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return restoredAudio;
    });

    const restoredDiffs = (legacyAudio
      ? saved.difficulties.map((d) =>
          d.audioFilename ? d : { ...d, audioFilename: legacyAudio.name },
        )
      : saved.difficulties
    ).map((d) => ({
      ...d,
      timingPoints: normalizeTimingPoints(d.timingPoints),
    }));
    setDifficulties(restoredDiffs);
    setActiveId(
      restoredDiffs.some((d) => d.id === saved.activeId)
        ? saved.activeId
        : (restoredDiffs[0]?.id ?? saved.activeId),
    );
    const isLegacyView = "zoom" in saved.view;
    setView(loadViewPreferences() ?? {
      ...DEFAULT_VIEW,
      snapDivisor: saved.view.snapDivisor,
      scrollSpeed: isLegacyView
        ? DEFAULT_VIEW.scrollSpeed
        : Math.round(
            Math.min(
              MAX_SCROLL_SPEED,
              Math.max(MIN_SCROLL_SPEED, saved.view.scrollSpeed),
            ),
          ),
    });
    setBgScope(saved.bgScope);

    const restoredBgFiles: Record<string, LoadedFile> = {};
    if (saved.backgroundFiles?.length) {
      for (const bg of saved.backgroundFiles) {
        restoredBgFiles[bg.name] = {
          name: bg.name,
          url: URL.createObjectURL(bg.blob),
          blob: bg.blob,
        };
      }
    } else if (saved.background) {
      const bg = saved.background;
      restoredBgFiles[bg.name] = {
        name: bg.name,
        url: URL.createObjectURL(bg.blob),
        blob: bg.blob,
      };
      setDifficulties((prev) =>
        prev.map((d) =>
          d.backgroundFilename ? d : { ...d, backgroundFilename: bg.name },
        ),
      );
    }
    setBgFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return restoredBgFiles;
    });

    const restoredVideoFiles: Record<string, LoadedFile> = {};
    for (const v of saved.videoFiles ?? []) {
      restoredVideoFiles[v.name] = {
        name: v.name,
        url: URL.createObjectURL(v.blob),
        blob: v.blob,
      };
    }
    setVideoFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return restoredVideoFiles;
    });
    setZenMode(false);
    setReferenceId(null);
    setCloudProjectId(null);
    setCloudOwnerId(null);
    setMyRole(null);
  }, []);

  const loadLocalProject = useCallback(
    async (id: string) => {
      setModal(null);
      setImportingMap(true);
      try {
        const saved = await loadProject(id).catch(() => null);
        if (!saved) return;
        importStartedRef.current = true;
        applySavedProject(saved);
        setLocalProjectId(saved.localId ?? id);
      } finally {
        setImportingMap(false);
      }
    },
    [applySavedProject],
  );

  useEffect(() => {
    const id = window.setTimeout(() => savePreferences(appSettings), 200);
    return () => window.clearTimeout(id);
  }, [appSettings]);

  const accountSettings = useMemo<AccountSettings>(
    () => ({
      version: 1,
      appSettings,
      view,
      volume: audio.volume,
      locale,
      hitsoundSkinSource,
    }),
    [appSettings, view, audio.volume, locale, hitsoundSkinSource],
  );
  const accountSettingsRef = useRef(accountSettings);
  accountSettingsRef.current = accountSettings;

  useEffect(() => {
    const userId = authUser?.id;
    accountSettingsSaveVersionRef.current += 1;
    accountSettingsReadyUserRef.current = null;
    lastCloudSettingsRef.current = null;
    if (!userId) {
      setAccountSyncStatus("idle");
      setAccountSyncError(null);
      return;
    }
    let cancelled = false;
    setAccountSyncStatus("syncing");
    setAccountSyncError(null);
    const local = {
      ...accountSettingsRef.current,
      volume: loadVolume() ?? accountSettingsRef.current.volume,
    };
    void loadAccountSettings(userId)
      .then(async (remote) => {
        if (cancelled) return;
        const next = remote
          ? normalizeAccountSettings(remote, local)
          : local;
        const applied = {
          ...next,
          appSettings: normalizeAppSettings(next.appSettings),
        };
        if (remote) {
          setAppSettings(applied.appSettings);
          setView(applied.view);
          setAudioVolume(applied.volume);
          setLocale(applied.locale);
          setHitsoundSkinSource(applied.hitsoundSkinSource);
        } else {
          await saveAccountSettings(userId, applied);
        }
        if (cancelled) return;
        lastCloudSettingsRef.current = JSON.stringify(applied);
        accountSettingsReadyUserRef.current = userId;
        setAccountSyncStatus("synced");
      })
      .catch((error) => {
        if (cancelled) return;
        setAccountSyncError(
          error instanceof Error ? error.message : "Cloud settings sync failed.",
        );
        setAccountSyncStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, setAudioVolume, setLocale]);

  useEffect(() => {
    const userId = authUser?.id;
    if (!userId || accountSettingsReadyUserRef.current !== userId) return;
    const serialized = JSON.stringify(accountSettings);
    if (serialized === lastCloudSettingsRef.current) return;
    const version = ++accountSettingsSaveVersionRef.current;
    const id = window.setTimeout(() => {
      setAccountSyncStatus("syncing");
      setAccountSyncError(null);
      const save = accountSettingsSaveQueueRef.current
        .catch(() => {})
        .then(() => saveAccountSettings(userId, accountSettings));
      accountSettingsSaveQueueRef.current = save.catch(() => {});
      void save
        .then(() => {
          if (
            authUserRef.current?.id !== userId ||
            accountSettingsSaveVersionRef.current !== version
          ) {
            return;
          }
          lastCloudSettingsRef.current = serialized;
          setAccountSyncStatus("synced");
        })
        .catch((error) => {
          if (
            authUserRef.current?.id !== userId ||
            accountSettingsSaveVersionRef.current !== version
          ) {
            return;
          }
          setAccountSyncError(
            error instanceof Error ? error.message : "Cloud settings sync failed.",
          );
          setAccountSyncStatus("error");
        });
    }, 800);
    return () => window.clearTimeout(id);
  }, [authUser?.id, accountSettings]);

  useLayoutEffect(() => {
    setPerformanceMode(appSettings.performanceMode);
  }, [appSettings.performanceMode]);

  useEffect(() => {
    setUiSoundsEnabled(appSettings.uiSoundsEnabled);
  }, [appSettings.uiSoundsEnabled]);
  useEffect(() => {
    setUiSoundVolume(appSettings.uiSoundVolume * appSettings.masterVolume);
  }, [appSettings.uiSoundVolume, appSettings.masterVolume]);

  useEffect(() => {
    return installUiSoundInteractions();
  }, []);

  // Runs under the session intro, which waits for it before lifting.
  const [chunksReady, setChunksReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    preloadUiSounds();
    void preloadLazyChunks().then(() => {
      if (!cancelled) setChunksReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exportCheck || pendingImport || showHomeConfirm)
      playUiSound("areYouSure");
  }, [exportCheck, pendingImport, showHomeConfirm]);

  useEffect(() => {
    const id = window.setTimeout(() => saveViewPreferences(view), 200);
    return () => window.clearTimeout(id);
  }, [view]);

  const skinLoadedRef = useRef(false);
  const hitsoundSkinLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshSkinLibrary();
      const rec = await loadSkinBlob().catch(() => null);
      if (!cancelled && rec) {
        const { importOsk } = await import("./lib/skinImport");
        const loaded = await importOsk(rec.blob, rec.name).catch(() => null);
        if (!cancelled && loaded) setSkin(loaded);
      }
      const hitsoundRec = await loadHitsoundSkinBlob().catch(() => null);
      if (!cancelled && hitsoundRec) {
        const { importOsk } = await import("./lib/skinImport");
        const loaded = await importOsk(hitsoundRec.blob, hitsoundRec.name).catch(
          () => null,
        );
        if (!cancelled && loaded) setHitsoundSkin(loaded);
      }
      if (!cancelled) skinLoadedRef.current = true;
      if (!cancelled) hitsoundSkinLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSkinLibrary]);

  useEffect(() => {
    if (!skinLoadedRef.current) return;
    void saveSkinBlob(skin ? { name: skin.fileName, blob: skin.blob } : null);
  }, [skin]);

  useEffect(() => {
    if (!hitsoundSkinLoadedRef.current) return;
    void saveHitsoundSkinBlob(
      hitsoundSkin
        ? { name: hitsoundSkin.fileName, blob: hitsoundSkin.blob }
        : null,
    );
  }, [hitsoundSkin]);

  useEffect(() => {
    saveHitsoundSkinSource(hitsoundSkinSource);
  }, [hitsoundSkinSource]);

  useEffect(() => {
    const v = loadVolume();
    if (v !== null) setAudioVolume(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => saveVolume(audio.volume), 200);
    return () => window.clearTimeout(id);
  }, [audio.volume]);

  const hasAudioRef = useRef(false);
  hasAudioRef.current = !!audioFile;
  const modalRef = useRef<ModalId>(null);
  modalRef.current = modal;
  const editorKeybinds = useMemo(
    () => normalizeEditorKeybinds(appSettings.editorKeybinds),
    [appSettings.editorKeybinds],
  );
  const editorKeybindsRef = useRef(editorKeybinds);
  editorKeybindsRef.current = editorKeybinds;
  const projectStartedRef = useRef(false);
  projectStartedRef.current = projectStarted;
  const slowHeldRef = useRef(false);
  useEffect(() => {
    const shouldIgnoreHotkey = (e: KeyboardEvent) => {
      if (playtestRef.current.active) return true;
      if (!projectStartedRef.current) return true;
      if (modalRef.current || askBgScope || dialogIsOpen()) return true;
      if (!isTypingTarget(e.target)) return false;
      return (e.target as HTMLInputElement).type !== "range";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const binds = editorKeybindsRef.current;
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;
      const is = (action: EditorAction) => matchesBind(e.code, binds[action]);
      const isSpace = is("playPause");
      const isTab = is("zenMode");
      const isUp = is("volumeUp");
      const isDown = is("volumeDown");
      const symbolZoom = noMod ? timelineZoomDirection(e.key) : 0;
      const isTimelineZoomOut =
        is("scrollSpeedDown") || symbolZoom === -1;
      const isTimelineZoomIn = is("scrollSpeedUp") || symbolZoom === 1;
      const isPreviousBookmark = is("prevBookmark");
      const isNextBookmark = is("nextBookmark");
      const isZoomIn = noMod && is("zoomIn");
      const isZoomOut = noMod && is("zoomOut");
      const isSlow = noMod && is("slowMo");
      const isBookmark = noMod && is("addBookmark");
      const snapDivisor = noMod ? snapDivisorForBind(e.code, binds) : null;
      if (
        !isSpace &&
        !isTab &&
        !isUp &&
        !isDown &&
        !isTimelineZoomOut &&
        !isTimelineZoomIn &&
        !isPreviousBookmark &&
        !isNextBookmark &&
        !isZoomIn &&
        !isZoomOut &&
        !isSlow &&
        !isBookmark &&
        snapDivisor === null
      )
        return;
      if (shouldIgnoreHotkey(e)) return;
      if (
        !hasAudioRef.current &&
        !isTab &&
        !isTimelineZoomOut &&
        !isTimelineZoomIn &&
        !isZoomIn &&
        !isZoomOut &&
        snapDivisor === null
      )
        return;
      e.preventDefault();
      blurActiveControl();
      if (isTab)
        setZenMode((z) => {
          announceShortcut(osdToggle(t("osd.zenMode"), !z, [editorKeyLabel(binds.zenMode)]));
          return !z;
        });
      else if (isPreviousBookmark) {
        seekBookmark("previous");
        announceShortcut({
          label: t("osd.bookmarks"),
          value: t("osd.previous"),
          keys: [editorKeyLabel(binds.prevBookmark)],
        });
      }
      else if (isNextBookmark) {
        seekBookmark("next");
        announceShortcut({
          label: t("osd.bookmarks"),
          value: t("osd.next"),
          keys: [editorKeyLabel(binds.nextBookmark)],
        });
      }
      else if (isBookmark) {
        if (!e.repeat) {
          addBookmark(Math.round(currentTimeRef.current));
          announceShortcut({
            label: t("osd.bookmarks"),
            value: t("osd.added"),
            keys: [editorKeyLabel(binds.addBookmark)],
          });
        }
      } else if (isSpace) {
        if (!e.repeat) toggleAudio();
      }
      else if (isSlow) {
        if (slowHeldRef.current || e.repeat) return;
        slowHeldRef.current = true;
        setAudioPlaybackRate(0.25);
        announceShortcut(
          osdRange(t("osd.playbackRate"), "25%", 0.25, 0, 1, [editorKeyLabel(binds.slowMo)]),
        );
      }
      else if (isUp || isDown) {
        const volume = Math.max(
          0,
          Math.min(1, audioVolumeRef.current + (isUp ? 0.05 : -0.05)),
        );
        setAudioVolume(volume);
        setVolumeHudKey((value) => value + 1);
      }
      else if (snapDivisor !== null) {
        setView((v) => ({ ...v, snapDivisor }));
        announceShortcut({
          label: t("osd.snap"),
          value: snapDivisor === 0 ? t("transport.snapFree") : `1/${snapDivisor}`,
          keys: [editorKeyLabel(e.code)],
        });
      }
      else if (isTimelineZoomOut || isTimelineZoomIn) {
        setView((v) => {
          const scrollSpeed = Math.max(
            MIN_SCROLL_SPEED,
            Math.min(
              MAX_SCROLL_SPEED,
              v.scrollSpeed + (isTimelineZoomIn ? 1 : -1),
            ),
          );
          announceShortcut(
            osdRange(t("osd.timelineZoom"), String(scrollSpeed), scrollSpeed, MIN_SCROLL_SPEED, MAX_SCROLL_SPEED, [
              editorKeyLabel(binds.scrollSpeedDown),
              editorKeyLabel(binds.scrollSpeedUp),
            ]),
          );
          return { ...v, scrollSpeed };
        });
      } else if (isZoomIn || isZoomOut) {
        setAppSettings((s) => {
          const playfieldScale = Math.round(
            Math.max(
              0.5,
              Math.min(2.5, s.playfieldScale + (isZoomIn ? 0.1 : -0.1)),
            ) * 100,
          ) / 100;
          announceShortcut(
            osdRange(t("osd.playfieldSize"), `${Math.round(playfieldScale * 100)}%`, playfieldScale, MIN_PLAYFIELD_SCALE, MAX_PLAYFIELD_SCALE, [
              editorKeyLabel(binds.zoomOut),
              editorKeyLabel(binds.zoomIn),
            ]),
          );
          return { ...s, playfieldScale };
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (
        !matchesBind(e.code, editorKeybindsRef.current.slowMo) ||
        !slowHeldRef.current
      )
        return;
      slowHeldRef.current = false;
      e.preventDefault();
      setAudioPlaybackRate(1);
      announceShortcut(
        osdRange(t("osd.playbackRate"), "100%", 1, 0, 1, [
          editorKeyLabel(editorKeybindsRef.current.slowMo),
        ]),
      );
    };
    const onBlur = () => {
      if (!slowHeldRef.current) return;
      slowHeldRef.current = false;
      setAudioPlaybackRate(1);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    t,
    addBookmark,
    announceShortcut,
    askBgScope,
    seekBookmark,
    setAudioPlaybackRate,
    setAudioVolume,
    toggleAudio,
  ]);

  useEffect(() => {
    const onBareAlt = (e: KeyboardEvent) => {
      if (
        e.key !== "Alt" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        isTypingTarget(e.target)
      )
        return;
      e.preventDefault();
      blurActiveControl();
    };
    window.addEventListener("keydown", onBareAlt, true);
    window.addEventListener("keyup", onBareAlt, true);
    return () => {
      window.removeEventListener("keydown", onBareAlt, true);
      window.removeEventListener("keyup", onBareAlt, true);
    };
  }, []);

  useEffect(() => {
    const onDevtoolsKey = (e: KeyboardEvent) => {
      if (e.key !== "F12") return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onDevtoolsKey, true);
    return () => window.removeEventListener("keydown", onDevtoolsKey, true);
  }, []);

  const isAudioFile = (f: File) =>
    f.type.startsWith("audio/") || /\.(mp3|ogg)$/i.test(f.name);
  const isImageFile = (f: File) =>
    f.type.startsWith("image/") || /\.(png|jpe?g|gif)$/i.test(f.name);
  const isVideoFile = (f: File) =>
    f.type.startsWith("video/") ||
    /\.(mp4|webm|avi|flv|mov|wmv|m4v|mpe?g)$/i.test(f.name);
  const isOszFile = (f: File) => /\.(osz|zip|mcz)$/i.test(f.name);
  const isOsuFile = (f: File) => /\.osu$/i.test(f.name);
  const isOskFile = (f: File) => /\.osk$/i.test(f.name);
  const isSmFile = (f: File) => /\.(sm|ssc)$/i.test(f.name);
  const isSingleChartFile = (f: File) => /\.(qua|mc)$/i.test(f.name);

  const resetFileDrag = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (dragDepthRef.current === 0) dragDepthRef.current = 1;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e.dataTransfer) && dragDepthRef.current === 0) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  useEffect(() => {
    const onDocumentDragLeave = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer) && dragDepthRef.current === 0)
        return;
      if (e.relatedTarget === null) resetFileDrag();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") resetFileDrag();
    };

    document.addEventListener("dragleave", onDocumentDragLeave);
    document.addEventListener("dragend", resetFileDrag);
    document.addEventListener("drop", resetFileDrag);
    window.addEventListener("blur", resetFileDrag);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("dragleave", onDocumentDragLeave);
      document.removeEventListener("dragend", resetFileDrag);
      document.removeEventListener("drop", resetFileDrag);
      window.removeEventListener("blur", resetFileDrag);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [resetFileDrag]);

  const openFiles = useCallback(
    (files: File[]) => {
      const osk = files.find(isOskFile);
      if (osk) {
        void onSkinFile(osk, "visual");
        return;
      }
      const osz = files.find(isOszFile);
      if (osz) {
        void importArchive(osz);
        return;
      }
      const osus = files.filter(isOsuFile);
      if (osus.length) {
        void openOsuFiles(osus);
        return;
      }
      const sm = files.find(isSmFile);
      if (sm) {
        requestImportSm(sm);
        return;
      }
      const qua = files.find(isSingleChartFile);
      if (qua) {
        requestImportQua(qua);
        return;
      }
      const audioF = files.find(isAudioFile);
      if (audioF) {
        onAudioFile(audioF);
        setAutoTimeOpen(true);
        setAutoTimeStatus("idle");
        setAutoTimeResult(null);
      }
      const image = files.find(isImageFile);
      if (image) onBackgroundFile(image);
      const videoF = files.find(isVideoFile);
      if (videoF) onVideoFile(videoF);
    },
    [onAudioFile, onBackgroundFile, onVideoFile, onSkinFile, importArchive, openOsuFiles, requestImportSm, requestImportQua],
  );

  useEffect(() => setLaunchFileConsumer(openFiles), [openFiles]);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let stop: (() => void) | null = null;
    let live = true;
    void watchLaunchFiles(openFiles).then((unlisten) => {
      if (live) stop = unlisten;
      else unlisten();
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [openFiles]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      resetFileDrag();

      if (e.dataTransfer.items?.length) {
        const entries = Array.from(e.dataTransfer.items)
          .map((item) => item.webkitGetAsEntry())
          .filter((entry): entry is FileSystemEntry => !!entry);
        if (entries.some((entry) => entry.isDirectory)) {
          setImportingMap(true);
          try {
            const { scanPackFromDrop } = await import("./lib/smPackImport");
            const songs = await scanPackFromDrop(entries);
            if (songs.length === 1) {
              importPackSong(songs[0]);
              setImportingMap(false);
              return;
            }
            if (songs.length > 1) {
              setScannedPackSongs(songs);
              setImportingMap(false);
              setModal("packBrowser");
              return;
            }
          } catch {
            setImportError(t("app.droppedFolderFailed"));
            setImportingMap(false);
            return;
          }
          setImportingMap(false);
        }
      }

      openFiles(Array.from(e.dataTransfer.files));
    },
    [openFiles, importPackSong, resetFileDrag, t],
  );

  const canExport = Object.keys(audioFiles).length > 0 && totalNotes > 0;
  const hasMalodyDifficulty = difficulties.some(
    (difficulty) => difficulty.keyCount <= MALODY_MAX_KEYS,
  );

  useEffect(() => {
    setAudioAmbientDucking(modalAtmosphereActive);
  }, [setAudioAmbientDucking, modalAtmosphereActive]);

  useEffect(() => {
    setMenuMusicDucking(modalAtmosphereOpen);
  }, [setMenuMusicDucking, modalAtmosphereOpen]);

  useEffect(() => {
    if (!menuMusicEnabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      const letter = e.key.length === 1 ? e.key.toLowerCase() : "";
      const arrow =
        (e.key === "ArrowLeft" || e.key === "ArrowRight") && !dialogIsOpen()
          ? e.key
          : "";
      const action =
        letter === "c"
          ? toggleMenuMusic
          : letter === "v" || arrow === "ArrowLeft"
            ? nextMenuTrack
            : letter === "x" || arrow === "ArrowRight"
              ? previousMenuTrack
              : null;
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuMusicEnabled, toggleMenuMusic, nextMenuTrack, previousMenuTrack]);

  const openMapCard = useCallback((start: MapCardPresetOption | null = null) => {
    setMapCardStart(start);
    setModal("mapCard");
  }, []);

  const offerMapCard = useCallback((target: string) => {
    if (appSettingsRef.current.offerMapCardAfterExport) {
      setMapCardOffer({ target, open: true });
    }
  }, []);

  const doExportOsu = useCallback((songMeta: SongMeta = meta) => {
    if (!audioFile) return;
    downloadOsu({
      meta: songMeta,
      difficulty: active,
      timingPoints: activeTimingPoints,
      audioFilename: audioFile.name,
      backgroundFilename: active.backgroundFilename,
      videoFilename: active.videoFilename,
      videoOffsetMs: active.videoOffsetMs,
      cascadeTag: appSettings.addCascadeTag,
    });
    playUiSound("mapExportDone");
    void logAnalyticsEvent("export_osu", authUser?.id).catch(() => {});
    offerMapCard(".osu");
  }, [
    audioFile,
    active,
    activeTimingPoints,
    meta,
    authUser?.id,
    appSettings.addCascadeTag,
    offerMapCard,
  ]);

  const doExportSm = useCallback(async (songMeta: SongMeta = meta) => {
    if (Object.keys(audioFiles).length === 0) return;
    setExporting(true);
    setImportError(null);
    try {
      const { downloadSmZip } = await import("./lib/smExport");
      await downloadSmZip({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
      });
      playUiSound("mapExportDone");
      void logAnalyticsEvent("export_sm", authUser?.id).catch(() => {});
      offerMapCard(".sm");
    } catch (error) {
      setImportError(
        error instanceof Error
          ? t("app.exportFailedDetail", { format: "StepMania", detail: error.message })
          : t("app.exportFailed", { format: "StepMania" }),
      );
    } finally {
      setExporting(false);
    }
  }, [meta, difficulties, timingPoints, audioFiles, bgFiles, authUser?.id, t, offerMapCard]);

  const doExportQua = useCallback(async (songMeta: SongMeta = meta) => {
    if (!audioFile || (active.keyCount !== 4 && active.keyCount !== 7)) return;
    setImportError(null);
    try {
      const { downloadQua } = await import("./lib/qua");
      downloadQua({
        meta: songMeta,
        difficulty: active,
        timingPoints: activeTimingPoints,
        audioFilename: audioFile.name,
        backgroundFilename: active.backgroundFilename,
        bpmAffectsScroll: appSettings.bpmAffectsScroll,
      });
      playUiSound("mapExportDone");
      offerMapCard(".qua");
    } catch (error) {
      setImportError(
        error instanceof Error
          ? t("app.exportFailedDetail", { format: "Quaver", detail: error.message })
          : t("app.exportFailed", { format: "Quaver" }),
      );
    }
  }, [
    t,
    audioFile,
    active,
    activeTimingPoints,
    meta,
    appSettings.bpmAffectsScroll,
    offerMapCard,
  ]);

  const doExportMcz = useCallback(async (songMeta: SongMeta = meta) => {
    if (Object.keys(audioFiles).length === 0) return;
    setExporting(true);
    setImportError(null);
    try {
      const { downloadMcz } = await import("./lib/malody");
      await downloadMcz({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
      });
      playUiSound("mapExportDone");
      offerMapCard(".mcz");
    } catch (error) {
      setImportError(
        t("malody.exportFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setExporting(false);
    }
  }, [meta, difficulties, timingPoints, audioFiles, bgFiles, t, offerMapCard]);

  const doExportOsz = useCallback(async (songMeta: SongMeta = meta) => {
    if (Object.keys(audioFiles).length === 0) return;
    setExporting(true);
    setImportError(null);
    setExportProgress({ ratio: 0, label: t("app.startingEncoder") });
    try {
      const { downloadOsz } = await import("./lib/oszExport");
      await downloadOsz({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
        videoFiles,
        jpegQuality: appSettings.exportPngBackgroundsAsJpeg
          ? appSettings.exportJpegQuality
          : undefined,
        cascadeTag: appSettings.addCascadeTag,
        onProgress: setExportProgress,
      });
      playUiSound("mapExportDone");
      void logAnalyticsEvent("export_osz", authUser?.id).catch(() => {});
      offerMapCard(".osz");
    } catch (error) {
      setImportError(
        error instanceof Error
          ? t("app.exportFailedDetail", { format: "OSZ", detail: error.message })
          : t("app.exportFailed", { format: "OSZ" }),
      );
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [
    t,
    audioFiles,
    difficulties,
    bgFiles,
    videoFiles,
    meta,
    timingPoints,
    authUser?.id,
    appSettings.exportPngBackgroundsAsJpeg,
    appSettings.exportJpegQuality,
    appSettings.addCascadeTag,
    offerMapCard,
  ]);

  const checkAndExport = useCallback(
    (
      target: string,
      songMeta: SongMeta,
      run: (songMeta: SongMeta) => void,
    ) => {
      const result = validateProject({
        meta: songMeta,
        difficulties,
        audioFiles,
        bgFiles,
        target,
      });
      if (result.errors.length > 0 || result.warnings.length > 0) {
        setExportCheck({ result, target, run: () => run(songMeta) });
      } else {
        run(songMeta);
      }
    },
    [difficulties, audioFiles, bgFiles],
  );

  const requestExport = useCallback(
    (target: string, run: (songMeta: SongMeta) => void) => {
      const choice = chooseMapperName(meta.creator, authUser?.username);
      if (choice.kind === "ask") {
        setMapperPrompt({ target, run });
        return;
      }
      if (choice.kind === "keep") {
        checkAndExport(target, meta, run);
        return;
      }
      const named = { ...meta, creator: choice.name };
      setMeta(named);
      checkAndExport(target, named, run);
    },
    [meta, authUser?.username, checkAndExport],
  );

  const confirmMapperName = useCallback(
    (name: string) => {
      if (!mapperPrompt) return;
      const { target, run } = mapperPrompt;
      setMapperPrompt(null);
      const named = { ...meta, creator: name };
      setMeta(named);
      checkAndExport(target, named, run);
    },
    [mapperPrompt, meta, checkAndExport],
  );

  const handleExportOsu = useCallback(
    () => requestExport(".osu", doExportOsu),
    [requestExport, doExportOsu],
  );
  const handleExportOsz = useCallback(
    () => requestExport(".osz", (songMeta) => void doExportOsz(songMeta)),
    [requestExport, doExportOsz],
  );
  const handleExportSm = useCallback(
    () => requestExport(".sm", (songMeta) => void doExportSm(songMeta)),
    [requestExport, doExportSm],
  );
  const handleExportQua = useCallback(
    () => requestExport(".qua", (songMeta) => void doExportQua(songMeta)),
    [requestExport, doExportQua],
  );

  const handleExportMcz = useCallback(
    () => requestExport(".mcz", (songMeta) => void doExportMcz(songMeta)),
    [requestExport, doExportMcz],
  );

  const ensureOsuFolder = useCallback(async () => {
    const current = await osuStatus();
    setOsuApp(current);
    if (current.installed) return true;
    const picked = await osuChooseRoot();
    setOsuApp(picked);
    return picked.installed;
  }, []);

  const doSendToOsu = useCallback(async (songMeta: SongMeta = meta) => {
    if (Object.keys(audioFiles).length === 0) return;
    if (!(await ensureOsuFolder())) return;
    setOsuBusy(true);
    setImportError(null);
    setExportProgress({ ratio: 0, label: t("app.startingEncoder") });
    try {
      const { buildOsz } = await import("./lib/oszExport");
      const archive = await buildOsz({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
        videoFiles,
        jpegQuality: appSettings.exportPngBackgroundsAsJpeg
          ? appSettings.exportJpegQuality
          : undefined,
        cascadeTag: appSettings.addCascadeTag,
        onProgress: setExportProgress,
      });
      await osuSendMap(archive, setFilename(songMeta));
      playUiSound("mapExportDone");
      setImportNotice(t("osu.sent"));
      void logAnalyticsEvent("export_to_osu", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : t("osu.sendFailed"),
      );
    } finally {
      setOsuBusy(false);
      setExportProgress(null);
    }
  }, [
    audioFiles,
    difficulties,
    bgFiles,
    videoFiles,
    meta,
    timingPoints,
    appSettings.exportPngBackgroundsAsJpeg,
    appSettings.exportJpegQuality,
    appSettings.addCascadeTag,
    ensureOsuFolder,
    t,
  ]);

  const handleSendToOsu = useCallback(
    () => requestExport("to osu!", (songMeta) => void doSendToOsu(songMeta)),
    [requestExport, doSendToOsu],
  );

  const doSyncToOsu = useCallback(async (songMeta: SongMeta = meta) => {
    if (Object.keys(audioFiles).length === 0) return;
    if (!(await ensureOsuFolder())) return;
    setOsuBusy(true);
    setImportError(null);
    setExportProgress({ ratio: 0, label: t("app.startingEncoder") });
    try {
      const { buildOsz } = await import("./lib/oszExport");
      const archive = await buildOsz({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
        videoFiles,
        jpegQuality: appSettings.exportPngBackgroundsAsJpeg
          ? appSettings.exportJpegQuality
          : undefined,
        cascadeTag: appSettings.addCascadeTag,
        onProgress: setExportProgress,
      });
      await osuSyncMap(
        archive,
        osuFolderName(songMeta.artist, songMeta.title),
      );
      playUiSound("mapExportDone");
      setImportNotice(t("osu.synced"));
      void logAnalyticsEvent("sync_to_osu", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : t("osu.syncFailed"),
      );
    } finally {
      setOsuBusy(false);
      setExportProgress(null);
    }
  }, [
    audioFiles,
    difficulties,
    bgFiles,
    videoFiles,
    meta,
    timingPoints,
    appSettings.exportPngBackgroundsAsJpeg,
    appSettings.exportJpegQuality,
    appSettings.addCascadeTag,
    ensureOsuFolder,
    t,
  ]);

  const handleSyncToOsu = useCallback(
    () =>
      requestExport("into Songs", (songMeta) => void doSyncToOsu(songMeta)),
    [requestExport, doSyncToOsu],
  );

  const handleLoadFromOsu = useCallback(async () => {
    if (!(await ensureOsuFolder())) return;
    setOsuBusy(true);
    setImportError(null);
    try {
      const selected = await osuSelectedMap();
      const archive = await osuReadMap(selected.folder);
      const file = new File([archive], `${selected.folder}.osz`, {
        type: "application/x-osu-archive",
      });
      if (hasProjectContent) {
        setPendingImport(file);
      } else {
        await importMapFile(file);
        setImportNotice(t("osu.loaded", { name: osuMapLabel(selected) }));
      }
      void logAnalyticsEvent("import_from_osu", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : t("osu.loadFailed"),
      );
    } finally {
      setOsuBusy(false);
    }
  }, [ensureOsuFolder, hasProjectContent, importMapFile, t]);

  // Offered wherever the user is about to choose a map from somewhere else, so
  // the one already open in song select is one click away.
  const osuSelected = osuLive.connected ? osuLive.map : null;
  const osuOpenProps = osuSelected
    ? {
        map: osuSelected,
        busy: osuBusy || importingMap,
        onOpen: () => {
          // Harmless on the start screen, where no dialog is open.
          setModal(null);
          void handleLoadFromOsu();
        },
      }
    : null;
  const osuPrompt = osuOpenProps ? <OsuOpenPrompt {...osuOpenProps} /> : null;
  const osuBanner = osuOpenProps ? (
    <OsuOpenPrompt {...osuOpenProps} variant="slab" />
  ) : null;

  const importFile = useCallback(
    (file: File) => {
      if (/\.(sm|ssc)$/i.test(file.name)) {
        void importSmFile(file);
      } else if (/\.(qua|mc)$/i.test(file.name)) {
        void importQuaFile(file);
      } else if (/\.osu$/i.test(file.name)) {
        void importOsuProjectFile(file);
      } else {
        void importMapFile(file);
      }
    },
    [importSmFile, importQuaFile, importOsuProjectFile, importMapFile],
  );

  const confirmImportWithoutExport = useCallback(() => {
    if (!pendingImport) return;
    const file = pendingImport;
    setPendingImport(null);
    importFile(file);
  }, [pendingImport, importFile]);

  const confirmExportAndImport = useCallback(async () => {
    if (!pendingImport) return;
    const file = pendingImport;
    setPendingImport(null);
    try {
      await doExportOsz();
      importFile(file);
    } catch {
      setImportError(t("app.exportBeforeImportFailed"));
    }
  }, [pendingImport, doExportOsz, importFile, t]);

  const cancelPendingImport = useCallback(() => {
    setPendingImport(null);
  }, []);

  const openPendingOsuAsMap = useCallback(() => {
    const entry = pendingOsuDiffs?.[0];
    if (!entry) return;
    setPendingOsuDiffs(null);
    if (hasProjectContent) setPendingImport(entry.file);
    else openOsuAsProject([entry]);
  }, [pendingOsuDiffs, hasProjectContent, openOsuAsProject]);

  const removeDuplicates = useCallback(() => {
    if (!exportCheck || !canEditRef.current) return;
    const dupMap = exportCheck.result.duplicateNoteIds;
    const nextDiffs = difficulties.map((d) => {
      const ids = new Set(dupMap[d.id] ?? []);
      return ids.size
        ? { ...d, notes: d.notes.filter((n) => !ids.has(n.id)) }
        : d;
    });
    markStructural();
    setDifficulties(nextDiffs);
    const result = validateProject({
      meta,
      difficulties: nextDiffs,
      audioFiles,
      bgFiles,
      target: exportCheck.target,
    });
    setExportCheck((check) => (check ? { ...check, result } : check));
  }, [exportCheck, difficulties, meta, audioFiles, bgFiles, markStructural]);

  const buildSavedProject = useCallback((): SavedProject => ({
    version: PROJECT_VERSION,
    savedAt: Date.now(),
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    appSettings,
    bgScope,
    audioFiles: Object.values(audioFiles).map((f) => ({
      name: f.name,
      blob: f.blob,
    })),
    backgroundFiles: Object.values(bgFiles).map((f) => ({
      name: f.name,
      blob: f.blob,
    })),
    videoFiles: Object.values(videoFiles).map((f) => ({
      name: f.name,
      blob: f.blob,
    })),
    background: null,
    skin: skin ? { name: skin.fileName, blob: skin.blob } : null,
  }), [
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    appSettings,
    bgScope,
    audioFiles,
    bgFiles,
    videoFiles,
    skin,
  ]);

  const projectVaultKey = projectStorageKey(localProjectId);

  const handleRestoreSnapshot = useCallback(
    async (stamp: string) => {
      const snapshot = await restoreSnapshot(projectVaultKey, stamp);
      const current = buildSavedProject();
      applySavedProject({
        ...snapshot,
        // Snapshots hold the chart only, so keep the media that is loaded.
        // Restoring notes and timing must never drop the audio.
        audioFiles: current.audioFiles,
        audio: current.audio,
        backgroundFiles: current.backgroundFiles,
        videoFiles: current.videoFiles,
        background: current.background,
        skin: current.skin,
      });
    },
    [projectVaultKey, buildSavedProject, applySavedProject],
  );

  const handleSave = useCallback(async (silent = false) => {
    setSaveStatus("saving");
    if (!silent) requestPersistentStorage();
    try {
      await saveProject(buildSavedProject(), localProjectId);
      setSaveErrorDetail(null);
      setSaveStatus("saved");
    } catch (err) {
      setSaveErrorDetail(describeSaveError(err));
      setSaveStatus("error");
    }
  }, [buildSavedProject, localProjectId]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = window.setTimeout(() => setSaveStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const localAutosaveTimerRef = useRef<number | undefined>(undefined);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const localAutosaveActive =
    projectStarted && appSettings.localAutosaveEnabled && canEdit;
  // Every edit gives handleSave a new identity. The first change arms the
  // timer and later ones leave it running, so steady editing still saves once
  // a minute instead of pushing the save back on every change until a crash.
  useEffect(() => {
    if (!localAutosaveActive || localAutosaveTimerRef.current !== undefined) return;
    localAutosaveTimerRef.current = window.setTimeout(() => {
      localAutosaveTimerRef.current = undefined;
      void handleSaveRef.current(true);
    }, LOCAL_AUTOSAVE_MS);
  }, [localAutosaveActive, handleSave]);

  useEffect(() => {
    if (!localAutosaveActive) return;
    const flush = () => {
      window.clearTimeout(localAutosaveTimerRef.current);
      localAutosaveTimerRef.current = undefined;
      void handleSaveRef.current(true);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);

    return () => {
      // A pending save was armed for the project that was open. Switching
      // projects starts the wait over rather than saving halfway through a load.
      window.clearTimeout(localAutosaveTimerRef.current);
      localAutosaveTimerRef.current = undefined;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [localAutosaveActive, localProjectId]);

  const handleCloudSave = useCallback(async () => {
    if (!authUser) return;
    setCloudSaveStatus("saving");
    setCloudError(null);

    try {
      await refreshAuth();
    } catch {
    }
    const token = getSupabaseToken();
    const claims = token ? decodeJwtClaims(token) : null;
    const expired = !!claims?.exp && Date.now() >= claims.exp * 1000;
    if (!token || !claims || expired) {
      setCloudError(
        `Your osu! session isn't active (token ${
          expired ? "expired" : "missing"
        }). Log out and back in, then save again.`,
      );
      setCloudSaveStatus("error");
      return;
    }

    try {
      await cloudSavePromiseRef.current.catch(() => {});
      const creatingProject = !cloudProjectId;
      const mutationId = crypto.randomUUID();
      if (!creatingProject) ownMutationIdsRef.current.add(mutationId);
      const id = await saveProjectCloud({
        ownerId: authUser.id,
        projectId: cloudProjectId,
        data: { meta, timingPoints, difficulties, activeId, view, bgScope },
        audioFiles: Object.values(audioFiles).map((f) => ({
          name: f.name,
          blob: f.blob,
        })),
        bgFiles: Object.values(bgFiles).map((f) => ({
          name: f.name,
          blob: f.blob,
        })),
        mutationId,
      });
      publishedAssetBlobsRef.current = new Map([
        ...Object.values(audioFiles).map(
          (f) => [`audio:${f.name}`, f.blob] as const,
        ),
        ...Object.values(bgFiles).map(
          (f) => [`bg:${f.name}`, f.blob] as const,
        ),
      ]);
      setCloudProjectId(id);
      if (creatingProject) {
        setCloudOwnerId(authUser.id);
        setMyRole("owner");
      }
      setCloudSaveStatus("saved");
      playUiSound("saveToCloudDone");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Couldn't save to your account.";
      if (/row-level security|violates|not authorized|permission/i.test(msg)) {
        if (claims.sub !== authUser.id) {
          setCloudError(
            "Save rejected: your session token identifies a different account " +
              "than your profile. Log out and back in.",
          );
        } else if (claims.role !== "authenticated") {
          setCloudError(
            `Save rejected: token role is "${claims.role}", expected ` +
              `"authenticated". The Worker is minting tokens incorrectly.`,
          );
        } else {
          setCloudError(
            "Save rejected by the database. Your token looks valid but Supabase " +
              "isn't accepting it - the Worker's SUPABASE_JWT_SECRET must match " +
              "this project's JWT secret (and the legacy JWT secret must stay enabled).",
          );
          console.error(
            "[cloud] RLS rejection with a valid-looking token.",
            "front-end project:",
            import.meta.env.VITE_SUPABASE_URL,
            "| token sub:",
            claims.sub,
            "| role:",
            claims.role,
          );
        }
      } else {
        setCloudError(msg);
      }
      setCloudSaveStatus("error");
    }
  }, [
    authUser,
    refreshAuth,
    cloudProjectId,
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    bgScope,
    audioFiles,
    bgFiles,
  ]);

  const loadCloudProject = useCallback(async (id: string) => {
    setCloudError(null);
    setModal(null);
    setImportingMap(true);
    pendingDocSyncRef.current = false;
    cloudRevisionRef.current = null;
    ownMutationIdsRef.current.clear();
    localEditVersionRef.current = 0;
    try {
      const proj = await loadProjectCloud(id);
      void logAnalyticsEvent("collab_joined", authUserRef.current?.id).catch(
        () => {},
      );
      importStartedRef.current = true;
      applyingHistoryRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      publishedAssetBlobsRef.current = new Map([
        ...proj.audio.map((a) => [`audio:${a.name}`, a.blob] as const),
        ...proj.bg.map((b) => [`bg:${b.name}`, b.blob] as const),
      ]);
      assetAttemptsRef.current.clear();

      const audioReg: Record<string, LoadedFile> = {};
      for (const a of proj.audio) {
        audioReg[a.name] = {
          name: a.name,
          url: URL.createObjectURL(a.blob),
          blob: a.blob,
        };
      }
      setAudioFiles((prev) => {
        Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
        return audioReg;
      });

      const bgReg: Record<string, LoadedFile> = {};
      for (const b of proj.bg) {
        bgReg[b.name] = {
          name: b.name,
          url: URL.createObjectURL(b.blob),
          blob: b.blob,
        };
      }
      setBgFiles((prev) => {
        Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
        return bgReg;
      });
      setVideoFiles((prev) => {
        Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
        return {};
      });

      const d = proj.data;
      setMeta(d.meta);
      setTimingPoints(normalizeTimingPoints(d.timingPoints));
      const diffs = (d.difficulties?.length
        ? d.difficulties
        : [makeDifficulty()]
      ).map((x) => ({
        ...x,
        timingPoints: normalizeTimingPoints(x.timingPoints),
      }));
      setDifficulties(diffs);
      setActiveId(
        diffs.some((x) => x.id === d.activeId) ? d.activeId : diffs[0].id,
      );
      if (d.view) setView({ ...DEFAULT_VIEW, ...d.view });
      setBgScope(d.bgScope ?? "mapset");
      setProjectStarted(true);
      setReferenceId(null);
      setCloudProjectId(proj.id);
      setCloudOwnerId(proj.owner);
      setLocalProjectId(`cloud-${proj.id}`);
      opUndoRef.current = [];
      opRedoRef.current = [];
      const me = authUserRef.current;
      if (me) {
        if (proj.owner === me.id) setMyRole("owner");
        else
          myAccess(proj.id, me.id)
            .then(setMyRole)
            .catch(() => setMyRole(null));
      }
      try {
        const raw = localStorage.getItem(`mania:pos:${proj.id}`);
        if (raw) {
          const pos = JSON.parse(raw) as {
            activeId?: string;
            playheadMs?: number;
          };
          if (pos.activeId && diffs.some((d) => d.id === pos.activeId)) {
            setActiveId(pos.activeId);
          }
          if (typeof pos.playheadMs === "number") {
            pendingSeekRef.current = pos.playheadMs;
          }
        }
      } catch {
      }
    } catch (err) {
      setCloudError(
        err instanceof Error ? err.message : "Couldn't load that map.",
      );
    } finally {
      setImportingMap(false);
    }
  }, []);

  const addInviteNotice = useCallback(async (
    projectId: string,
    notificationId?: string,
  ) => {
    if (projectId === cloudProjectIdRef.current) return;
    if (inviteNoticeProjectsRef.current.has(projectId)) {
      if (notificationId) {
        setInvites((prev) =>
          prev.map((notice) =>
            notice.projectId === projectId && !notice.notificationId
              ? { ...notice, notificationId }
              : notice,
          ),
        );
      }
      return;
    }
    inviteNoticeProjectsRef.current.add(projectId);
    try {
      const rows = await listMyProjectsRich();
      const proj = rows.find((r) => r.id === projectId);
      if (!proj) {
        inviteNoticeProjectsRef.current.delete(projectId);
        return;
      }
      const owner = proj.participants.find((x) => x.role === "owner");
      setInvites((prev) =>
        prev.some((n) => n.projectId === projectId)
          ? prev.map((notice) =>
              notice.projectId === projectId && !notice.notificationId
                ? { ...notice, notificationId }
                : notice,
            )
          : [
              ...prev,
              {
                notificationId,
                projectId,
                title: proj.title || "Untitled",
                who: owner?.username ?? null,
                avatar: owner?.avatar_url ?? null,
              },
            ],
      );
      playUiSound("invite");
    } catch {
      inviteNoticeProjectsRef.current.delete(projectId);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    const userId = authUserRef.current?.id;
    if (!userId) {
      setNotifications([]);
      setNotificationsLoading(false);
      setNotificationsError(null);
      return;
    }
    setNotificationsLoading(true);
    try {
      const rows = await listNotifications();
      if (authUserRef.current?.id !== userId) return;
      setNotifications(rows);
      setNotificationsError(null);
    } catch (error) {
      setNotificationsError(
        error instanceof Error ? error.message : "Couldn't load notifications.",
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authUser) {
      setInvites([]);
      inviteNoticeProjectsRef.current.clear();
      return;
    }
    const ch = supabase
      .channel(`invites:${authUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_collaborators",
          filter: `user_id=eq.${authUser.id}`,
        },
        (payload) => {
          const pid = (payload.new as { project_id?: string })?.project_id;
          if (pid) void addInviteNotice(pid);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [authUser, addInviteNotice]);

  useEffect(() => {
    if (!authUser) {
      setNotifications([]);
      setNotificationsError(null);
      setNotificationsLoading(false);
      return;
    }

    void refreshNotifications();
    const channel = supabase
      .channel(`notification-inbox:${authUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient=eq.${authUser.id}`,
        },
        (payload) => {
          void refreshNotifications();
          if (payload.eventType !== "INSERT") return;
          const notification = payload.new as Partial<InboxNotification>;
          if (
            notification.kind === "invite" &&
            notification.project_id &&
            notification.id
          ) {
            void addInviteNotice(notification.project_id, notification.id);
          }
        },
      )
      .subscribe();

    const refreshOnFocus = () => void refreshNotifications();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshNotifications();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [authUser, addInviteNotice, refreshNotifications]);

  const markInboxNotificationRead = useCallback(
    (id: string) => {
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, read_at: item.read_at ?? readAt } : item,
        ),
      );
      void markNotificationRead(id).catch(() => refreshNotifications());
    },
    [refreshNotifications],
  );

  const markInboxAllRead = useCallback(() => {
    const readAt = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
    );
    void markAllNotificationsRead().catch(() => refreshNotifications());
  }, [refreshNotifications]);

  const dismissInboxNotification = useCallback(
    (id: string) => {
      const notification = notifications.find((item) => item.id === id);
      setNotifications((prev) => prev.filter((item) => item.id !== id));
      if (notification?.project_id) {
        inviteNoticeProjectsRef.current.delete(notification.project_id);
        setInvites((prev) =>
          prev.filter((item) => item.projectId !== notification.project_id),
        );
      }
      void dismissNotification(id).catch(() => refreshNotifications());
    },
    [notifications, refreshNotifications],
  );

  const joinInvite = useCallback(
    (n: InviteNotice) => {
      setInvites((prev) => prev.filter((x) => x.projectId !== n.projectId));
      inviteNoticeProjectsRef.current.delete(n.projectId);
      const notificationId =
        n.notificationId ??
        notifications.find(
          (item) =>
            item.kind === "invite" && item.project_id === n.projectId,
        )?.id;
      if (notificationId) markInboxNotificationRead(notificationId);
      void loadCloudProject(n.projectId);
    },
    [loadCloudProject, markInboxNotificationRead, notifications],
  );
  const ignoreInvite = useCallback((n: InviteNotice) => {
    setInvites((prev) => prev.filter((x) => x.projectId !== n.projectId));
    inviteNoticeProjectsRef.current.delete(n.projectId);
  }, []);

  const openInboxNotification = useCallback(
    (notification: InboxNotification) => {
      markInboxNotificationRead(notification.id);
      if (notification.kind === "invite" && notification.project_id) {
        inviteNoticeProjectsRef.current.delete(notification.project_id);
        setInvites((prev) =>
          prev.filter((item) => item.projectId !== notification.project_id),
        );
        void loadCloudProject(notification.project_id);
        return;
      }
      if (notification.action_url) {
        window.open(notification.action_url, "_blank", "noopener,noreferrer");
      }
    },
    [loadCloudProject, markInboxNotificationRead],
  );

  const handlePublishPattern = useCallback(
    (pattern: PatternNote[], keyCount: number) => {
      setPublishPattern(pattern);
      setPublishKeyCount(keyCount);
      setModal("publishPreset");
    },
    [],
  );

  const copyPresetToClipboard = useCallback((pattern: PatternNote[]) => {
    pushClip({ kind: "notes", id: uid("clip"), notes: pattern });
    setImportNotice(
      t("app.copiedFromPreset", { count: pattern.length }),
    );
    setModal(null);
  }, [t]);

  const handleNew = useCallback(async (confirm = true, audioSource: File | null = null) => {
    if (confirm) {
      const confirmed = window.confirm(
        "Start a new map? This removes the current audio, background, notes and " +
          "timing from the editor.",
      );
      if (!confirmed) return;
    }

    let loadedAudio: LoadedFile | null = null;
    if (audioSource) {
      try {
        loadedAudio = await loadFile(audioSource);
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : t("app.loadAudioFailed"),
        );
        return;
      }
    }

    applyingHistoryRef.current = true;
    undoStackRef.current = [];
    redoStackRef.current = [];

    setAudioFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return loadedAudio ? { [loadedAudio.name]: loadedAudio } : {};
    });
    setBgFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return {};
    });
    setVideoFiles((prev) => {
      Object.values(prev).forEach((f) => URL.revokeObjectURL(f.url));
      return {};
    });

    const fresh = makeDifficulty("Normal", 4);
    if (loadedAudio) fresh.audioFilename = loadedAudio.name;
    setProjectStarted(true);
    setMeta(DEFAULT_SONG_META);
    setTimingPoints(defaultTimingPoints());
    setDifficulties([fresh]);
    setActiveId(fresh.id);
    setZenMode(false);
    setBgScope("mapset");
    setModal(null);
    setImportError(null);
    setSaveStatus(null);
    setNeedsSongHint(!loadedAudio);
    setLocalProjectId(newLocalProjectId());
    setCloudProjectId(null);
    setCloudOwnerId(null);
    setMyRole(null);
    setReferenceId(null);
    void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
      () => {},
    );

    if (loadedAudio) {
      setAutoTimeOpen(true);
      setAutoTimeStatus("idle");
      setAutoTimeResult(null);
    }

  }, [t]);

  const [jumpToTimeOpen, setJumpToTimeOpen] = useState(false);

  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (playtestRef.current.active) {
        e.preventDefault();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveRef.current();
        return;
      }
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable;
      if (typing) return;
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if (key === "y") {
        e.preventDefault();
        redoRef.current();
      } else if (key === "g") {
        e.preventDefault();
        if (showChromeRef.current) setJumpToTimeOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = useCallback(() => setModal(null), []);

  const holds = useMemo(
    () => active.notes.filter((n) => n.endTime !== undefined).length,
    [active.notes],
  );

  /** Rice and hold counts inside the current selection, for the Tools panel. */
  const selectionCounts = useMemo(() => {
    const ids = selectionRange?.ids;
    if (!ids?.size) return { rice: 0, holds: 0 };
    let rice = 0;
    let holdCount = 0;
    for (const n of active.notes) {
      if (!ids.has(n.id)) continue;
      if (n.endTime !== undefined && n.endTime > n.startTime) holdCount++;
      else rice++;
    }
    return { rice, holds: holdCount };
  }, [active.notes, selectionRange]);

  const [laneFlash, setLaneFlash] = useState<{ column: number; at: number } | null>(null);
  const flashColumn = useCallback(
    (column: number) => setLaneFlash({ column, at: performance.now() }),
    [],
  );
  const [ghostNotesFor, setGhostNotesFor] = useState<string | null>(null);
  const ghostNotes = ghostNotesFor === active.id;
  const setGhostNotes = useCallback(
    (on: boolean) => setGhostNotesFor(on ? activeIdRef.current : null),
    [],
  );

  const cropInfo = useMemo(() => {
    const start = active.trimStartMs ?? 0;
    const hasEnd = active.trimEndMs !== undefined;
    const end = active.trimEndMs ?? Infinity;
    const trimActive = start > 0.5 || hasEnd;
    let remove = 0;
    let clamp = 0;
    if (trimActive) {
      for (const n of active.notes) {
        if (n.startTime < start - 0.5 || n.startTime > end + 0.5) remove++;
        else if (hasEnd && n.endTime !== undefined && n.endTime > end + 0.5)
          clamp++;
      }
    }
    return { trimActive, remove, clamp };
  }, [active.notes, active.trimStartMs, active.trimEndMs]);

  const paletteSettingEntries: Array<{
    key: MessageKey;
    tab: SettingsTab;
    keywords?: string;
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
    { key: "settings.scrollSpeed", tab: "Playtest", keywords: "note speed scroll f3 f4" },
    { key: "settings.rate", tab: "Playtest", keywords: "playback speed dt ht" },
    { key: "settings.zoom", tab: "Playtest", keywords: "playfield size" },
    { key: "settings.audioOffset", tab: "Playtest", keywords: "offset latency sync calibrate universal" },
    { key: "settings.inputOffset", tab: "Playtest", keywords: "offset latency keyboard" },
    { key: "settings.hitPosition", tab: "Playtest", keywords: "judgement line receptor" },
    { key: "settings.quickRestartKey", tab: "Playtest", keywords: "retry" },
    { key: "settings.keybinds", tab: "Playtest", keywords: "keys lanes controls" },
    { key: "settings.showJudgements", tab: "Playtest" },
    { key: "settings.showCombo", tab: "Playtest" },
    { key: "settings.showAccuracy", tab: "Playtest" },
    { key: "settings.showHitError", tab: "Playtest" },
    { key: "settings.showErrorBar", tab: "Playtest", keywords: "unstable rate ur" },
    { key: "settings.skinComboFont", tab: "Playtest", keywords: "hud typography" },
    { key: "settings.skinJudgements", tab: "Playtest", keywords: "hud graphics" },
    { key: "settings.playtestSkin", tab: "Playtest", keywords: "skin look notes osk appearance" },
    { key: "settings.autoplay", tab: "Playtest" },
    { key: "settings.showNpsGraph", tab: "Playtest", keywords: "density" },
    { key: "settings.showRunStats", tab: "Playtest" },
    { key: "settings.humanize", tab: "Playtest", keywords: "autoplay timing" },
    { key: "settings.humanizeJitter", tab: "Playtest", keywords: "autoplay scatter" },
    { key: "settings.humanizeBias", tab: "Playtest", keywords: "autoplay early late" },
    { key: "settings.humanizeSlipChance", tab: "Playtest", keywords: "autoplay error" },
    { key: "settings.humanizeMissChance", tab: "Playtest", keywords: "autoplay error" },
    { key: "settings.humanizeReleaseJitter", tab: "Playtest", keywords: "autoplay long note ln" },
    { key: "settings.humanizeSeed", tab: "Playtest", keywords: "autoplay random" },
    { key: "settings.skill", tab: "Playtest", keywords: "physical limits dan" },
    { key: "settings.danRegular", tab: "Playtest", keywords: "physical limits skill" },
    { key: "settings.danLn", tab: "Playtest", keywords: "physical limits long notes skill" },
    { key: "settings.quickRestartKey", tab: "Playtest", keywords: "keybind" },
    { key: "settings.keybinds", tab: "Playtest", keywords: "lanes controls" },
    { key: "settings.audioSetup", tab: "Audio", keywords: "output calibration" },
    { key: "settings.playHitsounds", tab: "Audio" },
    { key: "settings.masterVolume", tab: "Audio", keywords: "volume sound everything" },
    { key: "settings.musicVolume", tab: "Audio", keywords: "volume song menu" },
    { key: "settings.effectsVolume", tab: "Audio", keywords: "volume hitsound" },
    { key: "settings.keepPitch", tab: "Audio", keywords: "pitch speed slow rate playback" },
    { key: "settings.uiSounds", tab: "Audio", keywords: "interface hover click" },
    { key: "settings.convertPng", tab: "Export", keywords: "background jpeg" },
    { key: "settings.jpegQuality", tab: "Export", keywords: "background image" },
    { key: "settings.cascadeTag", tab: "Export", keywords: "tags metadata credit" },
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
          { id: "tools", label: t("nav.tools"), group: t("palette.group.editor"), keywords: "ghost notes full ln rice crop", run: () => setModal("tools") },
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
          { id: "save-cloud", label: t("file.saveToCloud"), group: t("palette.group.file"), keywords: "account collaborate", disabled: !authUser || !canEdit, run: () => void handleCloudSave() },
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
            id: "ghost-notes",
            label: ghostNotes ? t("app.hideGhostNotes") : t("app.showGhostNotes"),
            group: t("palette.group.editor"),
            keywords: "assist suggested notes",
            disabled: !waveform?.buffer || !canEdit,
            run: () => setGhostNotes(!ghostNotes),
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
                { id: "share", label: t("nav.shareTitle"), group: t("palette.group.collaboration"), disabled: !authUser, run: () => setModal("share" as ModalId) },
              ]
            : []),
          ...(isDesktopApp()
            ? [{ id: "version-history", label: t("file.versionHistory"), group: t("palette.group.file"), run: () => setModal("versionHistory" as ModalId) }]
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
      ? [{ id: "exit", label: t("menu.exit"), group: t("palette.group.cascade"), keywords: "quit close app", run: handleExitApp }]
      : []),
    {
      id: "settings",
      label: t("settings.title"),
      group: t("palette.group.settings"),
      hint: "Ctrl K",
      run: () => openSettings(),
    },
    ...paletteSettingEntries.map(({ key, tab, keywords }) => ({
      id: `setting-${key}`,
      label: t(key),
      group: t("palette.group.setting", { tab: t(`settings.tab${tab}` as MessageKey) }),
      keywords,
      run: () => openSettings(tab),
    })),
  ];

  if (packCreatorOpen) packCreatorEverOpenedRef.current = true;
  if (modal === "admin") adminEverOpenedRef.current = true;

  return (
    <div
      className="relative h-full overflow-hidden bg-ink-900"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <SessionIntro
        enabled={appSettings.introEnabled && !hasProject && !sharedSlug}
        musicPlaying={menuMusic.isPlaying}
        ready={chunksReady}
      />
      {sceneEntering && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[170] bg-ink-900/55"
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.png?v=3`}
            alt=""
            className="scene-logo-out absolute left-1/2 top-1/2 h-48 w-48 rounded-full"
          />
        </div>
      )}
      <div
        className={`flex h-full flex-col transition-[filter,opacity,transform] duration-500 ease-[var(--ease-emphasized)] ${
          sceneEntering && hasProject ? "editor-scene-in" : ""
        } ${
          exiting ? "app-power-off" : ""
        } ${
          modalAtmosphereActive && !appSettings.performanceMode
            ? "scale-[0.992] blur-[2px] opacity-75"
            : "scale-100 blur-0 opacity-100"
        }`}
      >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-ink-900/76 backdrop-blur-md">
          <div className="rounded-2xl border-2 border-dashed border-accent/70 bg-ink-800/82 px-12 py-10 text-center shadow-2xl backdrop-blur-xl">
            <MusicNoteIcon className="mx-auto mb-2 h-9 w-9 text-accent" />
            <p className="text-lg font-semibold text-slate-100">{t("drop.title")}</p>
            <p className="text-sm text-slate-400">{t("drop.formats")}</p>
          </div>
        </div>
      )}

      {importingMap && (
        <div className="loader-fade-in fixed inset-0 z-[55] flex flex-col items-center justify-center gap-8 bg-ink-900/80">
          <img
            src={`${import.meta.env.BASE_URL}favicon.png?v=3`}
            alt=""
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="loader-logo-pulse loader-content-in h-20 w-20 select-none rounded-2xl object-cover"
          />
          <div className="loader-content-in flex h-12 items-end gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="loader-bar h-full w-1.5 rounded-full bg-gradient-to-t from-accent-deep to-accent-soft"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div className="loader-content-in flex w-64 flex-col items-center gap-2">
            <p className="text-sm font-medium tracking-wide text-slate-300">
              {t("app.loadingMap")}
            </p>
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={Math.round((importProgress?.ratio ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={importProgress?.label ?? t("app.loadingMapLabel")}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                style={{
                  width: `${Math.round((importProgress?.ratio ?? 0) * 100)}%`,
                }}
              />
            </div>
            {/* Fixed-height line: labels change on every phase and a
                collapsing paragraph would shift the loader. */}
            <p className="h-4 w-full truncate text-center text-[11px] leading-4 text-slate-300/40">
              {importProgress?.label ?? ""}
            </p>
          </div>
        </div>
      )}

      <header
        className={`z-30 flex items-center justify-between gap-2 overflow-hidden border-white/10 bg-ink-800/65 px-3 shadow-[0_10px_35px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[max-height,padding,opacity,transform] duration-300 ease-out uixl:gap-4 uixl:px-5 ${
          hasProject ? "" : "absolute inset-x-0 top-0"
        } ${
          showHeader
            ? "max-h-20 translate-y-0 border-b py-2.5 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-full border-b-0 py-0 opacity-0"
        }`}
        aria-hidden={!showHeader}
        {...({ inert: !showHeader ? "" : undefined } as { inert?: string })}
      >
        <div className="flex min-w-0 items-center gap-2 uixl:gap-4">
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => hasProject && setShowHomeConfirm(true)}
              className="flex items-center gap-2.5 rounded-md transition hover:opacity-80"
              title={hasProject ? t("home.returnTitle") : undefined}
              data-no-uisound=""
            >
              <img
                src={`${import.meta.env.BASE_URL}favicon.png?v=3`}
                alt="Cascade"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="h-8 w-8 select-none rounded-lg object-cover"
              />
              <span className="hidden text-sm font-semibold text-slate-100 uimd:inline">
                Cascade
              </span>
            </button>
          </div>

          <div
            className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
              hasProject
                ? "max-w-[68rem] translate-x-0 opacity-100"
                : "pointer-events-none max-w-0 -translate-x-3 opacity-0"
            }`}
            aria-hidden={!hasProject}
            {...({ inert: !hasProject ? "" : undefined } as { inert?: string })}
          >
            <nav className="flex items-center gap-1 whitespace-nowrap">
              <MenuButton onClick={() => setModal("mapSettings")}>
                {t("nav.mapSettings")}
              </MenuButton>
              <MenuButton onClick={() => setModal("timing")}>
                {t("nav.timing")}
              </MenuButton>
              {featureFlags.sv_tools && (
                <MenuButton onClick={() => setModal("sv")}>
                  {t("nav.sv")}
                </MenuButton>
              )}
              <MenuButton onClick={() => setModal("difficulty")}>
                {t("nav.difficulty")}
              </MenuButton>
              <div className="hidden items-center gap-1 uixl:flex">
                <MenuButton onClick={() => setModal("tools")}>
                  {t("nav.tools")}
                </MenuButton>
                <MenuButton onClick={openAiMod}>{t("nav.aiMod")}</MenuButton>
                {appSettings.showPatternTools && (
                  <MenuButton onClick={() => setModal("presets")}>
                    {t("nav.presets")}
                  </MenuButton>
                )}
                <MenuButton onClick={() => setModal("skin")}>
                  {t("nav.skin")}
                </MenuButton>
                <MenuButton onClick={() => openSettings()}>
                  {t("nav.settings")}
                </MenuButton>
                <span className="mx-1 h-5 w-px bg-white/10" />
                <HistoryPopover
                  open={historyPanel}
                  onOpenChange={setHistoryPanel}
                  available={canUndo || canRedo}
                  entries={historyEntries}
                  current={historyCurrent}
                  onJump={jumpHistory}
                  readOnly={!canEdit}
                  live={liveEnabled}
                >
                  <IconButton
                    onClick={undo}
                    disabled={!canUndo}
                    title={t("nav.undo")}
                  >
                    <UndoIcon className="h-4 w-4" />
                  </IconButton>
                </HistoryPopover>
                <IconButton
                  onClick={redo}
                  disabled={!canRedo}
                  title={t("nav.redo")}
                >
                  <RedoIcon className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="uixl:hidden">
                <Menu
                  label={t("nav.more")}
                  className="!px-2.5"
                  items={[
                    {
                      label: t("nav.tools"),
                      onClick: () => setModal("tools"),
                    },
                    { label: t("nav.aiMod"), onClick: openAiMod },
                    ...(appSettings.showPatternTools
                      ? [
                          {
                            label: t("nav.presets"),
                            onClick: () => setModal("presets"),
                          },
                        ]
                      : []),
                    {
                      label: t("nav.skin"),
                      onClick: () => setModal("skin"),
                    },
                    {
                      label: t("nav.settings"),
                      onClick: () => openSettings(),
                    },
                    { separator: true as const },
                    {
                      label: t("nav.undo"),
                      disabled: !canUndo,
                      onClick: undo,
                    },
                    {
                      label: t("nav.redo"),
                      disabled: !canRedo,
                      onClick: redo,
                    },
                    {
                      label: t("undoHistory.title"),
                      disabled: !canUndo && !canRedo,
                      onClick: () => setModal("history"),
                    },
                  ]}
                />
              </div>
            </nav>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div
            className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
              hasProject
                ? "max-w-[68rem] translate-x-0 opacity-100"
                : "pointer-events-none max-w-0 translate-x-3 opacity-0"
            }`}
            aria-hidden={!hasProject}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {cloudProjectId && myRole === "viewer" && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {t("nav.viewOnly")}
                </span>
              )}
              {cloudProjectId &&
                authUser &&
                cloudOwnerId === authUser.id &&
                featureFlags.collab && (
                  <IconButton
                    onClick={() => setModal("share")}
                    title={t("nav.shareTitle")}
                  >
                    <UsersIcon className="h-4 w-4" />
                  </IconButton>
                )}
              {cloudProjectId && authUser && (
                <IconButton
                  onClick={() => setCommentsOpen((v) => !v)}
                  title={
                    commentUnreadCount
                      ? t("nav.commentsUnread", { count: commentUnreadCount })
                      : t("nav.comments")
                  }
                >
                  <CommentIcon className="h-4 w-4" />
                  {commentUnreadCount > 0 && (
                    <span className="absolute right-0 top-0 grid min-h-3 min-w-3 place-items-center rounded-full bg-accent px-0.5 text-[8px] font-bold leading-3 text-ink-900">
                      {commentUnreadCount > 9 ? "9+" : commentUnreadCount}
                    </span>
                  )}
                </IconButton>
              )}
              {saveStatus && (
                <div
                  role="status"
                  aria-label={
                    saveStatus === "saving"
                      ? t("file.saving")
                      : saveStatus === "saved"
                        ? t("file.saved")
                        : t("file.saveFailed")
                  }
                  title={
                    saveStatus === "error" && saveErrorDetail
                      ? `${t("file.saveFailed")}: ${saveErrorDetail}`
                      : undefined
                  }
                  className={`hidden h-8 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition uilg:flex uixl:px-2.5 ${
                    saveStatus === "saving"
                      ? "border-amber-400/15 bg-amber-400/5 text-amber-200"
                      : saveStatus === "saved"
                        ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-200"
                        : "border-red-400/20 bg-red-400/10 text-red-200"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      saveStatus === "saving"
                        ? "animate-pulse bg-amber-300"
                        : saveStatus === "saved"
                          ? "bg-emerald-300"
                          : "bg-red-300"
                    }`}
                  />
                  <span className="hidden uixl:inline">
                    {saveStatus === "saving"
                      ? t("file.saving")
                      : saveStatus === "saved"
                        ? t("file.saved")
                        : t("file.saveFailed")}
                  </span>
                </div>
              )}
              <Menu
                label={t("nav.file")}
                tone="accent"
                items={[
                  {
                    label: t("file.newOpen"),
                    onClick: () => setModal("welcome"),
                  },
                  {
                    label:
                      saveStatus === "saving"
                        ? t("file.saving")
                        : t("file.saveLocally"),
                    hint: "Ctrl+S",
                    disabled: saveStatus === "saving",
                    onClick: () => void handleSave(),
                  },
                  {
                    label:
                      cloudSaveStatus === "saving"
                        ? t("file.saving")
                        : t("file.saveToCloud"),
                    title: !authUser ? t("file.logInFirst") : undefined,
                    disabled:
                      !authUser || !canEdit || cloudSaveStatus === "saving",
                    onClick: () => void handleCloudSave(),
                  },
                  { separator: true },
                  {
                    label: t("file.exportOsu"),
                    disabled: !canExport,
                    onClick: handleExportOsu,
                  },
                  {
                    label: t("file.exportOsz"),
                    disabled: !canExport || exporting,
                    onClick: handleExportOsz,
                  },
                  {
                    label: t("file.exportSm"),
                    disabled: !canExport,
                    onClick: handleExportSm,
                  },
                  {
                    label: t("file.exportQua"),
                    disabled:
                      !canExport ||
                      (active.keyCount !== 4 && active.keyCount !== 7),
                    title:
                      active.keyCount !== 4 && active.keyCount !== 7
                        ? t("app.quaverKeys")
                        : undefined,
                    onClick: handleExportQua,
                  },
                  {
                    label: t("file.exportMcz"),
                    disabled: !canExport || exporting || !hasMalodyDifficulty,
                    title: !hasMalodyDifficulty
                      ? t("malody.maxKeys", { count: MALODY_MAX_KEYS })
                      : undefined,
                    onClick: handleExportMcz,
                  },
                  { separator: true },
                  {
                    label: t("file.mapCard"),
                    onClick: () => openMapCard(),
                  },
                  ...(isDesktopApp()
                    ? [
                        { separator: true as const },
                        {
                          label: t("file.versionHistory"),
                          disabled: !hasProject,
                          onClick: () => setModal("versionHistory"),
                        },
                      ]
                    : []),
                  ...(osuApp?.supported
                    ? [
                        { separator: true as const },
                        {
                          label: t("file.importIntoOsu"),
                          disabled: !canExport || osuBusy || exporting,
                          title: !osuApp.installed
                            ? t("osu.notInstalled")
                            : undefined,
                          onClick: handleSendToOsu,
                        },
                        {
                          label: t("file.syncToOsu"),
                          disabled: !canExport || osuBusy || exporting,
                          title: t("file.syncToOsuHint"),
                          onClick: handleSyncToOsu,
                        },
                        {
                          label: t("file.importFromOsu"),
                          disabled: osuBusy || importingMap,
                          title: !osuApp.running
                            ? t("osu.notRunning")
                            : undefined,
                          onClick: () => void handleLoadFromOsu(),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
          {liveEnabled && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-700/42 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur-xl"
              title={
                collab.status === "connected"
                  ? t("collab.live")
                  : collab.status === "connecting"
                    ? t("collab.connecting")
                    : t("collab.offline")
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  collab.status === "connected"
                    ? "bg-emerald-400"
                    : collab.status === "connecting"
                      ? "animate-pulse bg-amber-400"
                      : "bg-rose-500"
                }`}
              />
              <span className="text-slate-300">{t("app.live")}</span>
            </span>
          )}
          {liveEnabled && collab.peers.length > 0 && (
            <div
              className="flex items-center -space-x-1.5"
              title={t("app.editingNow")}
            >
              {collab.peers.slice(0, 5).map((p) => (
                <span
                  key={p.id}
                  className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 bg-ink-700/70 text-[10px] font-semibold text-slate-100 shadow-sm backdrop-blur"
                  style={{ borderColor: p.color }}
                  title={p.username}
                >
                  {p.avatar ? (
                    <img
                      src={p.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    p.username.slice(0, 1).toUpperCase()
                  )}
                </span>
              ))}
            </div>
          )}
          {!hasProject && !sharedSlug && <NowPlaying music={menuMusic} />}
          {!hasProject && featureFlags.desktop_download && (
            <DesktopDownloadLink
              active={showHeader && modal === null && !packCreatorOpen}
            />
          )}
          {!hasProject && <LanguagePicker compact />}
          {authUser && (
            <NotificationInbox
              notifications={notifications}
              loading={notificationsLoading}
              error={notificationsError}
              onRefresh={refreshNotifications}
              onOpen={openInboxNotification}
              onMarkRead={markInboxNotificationRead}
              onMarkAllRead={markInboxAllRead}
              onDismiss={dismissInboxNotification}
            />
          )}
          <AccountControl
            compact
            onOpenMyMaps={() => setModal("myMaps")}
            onOpenPresets={
              appSettings.showPatternTools
                ? () => setModal("presets")
                : undefined
            }
            onOpenFeedback={() => setModal("feedback")}
            onOpenAdmin={() => setModal("admin")}
          />
        </div>
      </header>

      <Suspense fallback={null}>
      <div className="flex min-h-0 flex-1">
        <div className="relative z-10 shrink-0">
          <div
            className={`h-full overflow-hidden transition-[width,opacity] duration-300 ease-out ${
              diffPanelShown ? "w-60 opacity-100" : "w-0 opacity-0"
            }`}
            aria-hidden={!diffPanelShown}
          >
            <div className="h-full w-60">
              {showChrome && (
                <MemoizedDifficultySidebar
                  difficulties={difficulties}
                  activeId={active.id}
                  onSelect={setActiveId}
                  onAdd={addDifficulty}
                  onDuplicate={duplicateDifficulty}
                  onCopy={copyDifficulty}
                  onDelete={queueDifficultyDelete}
                  onRename={renameDifficulty}
                  onCreateRate={createRateDifficulty}
                  canEdit={canEdit}
                  timingPoints={activeTimingPoints}
                  songDurationMs={audio.duration > 0 ? audio.duration : null}
                  peers={liveEnabled ? collab.peers : undefined}
                  onFlashColumn={flashColumn}
                />
              )}
            </div>
          </div>

          {showChrome && (
            <div className="group absolute left-full top-1/2 h-32 w-11 -translate-y-1/2 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setAppSettings((s) => ({
                    ...s,
                    difficultyPanelOpen: !diffPanelOpen,
                  }))
                }
                title={t(
                  diffPanelOpen
                    ? "diffSidebar.collapse"
                    : "diffSidebar.expand",
                )}
                aria-label={t(
                  diffPanelOpen
                    ? "diffSidebar.collapse"
                    : "diffSidebar.expand",
                )}
                aria-expanded={diffPanelOpen}
                className="absolute left-0 top-1/2 grid h-14 w-8 -translate-x-[76%] -translate-y-1/2 place-items-center rounded-r-xl border border-l-0 border-white/10 bg-ink-700/90 text-slate-300 shadow-lg backdrop-blur-sm transition-[transform,background-color,color] duration-200 ease-out hover:bg-ink-600 hover:text-white focus-visible:translate-x-0 group-hover:translate-x-0"
              >
                <ChevronIcon flipped={!diffPanelOpen} />
              </button>
            </div>
          )}
        </div>

        <main className="flex min-w-0 flex-1 flex-col">
          <div
            className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${
              showChrome
                ? "max-h-24 translate-y-0 opacity-100"
                : "pointer-events-none max-h-0 -translate-y-4 opacity-0"
            }`}
            aria-hidden={!showChrome}
          >
            {showChrome && (
              <TransportBar
                audio={audio}
                view={view}
                onView={setView}
                jumpOpen={jumpToTimeOpen}
                onJumpOpenChange={setJumpToTimeOpen}
                getSelectionTimestamp={
                  selectionRange
                    ? () =>
                        formatOsuTimestamp(
                          active.notes.filter((n) => selectionRange.ids.has(n.id)),
                          activeTimingPoints,
                        )
                    : undefined
                }
              />
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            {exclusiveAudio && audio.nativeAudio.fallbackReason && <div role="status" className="absolute right-3 top-2 z-20 max-w-sm rounded-lg border border-amber-300/20 bg-ink-900/95 px-3 py-2 text-[11px] text-amber-200">{t("app.sharedAudio", { reason: audio.nativeAudio.fallbackReason })} <button className="underline" onClick={() => { pauseAudio(); setModal("audioSetup"); }}>{t("app.audioSetup")}</button></div>}
            <div className="flex h-full w-full">
            <div className="relative min-w-0 flex-1">
            {hasProject ? (
              <MemoizedManiaEditor
                laneColourScheme={appSettings.colourblindLanes ? "colourblind" : "default"}
                snapColours={appSettings.snapColouredNotes}
                laneFlash={laneFlash}
                key={active.id}
                audioBuffer={waveform?.buffer ?? null}
                patternTitle={`${meta.artist} – ${meta.title}`}
                difficultyName={active.name}
                notes={active.notes}
                keyCount={active.keyCount}
                timingPoints={activeTimingPoints}
                previewTime={active.previewTime}
                bookmarks={active.bookmarks}
                view={editorView}
                getCurrentTime={getEditorCurrentTime}
                getVisualCurrentTime={getEditorVisualCurrentTime}
                isVisualSeekActive={isVisualSeekActive}
                isPlaying={audio.isPlaying}
                seekSignal={audio.seekSignal}
                backgroundUrl={activeBg?.url ?? null}
                backgroundKey={
                  activeBg
                    ? `${activeBg.blob.size}:${activeBg.blob.type}`
                    : null
                }
                videoUrl={activeVideo?.url ?? null}
                videoOffsetMs={active.videoOffsetMs ?? 0}
                playbackRate={audio.playbackRate}
                timeScale={activeRate}
                dimBackground={editorDimBackground}
                backgroundBlur={appSettings.backgroundBlur}
                skin={activeSkin}
                playfieldScale={editorPlayfieldScale}
                noteHeightScale={appSettings.noteHeightScale}
                longNoteBodyScale={appSettings.longNoteBodyScale}
                smoothScrolling={appSettings.smoothScrolling}
                showTimingLines={appSettings.showTimingLines}
                upscroll={appSettings.upscroll}
                svPreview={
                  hasSv(activeTimingPoints, {
                    bpmScroll: appSettings.bpmAffectsScroll,
                  }) &&
                  (playtest.active ||
                    (appSettings.svPreviewPlayback && audio.isPlaying))
                }
                svBpmScroll={appSettings.bpmAffectsScroll}
                onSelectionRange={setSelectionRange}
                editorKeybinds={editorKeybinds}
                zenMode={zenMode || playtest.active}
                onPlaceNote={placeNote}
                onDeleteNote={deleteNote}
                onAddNotes={addNotes}
                onDeleteNotes={deleteNotes}
                onMoveNotes={moveNotes}
                onView={setView}
                onSeek={seekAudio}
                currentHitSound={currentHitSound}
                currentSampleSet={currentSampleSet}
                onCurrentHitSound={setCurrentHitSound}
                onCurrentSampleSet={setCurrentSampleSet}
                hitsoundSources={hitsoundSources}
                onCopyHitsounds={applyCopyHitsounds}
                onCopyHitsoundsToAll={
                  hitsoundTargets.length ? applyCopyHitsoundsToAll : undefined
                }
                onPublishPattern={
                  appSettings.showPatternTools &&
                  authUser &&
                  featureFlags.preset_publishing
                    ? handlePublishPattern
                    : undefined
                }
                onPasteDifficulty={pasteDifficulty}
                readOnly={!canEdit}
                playtestMode={playtest.active}
                heldLnIdsRef={playtestHoldingView}
                consumedIdsRef={playtestHiddenView}
                droppedIdsRef={playtestDroppedView}
                pressedColumnsRef={playtestPressedColumnsRef}
                hitPosition={playtestSettings.hitPosition}
                waveformOverlay={appSettings.showWaveform ? waveform : null}
                waveformTransparency={appSettings.waveformTransparency}
                onToggleWaveformOverlay={toggleWaveformOverlay}
                missWindowMs={playtestWindows.hit50}
                hideHints={playtest.active}
                songEndMs={audio.duration}
                trimStartMs={active.trimStartMs}
                trimEndMs={active.trimEndMs}
                ghostNotes={ghostNotes}
                onGhostNotes={setGhostNotes}
              />
            ) : sharedSlug ? (
              <SharedMapPage
                slug={sharedSlug}
                onOpen={openSharedMap}
                cascadeTag={appSettings.addCascadeTag}
              />
            ) : (
              <StartScreen
                music={menuMusic}
                players={appSettings.showMenuPlayers ? onlinePlayers : []}
                onOpenChange={setMenuOpen}
                onMyMaps={() => setModal("myProjects")}
                onNewMap={() => setModal("newMap")}
                onPackCreator={() => setPackCreatorOpen(true)}
                onTryMaps={() => setModal("sampleMaps")}
                onImport={() => setModal("import")}
                onSettings={() => openSettings()}
                onExit={canExitDesktop() ? handleExitApp : undefined}
                osuBanner={osuBanner}
                logoHitsoundVolume={
                  appSettings.hitsoundsEnabled
                    ? appSettings.hitsoundVolume * appSettings.masterVolume
                    : 0
                }
                logoSamples={appSettings.logoSkinHitsounds ? "skin" : "menu"}
                skinHitsounds={skin?.hitsounds ?? null}
                menuBackgroundUrl={menuBackgroundUrl}
                editorKeybinds={editorKeybinds}
                menuTips={appSettings.menuTipsEnabled}
              >
                <LandingCopy />
              </StartScreen>
            )}
            </div>
            <div
              className={`relative h-full shrink-0 overflow-hidden border-l border-ink-700 transition-[width] duration-300 ease-out ${
                referenceDiff ? "w-1/2" : "w-0"
              }`}
              aria-hidden={!referenceDiff}
            >
              {referenceDiff && (
                <>
                  <div className="pointer-events-none h-full w-full opacity-60">
                    <MemoizedManiaEditor
                      laneColourScheme={appSettings.colourblindLanes ? "colourblind" : "default"}
                      snapColours={appSettings.snapColouredNotes}
                      notes={referenceDiff.notes}
                      keyCount={referenceDiff.keyCount}
                      timingPoints={referenceTimingPoints}
                      previewTime={referenceDiff.previewTime}
                      view={view}
                      getCurrentTime={getCurrentTime}
                      getVisualCurrentTime={getVisualCurrentTime}
                      isVisualSeekActive={isVisualSeekActive}
                      isPlaying={audio.isPlaying}
                      seekSignal={audio.seekSignal}
                      backgroundUrl={null}
                      videoUrl={null}
                      dimBackground={appSettings.dimBackground}
                      backgroundBlur={appSettings.backgroundBlur}
                      skin={referenceSkin}
                      playfieldScale={appSettings.playfieldScale}
                      noteHeightScale={appSettings.noteHeightScale}
                      longNoteBodyScale={appSettings.longNoteBodyScale}
                      smoothScrolling={appSettings.smoothScrolling}
                      showTimingLines={appSettings.showTimingLines}
                      upscroll={appSettings.upscroll}
                      svPreview={
                        hasSv(referenceTimingPoints, {
                          bpmScroll: appSettings.bpmAffectsScroll,
                        }) &&
                        appSettings.svPreviewPlayback &&
                        audio.isPlaying
                      }
                      svBpmScroll={appSettings.bpmAffectsScroll}
                      zenMode={zenMode}
                      onPlaceNote={noop}
                      onDeleteNote={noop}
                      onAddNotes={noop}
                      onDeleteNotes={noop}
                      onMoveNotes={noop}
                      onView={noop}
                      onSeek={noop}
                      currentHitSound={0}
                      currentSampleSet={0}
                      onCurrentHitSound={noop}
                      onCurrentSampleSet={noop}
                      readOnly
                      keyboardShortcuts={false}
                      hideHints
                      hideClipboard
                    />
                  </div>
                  <div className="absolute left-2 top-2 z-20 rounded border border-white/10 bg-ink-900/65 px-2 py-0.5 text-[11px] font-medium text-slate-200 shadow backdrop-blur-xl">
                    {t("app.referenceBadge", { name: referenceDiff.name, keys: referenceDiff.keyCount })}
                  </div>
                </>
              )}
            </div>
            </div>
            {hasProject && playtest.active && playtestSettings.showNpsGraph && (
              <MemoizedPlaytestNpsGraph
                notes={playtestRunNotes}
                durationMs={audio.duration}
                getCurrentTime={getEditorCurrentTime}
                active={playtest.active}
                running={
                  !playtest.paused &&
                  !playtest.ended &&
                  playtest.countdownEndsAt === null
                }
                label={t("runStats.nps")}
                peakLabel={t("runStats.peakShort")}
              />
            )}
            {hasProject &&
              playtest.active &&
              (playtest.countdownEndsAt === null || playtest.resuming) &&
              playtestSettings.showRunStats && (
                <PlaytestRunStats
                  store={playtestScore}
                  notes={playtestRunNotes}
                  durationMs={audio.duration}
                  getCurrentTime={getEditorCurrentTime}
                  autoplay={playtest.autoplay}
                  autoplaySummary={autoplaySummary}
                  humanized={playtestSettings.humanize.enabled}
                  showNps={!playtestSettings.showNpsGraph}
                  skillProfile={skillProfile}
                  skillEnabled
                />
              )}
            {hasProject && playtest.active && (
              <PlaytestOverlay
                store={playtestScore}
                ended={playtest.ended}
                paused={playtest.paused}
                countdownEndsAt={playtest.countdownEndsAt}
                settings={playtestSettings}
                windows={playtestWindows}
                getCurrentTime={playtestGameplayTime}
                hitLineFromEdge={PLAYTEST_HIT_LINE_FROM_EDGE + playtestSettings.hitPosition}
                upscroll={appSettings.upscroll}
                skin={playtestLook}
                keyCount={active.keyCount}
                heldKeys={heldPlaytestKeys}
                onContinue={resumePlaytest}
                onRetry={restartPlaytest}
                onReturn={exitPlaytest}
                onSettings={() => openSettings("Playtest")}
              />
            )}
            {audioFile &&
              hasProject &&
              appSettings.showPpCounter &&
              !zenMode &&
              !playtest.active && (
              <MemoizedPPCounter
                notes={active.notes}
                keyCount={active.keyCount}
                playbackRate={audio.playbackRate}
                onPlaybackRateChange={setAudioPlaybackRate}
              />
            )}
            {hasProject && !zenMode && !playtest.active && eligibleRefs.length > 0 && (
              <div className="absolute left-3 top-[5.5rem] z-30 rounded-lg border border-white/10 bg-ink-900/62 shadow-xl shadow-black/20 backdrop-blur-xl">
                <Menu
                  label={
                    referenceDiff ? t("app.refShort", { name: referenceDiff.name }) : t("app.reference")
                  }
                  items={[
                    ...eligibleRefs.map((d) => ({
                      label: `${d.name} (${d.keyCount}K)`,
                      onClick: () => setReferenceId(d.id),
                    })),
                    ...(referenceDiff
                      ? [
                          { separator: true as const },
                          {
                            label: t("app.referenceOff"),
                            danger: true,
                            onClick: () => setReferenceId(null),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            )}
            {cloudProjectId && authUser && (
              <CommentsSidebar
                open={commentsOpen}
                onClose={() => setCommentsOpen(false)}
                projectId={cloudProjectId}
                me={{
                  id: authUser.id,
                  username: authUser.username,
                  osu_id: authUser.osu_id,
                }}
                currentTimeMs={audio.currentTime}
                activeDiffId={active.id}
                difficulties={difficulties.map((d) => ({
                  id: d.id,
                  name: d.name,
                }))}
                onSeek={seekAudio}
                canModerate={myRole === "owner" || myRole === "editor"}
                ownerId={cloudOwnerId}
                onCommentsChange={(c: Comment[]) =>
                  setCommentMarkers(
                    c
                      .filter((x) => !x.parent_id)
                      .map((x) => ({
                        time_ms: x.time_ms,
                        resolved: x.resolved,
                        body: x.body,
                        author: x.author_username ?? "Mapper",
                        difficulty_id: x.difficulty_id,
                      })),
                  )
                }
                onUnreadCountChange={setCommentUnreadCount}
              />
            )}
          </div>

          <div
            className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${
              showChrome && appSettings.showBottomTimeline
                ? "max-h-[144px] translate-y-0 opacity-100"
                : "pointer-events-none max-h-0 translate-y-4 opacity-0"
            }`}
            aria-hidden={!showChrome}
          >
            <SkillsetGraph
              open={showChrome && appSettings.showBottomTimeline && appSettings.showSkillsetGraph}
              collapsed={appSettings.skillsetGraphCollapsed}
              onToggleCollapsed={toggleSkillsetGraphCollapsed}
              points={skillsetTimeline}
              duration={audio.duration}
              keyCount={active.keyCount}
              supported={msdSupportsKeyCount(active.keyCount)}
              onSeek={seekAudio}
            />
            {showChrome && appSettings.showBottomTimeline && (
              <MemoizedBottomTimeline
                waveform={waveform}
                notes={active.notes}
                timingPoints={activeTimingPoints}
                selectedTimingIds={modal === "timing" ? timingSelection : undefined}
                svBpmScroll={appSettings.bpmAffectsScroll}
                simplified={appSettings.simplifyBottomTimeline}
                previewTime={active.previewTime}
                duration={audio.duration}
                getCurrentTime={getCurrentTime}
                getVisualCurrentTime={getVisualCurrentTime}
                isVisualSeekActive={isVisualSeekActive}
                isPlaying={audio.isPlaying}
                seekSignal={audio.seekSignal}
                smoothScrolling={appSettings.smoothScrolling}
                onSeek={seekAudio}
                sensitivity={appSettings.waveformSensitivity}
                onSensitivity={setWaveformSensitivity}
                revealWaveform={hasProject}
                peers={collab.peers}
                comments={activeCommentMarkers}
                onCommentClick={openTimelineComment}
                bookmarks={active.bookmarks}
                bookmarkLabels={active.bookmarkLabels}
                loopRange={activeBookmarkLoop}
                loopEnabled={activeBookmarkLoop?.enabled}
                onSetPreviewPoint={canEdit ? setPreviewPoint : undefined}
                onAddBookmark={canEdit ? addBookmark : undefined}
                onRenameBookmark={canEdit ? renameBookmark : undefined}
                onRemoveBookmark={canEdit ? removeBookmark : undefined}
                onPreviousBookmark={seekPreviousBookmark}
                onNextBookmark={seekNextBookmark}
                onSetLoopStart={setBookmarkLoopStart}
                onSetLoopEnd={setBookmarkLoopEnd}
                onToggleLoop={toggleBookmarkLoop}
                onClearLoop={clearBookmarkLoop}
                trimStart={active.trimStartMs}
                trimEnd={active.trimEndMs}
                fadeIn={active.fadeInMs}
                fadeOut={active.fadeOutMs}
                onSetTrimStart={canEdit ? setTrimStart : undefined}
                onSetTrimEnd={canEdit ? setTrimEnd : undefined}
                onSetFadeIn={canEdit ? setFadeIn : undefined}
                onSetFadeOut={canEdit ? setFadeOut : undefined}
              />
            )}
          </div>
        </main>
      </div>
      </Suspense>

      </div>

      <Suspense fallback={null}>
      {modalMounted("newMap") && (
        <NewMapModal
          open={modal === "newMap"}
          onClose={close}
          onCreate={(audioSource) => handleNew(hasProjectContent, audioSource)}
          banner={osuPrompt}
        />
      )}
      {modalMounted("welcome") && (
        <WelcomeModal
          open={modal === "welcome"}
          onClose={close}
          accountsEnabled={featureFlags.cloud_accounts}
          onImportFromOsu={
            featureFlags.beatmap_import && import.meta.env.VITE_WORKER_URL
              ? importFromOsu
              : undefined
          }
          onNewMap={() => setModal("newMap")}
          onTryMaps={() => setModal("sampleMaps")}
          onImportSmPack={onImportSmPack}
          onPackCreator={() => {
            setModal(null);
            setPackCreatorOpen(true);
          }}
          onOpenLocalProject={(id) => void loadLocalProject(id)}
          onOpenCloudProject={(id) => void loadCloudProject(id)}
        />
      )}
      {modalMounted("versionHistory") && (
        <VersionHistoryModal
          open={modal === "versionHistory"}
          onClose={close}
          storageKey={projectVaultKey}
          onRestore={handleRestoreSnapshot}
        />
      )}
      {modalMounted("myProjects") && (
        <WelcomeModal
          projectsOnly
          open={modal === "myProjects"}
          onClose={close}
          accountsEnabled={featureFlags.cloud_accounts}
          onNewMap={() => setModal("newMap")}
          onTryMaps={() => setModal("sampleMaps")}
          onOpenLocalProject={(id) => void loadLocalProject(id)}
          onOpenCloudProject={(id) => void loadCloudProject(id)}
        />
      )}
      {modalMounted("import") && (
        <ImportModal
          open={modal === "import"}
          onClose={close}
          banner={osuPrompt}
          onFile={(file) => {
            setModal(null);
            if (isSmFile(file)) void importSmFile(file);
            else if (isSingleChartFile(file)) void importQuaFile(file);
            else if (isOsuFile(file)) void openOsuFiles([file]);
            else void importMapFile(file);
          }}
          onFolder={
            "showDirectoryPicker" in window
              ? () => void onImportSmPack()
              : undefined
          }
          onImportFromOsu={
            featureFlags.beatmap_import && import.meta.env.VITE_WORKER_URL
              ? importFromOsu
              : undefined
          }
        />
      )}
      {packCreatorEverOpenedRef.current && (
        <Suspense fallback={null}>
          <PackCreator
            jpegQuality={
              appSettings.exportPngBackgroundsAsJpeg
                ? appSettings.exportJpegQuality
                : undefined
            }
            cascadeTag={appSettings.addCascadeTag}
            open={packCreatorOpen}
            onClose={() => setPackCreatorOpen(false)}
          />
        </Suspense>
      )}
      {modalMounted("sampleMaps") && (
        <SampleMapsModal
          open={modal === "sampleMaps"}
          onClose={close}
          onBack={() => setModal("welcome")}
          onSelect={loadSampleMap}
        />
      )}
      {modalMounted("myMaps") && (
        <MyMapsModal
          open={modal === "myMaps"}
          onClose={close}
          onSelect={(id) => void loadCloudProject(id)}
        />
      )}
      {modalMounted("presets") && (
        <PresetBrowserModal
          open={modal === "presets"}
          onClose={close}
          activeKeyCount={active.keyCount}
          onCopy={copyPresetToClipboard}
        />
      )}
      {modalMounted("publishPreset") && (
        <PublishPresetModal
          open={modal === "publishPreset"}
          onClose={close}
          pattern={publishPattern}
          keyCount={publishKeyCount}
        />
      )}
      {modalMounted("feedback") && (
        <FeedbackModal open={modal === "feedback"} onClose={close} />
      )}
      {modalMounted("mapSettings") && (
        <SettingsModal
          open={modal === "mapSettings"}
          onClose={close}
          meta={meta}
          onMeta={updateMeta}
          audio={audioFile}
          background={activeBg}
          bgScope={bgScope}
          onBgScope={setBgScope}
          onAudioFile={onAudioFile}
          onBackgroundFile={onBackgroundFile}
          onClearBackground={onClearBackground}
          video={activeVideo}
          videoOffsetMs={active.videoOffsetMs ?? 0}
          onVideoFile={onVideoFile}
          onClearVideo={onClearVideo}
          onVideoOffsetMs={onVideoOffsetMs}
          onImportOsz={(f) => void importArchive(f)}
          onImportOsuDiff={(f) => void openOsuFiles([f])}
          onImportSm={requestImportSm}
          onImportSmPack={onImportSmPack}
          activeDiff={active}
          onSmMeta={(sm) => patchDifficulty(active.id, { smMeta: sm })}
          onBeatmapId={(id) => patchDifficulty(active.id, { beatmapId: id })}
          difficulties={difficulties}
          onBatchApply={applyBatch}
          readOnly={!canEdit}
          live={liveEnabled}
        />
      )}
      {modalMounted("settings") && (
        <AppSettingsModal
          initialTab={settingsTab}
          onAudioSetup={() => { pauseAudio(); setModal("audioSetup"); }}
          keyCount={active.keyCount}
          open={modal === "settings"}
          onClose={close}
          uiScale={appSettings.uiScale}
          onUiScale={(v) => setAppSettings((s) => ({ ...s, uiScale: v }))}
          altWheelAction={appSettings.altWheelAction}
          onAltWheelAction={(v) =>
            setAppSettings((s) => ({ ...s, altWheelAction: v }))
          }
          playfieldScale={appSettings.playfieldScale}
          onPlayfieldScale={(v) =>
            setAppSettings((s) => ({ ...s, playfieldScale: v }))
          }
          noteHeightScale={appSettings.noteHeightScale}
          onNoteHeightScale={(v) =>
            setAppSettings((s) => ({ ...s, noteHeightScale: v }))
          }
          longNoteBodyScale={appSettings.longNoteBodyScale}
          onLongNoteBodyScale={(v) =>
            setAppSettings((s) => ({ ...s, longNoteBodyScale: v }))
          }
          difficultyPanelOpen={appSettings.difficultyPanelOpen}
          onDifficultyPanelOpen={(v) =>
            setAppSettings((s) => ({ ...s, difficultyPanelOpen: v }))
          }
          showBottomTimeline={appSettings.showBottomTimeline}
          onShowBottomTimeline={(v) =>
            setAppSettings((s) => ({ ...s, showBottomTimeline: v }))
          }
          discordPresence={appSettings.discordPresence}
          onDiscordPresence={(v) =>
            setAppSettings((s) => ({ ...s, discordPresence: v }))
          }
          simplifyBottomTimeline={appSettings.simplifyBottomTimeline}
          onSimplifyBottomTimeline={(v) =>
            setAppSettings((s) => ({ ...s, simplifyBottomTimeline: v }))
          }
          showSkillsetGraph={appSettings.showSkillsetGraph}
          onShowSkillsetGraph={(v) =>
            // Switching the graph back on shows it in full, whatever state it
            // was minimised to before.
            setAppSettings((s) => ({
              ...s,
              showSkillsetGraph: v,
              ...(v ? { skillsetGraphCollapsed: false } : {}),
            }))
          }
          colourblindLanes={appSettings.colourblindLanes}
          onColourblindLanes={(v) =>
            setAppSettings((s) => ({ ...s, colourblindLanes: v }))
          }
          snapColouredNotes={appSettings.snapColouredNotes}
          onSnapColouredNotes={(v) =>
            setAppSettings((s) => ({ ...s, snapColouredNotes: v }))
          }
          moveNotesWithTiming={appSettings.moveNotesWithTiming}
          onMoveNotesWithTiming={(v) =>
            setAppSettings((s) => ({ ...s, moveNotesWithTiming: v }))
          }
          showPpCounter={appSettings.showPpCounter}
          onShowPpCounter={(v) =>
            setAppSettings((s) => ({ ...s, showPpCounter: v }))
          }
          showPatternTools={appSettings.showPatternTools}
          onShowPatternTools={(v) =>
            setAppSettings((s) => ({ ...s, showPatternTools: v }))
          }
          hitsoundsEnabled={appSettings.hitsoundsEnabled}
          onHitsoundsEnabled={(v) =>
            setAppSettings((s) => ({ ...s, hitsoundsEnabled: v }))
          }
          hitsoundVolume={appSettings.hitsoundVolume}
          onHitsoundVolume={(v) =>
            setAppSettings((s) => ({ ...s, hitsoundVolume: v }))
          }
          masterVolume={appSettings.masterVolume}
          onMasterVolume={(v) =>
            setAppSettings((s) => ({ ...s, masterVolume: v }))
          }
          musicVolume={audio.volume}
          onMusicVolume={setAudioVolume}
          dimBackground={appSettings.dimBackground}
          onDimBackground={(v) =>
            setAppSettings((s) => ({ ...s, dimBackground: v }))
          }
          backgroundBlur={appSettings.backgroundBlur}
          onBackgroundBlur={(v) =>
            setAppSettings((s) => ({ ...s, backgroundBlur: v }))
          }
          menuBackgroundMode={appSettings.menuBackgroundMode}
          onMenuBackgroundMode={(v) =>
            setAppSettings((s) => ({ ...s, menuBackgroundMode: v }))
          }
          menuBackground={menuBackground}
          menuBackgroundUrl={menuBackgroundUrl}
          menuBackgroundBusy={menuBackgroundBusy}
          menuBackgroundError={menuBackgroundError}
          onUploadMenuBackground={onUploadMenuBackground}
          onRemoveMenuBackground={onRemoveMenuBackground}
          smoothScrolling={appSettings.smoothScrolling}
          onSmoothScrolling={(v) =>
            setAppSettings((s) => ({ ...s, smoothScrolling: v }))
          }
          showWaveform={appSettings.showWaveform}
          onShowWaveform={(v) =>
            setAppSettings((s) => ({ ...s, showWaveform: v }))
          }
          waveformTransparency={appSettings.waveformTransparency}
          onWaveformTransparency={(v) =>
            setAppSettings((s) => ({ ...s, waveformTransparency: v }))
          }
          showTimingLines={appSettings.showTimingLines}
          onShowTimingLines={(v) =>
            setAppSettings((s) => ({ ...s, showTimingLines: v }))
          }
          upscroll={appSettings.upscroll}
          onUpscroll={(v) => setAppSettings((s) => ({ ...s, upscroll: v }))}
          svPreviewPlayback={appSettings.svPreviewPlayback}
          onSvPreviewPlayback={(v) =>
            setAppSettings((s) => ({ ...s, svPreviewPlayback: v }))
          }
          bpmAffectsScroll={appSettings.bpmAffectsScroll}
          onBpmAffectsScroll={(v) =>
            setAppSettings((s) => ({ ...s, bpmAffectsScroll: v }))
          }
          playtest={appSettings.playtest}
          onPlaytest={(v) => setAppSettings((s) => ({ ...s, playtest: v }))}
          savedSkinNames={skinLibrary.map((saved) => saved.name)}
          localAutosaveEnabled={appSettings.localAutosaveEnabled}
          onLocalAutosaveEnabled={(v) =>
            setAppSettings((s) => ({ ...s, localAutosaveEnabled: v }))
          }
          exportPngBackgroundsAsJpeg={appSettings.exportPngBackgroundsAsJpeg}
          onExportPngBackgroundsAsJpeg={(v) =>
            setAppSettings((s) => ({ ...s, exportPngBackgroundsAsJpeg: v }))
          }
          exportJpegQuality={appSettings.exportJpegQuality}
          onExportJpegQuality={(v) =>
            setAppSettings((s) => ({ ...s, exportJpegQuality: v }))
          }
          addCascadeTag={appSettings.addCascadeTag}
          onAddCascadeTag={(v) =>
            setAppSettings((s) => ({ ...s, addCascadeTag: v }))
          }
          offerMapCardAfterExport={appSettings.offerMapCardAfterExport}
          onOfferMapCardAfterExport={(v) =>
            setAppSettings((s) => ({ ...s, offerMapCardAfterExport: v }))
          }
          uiSoundsEnabled={appSettings.uiSoundsEnabled}
          onUiSoundsEnabled={(v) =>
            setAppSettings((s) => ({ ...s, uiSoundsEnabled: v }))
          }
          uiSoundVolume={appSettings.uiSoundVolume}
          onUiSoundVolume={(v) =>
            setAppSettings((s) => ({ ...s, uiSoundVolume: v }))
          }
          keepPitchWhenSlowed={appSettings.keepPitchWhenSlowed}
          onKeepPitchWhenSlowed={(v) =>
            setAppSettings((s) => ({ ...s, keepPitchWhenSlowed: v }))
          }
          editorKeybinds={editorKeybinds}
          onEditorKeybinds={(value) =>
            setAppSettings((s) => ({ ...s, editorKeybinds: value }))
          }
          accountSyncStatus={authUser ? accountSyncStatus : null}
          accountSyncError={accountSyncError}
          showMenuPlayers={appSettings.showMenuPlayers}
          onShowMenuPlayers={(v) =>
            setAppSettings((s) => ({ ...s, showMenuPlayers: v }))
          }
          hideStatus={appSettings.hideStatus}
          onHideStatus={(v) => setAppSettings((s) => ({ ...s, hideStatus: v }))}
          menuMusicEnabled={appSettings.menuMusicEnabled}
          onMenuMusicEnabled={(v) =>
            setAppSettings((s) => ({ ...s, menuMusicEnabled: v }))
          }
          logoSkinHitsounds={appSettings.logoSkinHitsounds}
          onLogoSkinHitsounds={(v) =>
            setAppSettings((s) => ({ ...s, logoSkinHitsounds: v }))
          }
          menuTipsEnabled={appSettings.menuTipsEnabled}
          onMenuTipsEnabled={(v) =>
            setAppSettings((s) => ({ ...s, menuTipsEnabled: v }))
          }
          introEnabled={appSettings.introEnabled}
          onIntroEnabled={(v) =>
            setAppSettings((s) => ({ ...s, introEnabled: v }))
          }
          shortcutNoticesEnabled={appSettings.shortcutNoticesEnabled}
          onShortcutNoticesEnabled={(v) => {
            setAppSettings((s) => ({ ...s, shortcutNoticesEnabled: v }));
            if (!v) setShortcutNotice(null);
          }}
          performanceMode={appSettings.performanceMode}
          onPerformanceMode={(v) =>
            setAppSettings((s) => ({ ...s, performanceMode: v }))
          }
          osuListenerEnabled={appSettings.osuListenerEnabled}
          onOsuListenerEnabled={(v) =>
            setAppSettings((s) => ({ ...s, osuListenerEnabled: v }))
          }
        />
      )}
      {modalMounted("skin") && (
        <SkinModal
          open={modal === "skin"}
          onClose={close}
          skin={skin}
          hitsoundSource={hitsoundSkinSource}
          hitsoundSkin={hitsoundSkin}
          savedSkins={skinLibrary}
          cloudSkins={cloudSkins}
          cloudAvailable={!!authUser}
          cloudLoading={cloudSkinsLoading}
          activeKeyCount={active.keyCount}
          onApplyPreset={onApplyPresetSkin}
          onApplySavedSkin={onApplyLocalSkin}
          onSkinFile={onSkinFile}
          onUploadCloudSkin={onUploadCloudSkin}
          onDownloadCloudSkin={onDownloadCloudSkin}
          onDeleteCloudSkin={onDeleteCloudSkin}
          onClearSkin={onClearSkin}
          onUseDefaultHitsounds={onUseDefaultHitsounds}
          onUseVisualHitsounds={onUseVisualHitsounds}
          error={skinError}
        />
      )}
      {modalMounted("tools") && (
        <ToolsModal
          open={modal === "tools"}
          onClose={close}
          snapDivisor={view.snapDivisor}
          riceCount={active.notes.length - holds}
          holdCount={holds}
          lnTicks={lnTicks}
          onLnTicks={setLnTicks}
          onFullLong={applyFullLong}
          onFullRice={applyFullRice}
          selectionRice={selectionCounts.rice}
          selectionHolds={selectionCounts.holds}
          onSelectionLong={applySelectionLong}
          onSelectionRice={applySelectionRice}
          onShiftLnEnds={applyShiftLnEnds}
          onDropShortLns={applyDropShortLns}
          trimActive={cropInfo.trimActive}
          cropRemoveCount={cropInfo.remove}
          cropClampCount={cropInfo.clamp}
          onCropToBrackets={applyCropToBrackets}
          ghostNotesActive={ghostNotes}
          ghostNotesReady={!!waveform?.buffer}
          ghostNotesAllowed={canEdit}
          onGhostNotes={setGhostNotes}
          onMapCard={() => openMapCard()}
        />
      )}
      {modalMounted("mapCard") && (
        <MapCardModal
          open={modal === "mapCard"}
          onClose={close}
          meta={meta}
          difficulties={difficulties}
          activeId={active.id}
          sharedTimingPoints={timingPoints}
          bgFiles={bgFiles}
          projectId={cloudProjectId ?? localProjectId}
          start={mapCardStart}
        />
      )}
      {mapCardOffer && (
        <MapCardPrompt
          open={mapCardOffer.open}
          target={mapCardOffer.target}
          askAfterExport={appSettings.offerMapCardAfterExport}
          onAskAfterExport={(v) =>
            setAppSettings((s) => ({ ...s, offerMapCardAfterExport: v }))
          }
          onSkip={() => setMapCardOffer((offer) => offer && { ...offer, open: false })}
          onCreate={(preset) => {
            setMapCardOffer((offer) => offer && { ...offer, open: false });
            openMapCard(preset);
          }}
        />
      )}
      {autoTimeOpen && (
        <AutoTimePrompt
          open
          status={autoTimeStatus}
          ready={!!waveform?.buffer}
          fileName={audioFile?.name ?? null}
          result={autoTimeResult}
          onRun={runAutoTime}
          onDismiss={() => setAutoTimeOpen(false)}
        />
      )}
      {modalMounted("timing") && (
        <TimingModal
          open={modal === "timing"}
          onClose={close}
          timingPoints={activeTimingPoints}
          onTimingPoints={applyTimingPoints}
          isPlaying={audio.isPlaying}
          playbackRate={audio.playbackRate}
          getCurrentTime={getCurrentTime}
          onToggle={toggleAudio}
          onSetPlaybackRate={setAudioPlaybackRate}
          audioBuffer={waveform?.buffer ?? null}
          timeScale={activeRate}
          onShiftMarkers={shiftTimingMarkers}
          moveNotes={appSettings.moveNotesWithTiming}
          onMoveNotes={
            canEdit
              ? (v) => setAppSettings((s) => ({ ...s, moveNotesWithTiming: v }))
              : undefined
          }
          onSelectionChange={setTimingSelection}
          previewTime={active.previewTime}
          onPreviewTime={canEdit ? setPreviewPoint : undefined}
        />
      )}
      {modal === "history" && <HistoryModal open onClose={close} entries={historyEntries} current={historyCurrent} onJump={jumpHistory} readOnly={!canEdit} live={liveEnabled} />}
      {modal === "audioSetup" && <AudioSetupModal exclusive={exclusiveAudio} onExclusive={changeExclusiveAudio} currentOffset={playtestSettings.audioOffsetMs} onApplyOffset={audioOffsetMs => setAppSettings(s => ({ ...s, playtest: { ...s.playtest, audioOffsetMs } }))} onClose={close} />}
      {modalMounted("sv") && featureFlags.sv_tools && (
        <SvModal
          open={modal === "sv" && featureFlags.sv_tools}
          onClose={close}
          timingPoints={activeTimingPoints}
          onTimingPoints={(points) => {
            applyTimingPoints(points);
            void logAnalyticsEvent("sv_applied", authUserRef.current?.id).catch(
              () => {},
            );
          }}
          getCurrentTime={getCurrentTime}
          selectionRange={selectionRange}
          readOnly={!canEdit}
          bpmScroll={appSettings.bpmAffectsScroll}
          bookmarks={active.bookmarks}
          bookmarkLabels={active.bookmarkLabels}
        />
      )}
      {modalMounted("difficulty") && (
        <DifficultyModal
          open={modal === "difficulty"}
          onClose={close}
          difficulty={active}
          onDifficulty={(d) => patchDifficulty(active.id, d)}
        />
      )}
      <BackgroundScopeModal
        open={askBgScope}
        previewUrl={pendingBgName ? bgFiles[pendingBgName]?.url ?? null : null}
        onClose={() => {
          setAskBgScope(false);
          setPendingBgName(null);
        }}
        onChoose={(scope) => {
          setBgScope(scope);
          if (pendingBgName) {
            markStructural();
            announceAssetChange("changed the background");
            setDifficulties((prev) =>
              prev.map((d) =>
                scope === "mapset" || d.id === activeId
                  ? { ...d, backgroundFilename: pendingBgName }
                  : d,
              ),
            );
          }
          setPendingBgName(null);
          setAskBgScope(false);
        }}
      />

      <Modal
        open={pendingImport !== null}
        onClose={cancelPendingImport}
        title={t("app.importNewTitle")}
        footer={
          <>
            <Button onClick={cancelPendingImport} disabled={importingMap || exporting}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmImportWithoutExport}
              disabled={importingMap || exporting}
            >
              {t("app.importDontSave")}
            </Button>
            <Button
              variant="accent"
              onClick={() => void confirmExportAndImport()}
              disabled={importingMap || exporting || !canExport}
            >
              {t("app.importExportFirst")}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            {t("app.importReplaceBefore")}{" "}
            <span className="font-medium text-slate-100">
              {pendingImport?.name}
            </span>
            {t("app.importReplaceAfter")}
          </p>
          <p className="text-xs text-slate-500">
            {t("app.importReplaceHint")}
          </p>
        </div>
      </Modal>

      <Modal
        open={pendingOsuDiffs !== null}
        onClose={() => setPendingOsuDiffs(null)}
        title={t("app.differentSong")}
        footer={
          <>
            <Button onClick={() => setPendingOsuDiffs(null)}>{t("common.cancel")}</Button>
            {pendingOsuDiffs?.length === 1 && (
              <Button onClick={openPendingOsuAsMap}>{t("app.openAsNewMap")}</Button>
            )}
            <Button
              variant="accent"
              onClick={() => addOsuDifficulties(pendingOsuDiffs ?? [])}
            >
              {pendingOsuDiffs && pendingOsuDiffs.length > 1
                ? t("app.addAsDifficulties")
                : t("app.addAsDifficulty")}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            {pendingOsuDiffs && pendingOsuDiffs.length > 1
              ? t("app.otherSongMany")
              : t("app.otherSongOne")}
          </p>
          <div className="rounded-lg border border-white/10 bg-ink-700/40 px-3 py-2 text-xs">
            <p className="text-slate-400">
              {t("app.openLabel")}{" "}
              <span className="font-medium text-slate-100">
                {meta.artist} - {meta.title}
              </span>
            </p>
            <p className="mt-1 text-slate-400">
              {t("app.fileLabel")}{" "}
              <span className="font-medium text-slate-100">
                {pendingOsuDiffs?.[0]
                  ? `${pendingOsuDiffs[0].parsed.meta.artist} - ${pendingOsuDiffs[0].parsed.meta.title}`
                  : ""}
              </span>
            </p>
          </div>
          <p className="text-xs text-slate-500">
            {t("app.addingKeeps")}
          </p>
        </div>
      </Modal>

      <MapperNameModal
        open={mapperPrompt !== null}
        target={mapperPrompt?.target ?? ""}
        onClose={() => setMapperPrompt(null)}
        onConfirm={confirmMapperName}
        onLogin={authLogin}
      />

      <ExportValidationModal
        open={exportCheck !== null}
        result={exportCheck?.result ?? null}
        target={exportCheck?.target ?? ""}
        onClose={() => setExportCheck(null)}
        onProceed={() => {
          const run = exportCheck?.run;
          setExportCheck(null);
          run?.();
        }}
        onRemoveDuplicates={removeDuplicates}
      />

      {modalMounted("aimod") && (
        <AiModModal
          open={modal === "aimod"}
          onClose={close}
          report={aiModReport}
          activeDiffId={active.id}
          activeDiffName={active.name || "(unnamed)"}
          onRefresh={runAiModCheck}
          onJump={handleAiModJump}
          unsnappedCount={aiModUnsnapped}
          onResnap={() => setConfirmResnap(true)}
        />
      )}

      {adminEverOpenedRef.current && modalMounted("admin") && (
        <Suspense fallback={null}>
          <AdminPanel
            open={modal === "admin"}
            onClose={close}
            invisible={invisibleMode}
            onToggleInvisible={toggleInvisibleMode}
          />
        </Suspense>
      )}

      {modalMounted("share") && (
        <ShareModal
          open={modal === "share"}
          onClose={close}
          projectId={cloudProjectId}
          canPublish={
            !!authUser && (!cloudOwnerId || cloudOwnerId === authUser.id)
          }
          publicUrl={publicMapUrl}
          onPublish={publishCurrentMap}
        />
      )}

      {modalMounted("packBrowser") && (
        <PackBrowserModal
          open={modal === "packBrowser"}
          onClose={close}
          onBack={() => {
            setScannedPackSongs([]);
            setPackError(null);
            setModal(null);
          }}
          songs={scannedPackSongs}
          onImport={importPackSong}
          error={packError}
          scanning={scanningPack}
        />
      )}
      </Suspense>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />

      <VolumeRings
        changeKey={volumeHudKey}
        values={{
          master: appSettings.masterVolume,
          music: audio.volume,
          effects: appSettings.hitsoundVolume,
        }}
        active={volumeTarget}
        onActive={selectVolumeMeter}
        onAdjust={adjustVolumeMeter}
        onHide={resetVolumeMeter}
      />

      {appSettings.shortcutNoticesEnabled && (
        <OnScreenDisplay notice={shortcutNotice} onHidden={hideShortcutNotice} />
      )}

      {osuConnectedAt !== null && (
        <TimedNotification
          durationMs={3000}
          onDismiss={acknowledgeOsu}
          resetKey={osuConnectedAt}
          placement="top-center"
          progressClassName="bg-accent"
          className="fixed left-1/2 top-16 z-[60] flex items-center gap-2.5 border border-white/10 bg-ink-800/90 py-2 pb-3 pl-3 pr-4 text-sm text-slate-100 shadow-2xl backdrop-blur-2xl"
        >
          <span aria-hidden className="h-4 w-0.5 shrink-0 bg-accent" />
          {t("osu.connected")}
        </TimedNotification>
      )}

      {peerNotice && (
        <TimedNotification
          durationMs={3500}
          onDismiss={() => setPeerNotice(null)}
          resetKey={peerNotice.key}
          placement="top-center"
          progressClassName="bg-accent"
          className="fixed left-1/2 top-16 z-[60] flex items-center gap-2 rounded-full border border-white/10 bg-ink-800/90 py-1.5 pb-2.5 pl-1.5 pr-4 text-sm text-slate-100 shadow-2xl backdrop-blur-2xl"
        >
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-ink-700/70 text-[10px] font-semibold">
            {peerNotice.avatar ? (
              <img
                src={peerNotice.avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <UserIcon className="h-4 w-4 text-slate-300" />
            )}
          </span>
          {peerNotice.text}
        </TimedNotification>
      )}

      <div className="pointer-events-none fixed bottom-28 left-1/2 z-[65] flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2">
        {saveStatus === "error" && (
          <TimedNotification
            durationMs={6500}
            onDismiss={() => setSaveStatus(null)}
            resetKey={`${saveStatus}:${saveErrorDetail ?? ""}`}
            showClose
            progressClassName="bg-red-400"
            className="pointer-events-auto max-w-full rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 pb-3 text-sm text-red-200 shadow-lg"
          >
            {saveErrorDetail
              ? `${t("file.saveFailed")} (${saveErrorDetail})`
              : t("file.saveFailed")}
          </TimedNotification>
        )}

        <TimedNotification
          open={!!desktopUpdate}
          durationMs={null}
          resetKey="desktop-update"
          showClose
          onDismiss={() => setDesktopUpdate(null)}
          progressClassName="bg-accent"
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-lg border border-white/10 bg-ink-800/95 py-2 pb-3 pl-4 pr-9 text-sm text-slate-200 shadow-lg backdrop-blur-xl"
        >
          <span>
            {t("update.available", { version: desktopUpdate?.version ?? "" })}
          </span>
          <button
            type="button"
            onClick={applyDesktopUpdate}
            disabled={updating}
            className="shrink-0 rounded-md bg-accent/90 px-2.5 py-1 text-xs font-semibold text-white transition duration-150 hover:bg-accent-soft/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] disabled:opacity-60"
          >
            {updating ? t("update.installing") : t("update.install")}
          </button>
        </TimedNotification>

        <TimedNotification
          open={pwaUpdateReady}
          durationMs={null}
          resetKey="pwa-update"
          showClose
          progressClassName="bg-accent"
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-lg border border-white/10 bg-ink-800/95 py-2 pb-3 pl-4 pr-9 text-sm text-slate-200 shadow-lg backdrop-blur-xl"
        >
          <span>{t("app.newVersion")}</span>
          <button
            type="button"
            onClick={applyPendingUpdate}
            className="shrink-0 rounded-md bg-accent/90 px-2.5 py-1 text-xs font-semibold text-white transition duration-150 hover:bg-accent-soft/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
          >
            {t("app.reload")}
          </button>
        </TimedNotification>

        <TimedNotification
          open={needsSongHint && !audioFile}
          durationMs={8000}
          onDismiss={() => setNeedsSongHint(false)}
          resetKey="needs-song"
          showClose
          progressClassName="bg-accent"
          className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-lg border border-white/10 bg-ink-800/95 px-4 py-2 pb-3 text-sm text-slate-200 shadow-lg backdrop-blur-xl"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
            <SampleMapsIcon className="h-4 w-4" />
          </span>
          <span>{t("menu.needSong")}</span>
        </TimedNotification>

        <TimedNotification
          open={cloudSaveStatus === "saving" || exporting}
          durationMs={null}
          resetKey={cloudSaveStatus === "saving" ? "cloud-save" : "export"}
          progressClassName="bg-accent"
          className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-lg border border-white/10 bg-ink-800/95 px-4 py-2 pb-3 text-sm text-slate-200 shadow-lg backdrop-blur-xl"
        >
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-500 border-t-accent" />
          {cloudSaveStatus === "saving" ? (
            t("app.savingToAccount")
          ) : (
            // Fixed width: the phase labels vary wildly in length ("Compressing
            // the .osz" vs "Encoding audio - very long filename.mp3") and a
            // shrink-to-fit toast would resize on every report.
            <span className="flex w-[17rem] flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3">
                <span>{t("app.exportingMap")}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-300/40">
                  {exportProgress
                    ? `${Math.round(exportProgress.ratio * 100)}%`
                    : ""}
                </span>
              </span>
              <span
                className="block h-1 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={Math.round((exportProgress?.ratio ?? 0) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={exportProgress?.label ?? t("app.exporting")}
              >
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                  style={{
                    width: `${Math.round((exportProgress?.ratio ?? 0) * 100)}%`,
                  }}
                />
              </span>
              {/* Reserve the line so the toast keeps its height between phases. */}
              <span className="block h-4 truncate text-[11px] leading-4 text-slate-300/40">
                {exportProgress?.label ?? ""}
              </span>
            </span>
          )}
        </TimedNotification>

        {(cloudSaveStatus === "saved" || cloudSaveStatus === "error") && (
          <TimedNotification
            durationMs={cloudSaveStatus === "saved" ? 3000 : 6500}
            onDismiss={() => {
              if (cloudSaveStatus === "error") setCloudError(null);
              setCloudSaveStatus(null);
            }}
            resetKey={`${cloudSaveStatus}:${cloudError ?? ""}`}
            progressClassName={
              cloudSaveStatus === "saved" ? "bg-emerald-400" : "bg-red-400"
            }
            className={`pointer-events-auto max-w-full rounded-lg border px-4 py-2 pb-3 text-sm shadow-lg ${
              cloudSaveStatus === "saved"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
                : "border-red-500/40 bg-red-950/90 text-red-200"
            }`}
          >
            {cloudSaveStatus === "saved"
              ? t("app.savedToAccount")
              : cloudError ?? t("app.saveToAccountFailed")}
          </TimedNotification>
        )}

        <TimedNotification
          open={!!cloudError && cloudSaveStatus !== "error"}
          durationMs={6500}
          onDismiss={() => setCloudError(null)}
          resetKey={cloudError}
          progressClassName="bg-red-400"
          showClose
          className="pointer-events-auto max-w-full rounded-lg border border-red-500/40 bg-red-950/90 py-2 pb-3 pl-4 pr-9 text-sm text-red-200 shadow-lg"
        >
          {cloudError ?? ""}
        </TimedNotification>

        <TimedNotification
          open={!!importError}
          durationMs={6500}
          onDismiss={() => setImportError(null)}
          resetKey={importError}
          progressClassName="bg-red-400"
          showClose
          className="pointer-events-auto max-w-full rounded-lg border border-red-500/40 bg-red-950/90 py-2 pb-3 pl-4 pr-9 text-sm text-red-200 shadow-lg"
        >
          {importError ?? ""}
        </TimedNotification>

        <TimedNotification
          open={!!importNotice}
          durationMs={4000}
          onDismiss={() => setImportNotice(null)}
          resetKey={importNotice}
          progressClassName="bg-emerald-400"
          className="pointer-events-auto max-w-full rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 pb-3 text-sm text-emerald-200 shadow-lg"
        >
          {importNotice ?? ""}
        </TimedNotification>
      </div>

      <InviteNotifications
        notices={invites}
        onJoin={joinInvite}
        onIgnore={ignoreInvite}
      />

      <Modal
        open={showHomeConfirm}
        onClose={() => setShowHomeConfirm(false)}
        center
        title={t("home.confirmTitle")}
        footer={
          <>
            <Button onClick={() => setShowHomeConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                setShowHomeConfirm(false);
                document.body.classList.add('fade-out');
                setTimeout(() => window.location.reload(), 120);
              }}
            >
              {t("home.returnButton")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">{t("home.confirmBody")}</p>
      </Modal>

      <HoldConfirmDialog
        open={pendingDeleteDiffIds !== null}
        title={
          pendingDeleteDiffIds && pendingDeleteDiffIds.length > 1
            ? t("app.deleteDiffsTitle")
            : t("app.deleteDiffTitle")
        }
        message={(() => {
          const ids = pendingDeleteDiffIds ?? [];
          if (ids.length > 1)
            return t("app.deleteDiffsBody", { count: ids.length });
          const d = difficulties.find((x) => x.id === ids[0]);
          const name = d?.name?.trim();
          return name ? t("app.deleteDiffBody", { name }) : t("app.deleteDiffBodyUnnamed");
        })()}
        onConfirm={() => {
          if (pendingDeleteDiffIds) deleteDifficulties(pendingDeleteDiffIds);
          setPendingDeleteDiffIds(null);
        }}
        onCancel={() => setPendingDeleteDiffIds(null)}
      />

      <HoldConfirmDialog
        open={confirmResnap}
        title={t("app.resnapTitle")}
        message={t("app.resnapBody", { count: aiModUnsnapped, name: active.name || t("app.unnamed") })}
        confirmLabel={t("app.holdToResnap")}
        onConfirm={handleResnap}
        onCancel={() => setConfirmResnap(false)}
      />

      {exiting && <ExitCurtain />}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm text-slate-300 transition duration-150 hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="relative grid h-8 w-8 place-items-center rounded-md text-base text-slate-300 transition duration-150 hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-4 w-4 transition-transform duration-200 ${
        flipped ? "rotate-180" : ""
      }`}
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

const LANDING_DO_KEYS = [
  "landing.do1",
  "landing.do2",
  "landing.do3",
  "landing.do4",
  "landing.do5",
  "landing.do6",
  "landing.do7",
  "landing.do8",
  "landing.do9",
  "landing.do10",
] as const;

const LANDING_FAQ_KEYS = [
  ["landing.faqQ1", "landing.faqA1"],
  ["landing.faqQ2", "landing.faqA2"],
  ["landing.faqQ3", "landing.faqA3"],
  ["landing.faqQ4", "landing.faqA4"],
  ["landing.faqQ5", "landing.faqA5"],
  ["landing.faqQ6", "landing.faqA6"],
] as const;

const LANDING_GUIDES = [
  { href: "/how-to-make-an-osu-mania-map", key: "landing.guide1" },
  { href: "/osu-to-stepmania", key: "landing.guide2" },
  { href: "/osu-mania-map-viewer", key: "landing.guide3" },
  { href: "/osu-mania-pack-creator", key: "landing.guide4" },
] as const;

function LandingText({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="text-slate-300">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function LandingCopy() {
  const t = useT();
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 pt-8 text-xs text-slate-500">
        <p>
          {t("empty.madeBy")}{" "}
          <a
            href="https://osu.ppy.sh/u/sheepex_"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-300 transition hover:text-accent"
          >
            sheepex_
          </a>
        </p>
        <p>
          {t("empty.contributors")}{" "}
          <a
            href="https://github.com/kaanreal"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-300 transition hover:text-accent"
          >
            kaanreal
          </a>
        </p>
        <a
          href="https://ko-fi.com/sheepex"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-slate-400 transition hover:text-accent"
        >
          {t("empty.support")}
        </a>
      </div>

      <section className="mx-auto max-w-2xl px-5 pb-14 pt-6 text-left text-sm leading-relaxed text-slate-400">
        <h1 className="mb-3 text-xl font-bold text-slate-200">
          {t("landing.h1")}
        </h1>
        <p className="mb-2">
          <LandingText text={t("landing.intro")} />
        </p>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t("landing.doTitle")}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          {LANDING_DO_KEYS.map((key) => (
            <li key={key}>
              <LandingText text={t(key)} />
            </li>
          ))}
        </ul>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t("landing.faqTitle")}
        </h2>
        <dl>
          {LANDING_FAQ_KEYS.map(([question, answer]) => (
            <Fragment key={question}>
              <dt className="mt-3 font-semibold text-slate-300">
                {t(question)}
              </dt>
              <dd>
                <LandingText text={t(answer)} />
              </dd>
            </Fragment>
          ))}
        </dl>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t("landing.guidesTitle")}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          {LANDING_GUIDES.map((guide) => (
            <li key={guide.href}>
              <a
                href={guide.href}
                className="text-slate-300 underline-offset-2 transition hover:text-accent hover:underline"
              >
                {t(guide.key)}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
