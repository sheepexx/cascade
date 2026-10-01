import { useNotificationInbox } from "./app/useNotificationInbox";
import { useSkins } from "./app/useSkins";
import { useCloudProject } from "./app/useCloudProject";
import { useLocalSave } from "./app/useLocalSave";
import { useRecoveryActions } from "./app/useRecoveryActions";
import { useProjectLoading } from "./app/useProjectLoading";
import { useMapExport } from "./app/useMapExport";
import { useDifficultyActions } from "./app/useDifficultyActions";
import { useTimelineEdits } from "./app/useTimelineEdits";
import { useEditHistory } from "./app/useEditHistory";
import { useNoteEditing } from "./app/useNoteEditing";
import { useCollabSession } from "./app/useCollabSession";
import { useAppSettings } from "./app/useAppSettings";
import {
  initialPlaytestState,
  usePlaytest,
  type PlaytestRuntimeState,
} from "./app/usePlaytest";
import { useFeatureFlags } from "./app/useFeatureFlags";
import { useAccountSettingsSync } from "./app/useAccountSettingsSync";
import {
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
import type { AiModReport, AiModIssue } from "./lib/aimod";
import { resnapNotes, countUnsnapped } from "./lib/snapCheck";
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
import {
  loadEditorWorkspace,
  CommentsSidebar,
  PlaytestOverlay,
  PlaytestRunStats,
  TransportBar,
  SharedMapPage,
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
  EditorLayoutOverlay,
  AudioSetupModal,
  loadExternalEdit,
  BackupsModal,
  AdminPanel,
  preloadLazyChunks,
  MemoizedManiaEditor,
  MemoizedBottomTimeline,
  MemoizedDifficultySidebar,
  MemoizedPPCounter,
  MemoizedPlaytestNpsGraph,
} from "./app/lazySurfaces";
import {
  blurActiveControl,
  hasDraggedFiles,
  isAudioFile,
  isImageFile,
  isOskFile,
  isOsuFile,
  isOszFile,
  isSingleChartFile,
  isSmFile,
  isTypingTarget,
  isVideoFile,
  loadFile,
  newLocalProjectId,
} from "./app/appUtils";
import type { BookmarkLoopState, ModalId, OsuEntry } from "./app/appTypes";
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
import { difficultyRate } from "./lib/rateChange";
import type { Comment } from "./lib/comments";
import type { AiModFileFacts } from "./lib/aimodFiles";
import type { SampleFile } from "./lib/mapSamples";
import {
  closestDivisor,
  nextSnapPreset,
  presetDivisors,
  stepDivisor,
} from "./lib/snapPresets";
import type { PatternNote } from "./lib/patterns";
import { computeStarRating } from "./lib/starRating";
import { type AccessRole } from "./lib/collab";
import { type ValidationResult } from "./lib/validation";
import { Button } from "./components/ui/Controls";
import { TimedNotification } from "./components/ui/TimedNotification";
import { pushClip } from "./lib/clipboardStore";
import { formatOsuTimestamp } from "./lib/osuTimestamp";
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
import { osuStatus, type OsuStatus } from "./lib/osuDesktop";
import { watchLaunchFiles } from "./lib/desktopFiles";
import { displaySong } from "./lib/metadataDisplay";
import { clampHoldConfirmMs, clampParallaxStrength } from "./lib/interfaceFeel";
import { updatePresence } from "./lib/discordPresence";
import {
  checkDesktopUpdate,
  installDesktopUpdate,
  type DesktopUpdate,
} from "./lib/desktopUpdate";
import { usePwa } from "./hooks/usePwa";
import { DesktopDownloadLink } from "./components/DesktopDownloadLink";
import { NotificationInbox } from "./components/NotificationInbox";
import { LandingCopy } from "./components/LandingCopy";
import { ChevronIcon, IconButton, MenuButton } from "./components/header/HeaderButtons";
import { InviteNotifications } from "./components/InviteNotifications";
import { playUiSound, preloadUiSounds } from "./lib/uiSounds";
import { useAuth } from "./lib/auth";
import { useLocale, type MessageKey } from "./lib/i18n";
import { logAnalyticsEvent } from "./lib/analytics";
import { useAudio } from "./hooks/useAudio";
import { useWaveform } from "./hooks/useWaveform";
import { useHitsounds } from "./hooks/useHitsounds";
import { countHitsounds } from "./lib/noteTools";
import { buildOsuFile } from "./lib/osuExport";
import { uniqueDifficultyName } from "./lib/rateChange";
import { ExternalEditModal } from "./components/menus/ExternalEditModal";
import { MALODY_MAX_KEYS } from "./lib/formatLimits";
import { useSkillsetTimeline } from "./lib/msd/useMsd";
import { msdSupportsKeyCount } from "./lib/msd/minacalc";
import { SkillsetGraph } from "./components/SkillsetGraph";
import {
  PLAYHEAD_FROM_EDGE as PLAYTEST_HIT_LINE_FROM_EDGE,
  resolvePlayfieldLayout,
} from "./lib/playfieldGeometry";
import { type PlayfieldBounds } from "./lib/hudLayout";
import { HudPreviewViewport } from "./components/HudPreviewViewport";
import { HudScrubber } from "./components/HudScrubber";
import {
  loadProject,
  saveVolume,
  loadVolume,
  saveViewPreferences,
  loadViewPreferences,
  projectStorageKey,
  type SavedProject,
} from "./lib/persistence";
import { type RecoveryChart, type RecoveryMedia } from "./lib/recovery";
import { useProjectRecovery } from "./hooks/useProjectRecovery";
import { formatIssues } from "./lib/roundTrip";
import { RecoveryPrompt } from "./components/RecoveryPrompt";
import {
  DEFAULT_SONG_META,
  DEFAULT_VIEW,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  defaultTimingPoints,
  makeDifficulty,
  makeRedPoint,
  uid,
  type BackgroundScope,
  type Difficulty,
  type LoadedFile,
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
import { MAX_UI_SCALE, MIN_UI_SCALE, uiScaleFromWheel } from "./lib/uiScale";
import { OnScreenDisplay } from "./components/ui/OnScreenDisplay";
import { osdRange, osdToggle, type OsdNotice } from "./lib/osd";
import {
  MAX_PLAYFIELD_SCALE,
  MIN_PLAYFIELD_SCALE,
  playfieldScaleFromWheel,
  timelineZoomFromWheel,
  volumeFromWheel,
} from "./lib/altWheel";
import { type ProgressReport } from "./lib/progress";
import type { AutoTimeStatus } from "./components/AutoTimePrompt";
import { useMountedModals } from "./hooks/useMountedModals";
import { remapBookmarkLabels } from "./lib/bookmarks";

/** Lane width for the skin dialog's playfield, independent of the user's own. */
const SKIN_PREVIEW_SCALE = 0.7;

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
  const viewRef = useRef(view);
  viewRef.current = view;

  const [audioFiles, setAudioFiles] = useState<Record<string, LoadedFile>>({});
  const [bgFiles, setBgFiles] = useState<Record<string, LoadedFile>>({});
  const [videoFiles, setVideoFiles] = useState<Record<string, LoadedFile>>({});
  // The mapset's own hitsound samples, from an .osz; they play in place of
  // the skin's where osu! would.
  const [sampleFiles, setSampleFiles] = useState<Record<string, SampleFile>>({});
  const [pendingBgName, setPendingBgName] = useState<string | null>(null);
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
  const {
    featureFlags,
    featureFlagsRef,
  } = useFeatureFlags();
  const [packCreatorOpen, setPackCreatorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const phoneViewport = usePhoneViewport();
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [pendingDeleteDiffIds, setPendingDeleteDiffIds] = useState<
    string[] | null
  >(null);
  const [projectStarted, setProjectStarted] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [shortcutNotice, setShortcutNotice] = useState<
    (OsdNotice & { id: number }) | null
  >(null);
  const [volumeHudKey, setVolumeHudKey] = useState(0);
  const {
    appSettings,
    appSettingsRef,
    outputVolume,
    preferOriginalMetadata,
    setAppSettings,
  } = useAppSettings();
  /** Shows the on-screen display: a setting with its new value, or a message. */
  const announceShortcut = useCallback((notice: OsdNotice | string) => {
    if (!appSettingsRef.current.shortcutNoticesEnabled) return;
    const body = typeof notice === "string" ? { label: notice } : notice;
    setShortcutNotice({ ...body, id: Date.now() + Math.random() });
    playUiSound("notice");
  }, [appSettingsRef]);
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
  const [bgScope, setBgScope] = useState<BackgroundScope>("mapset");
  const [askBgScope, setAskBgScope] = useState(false);
  const [lnTicks, setLnTicks] = useState(1);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
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
  const [currentHitSound, setCurrentHitSound] = useState(0);
  const [currentSampleSet, setCurrentSampleSet] = useState(0);
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
  const [cloudError, setCloudError] = useState<string | null>(null);
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
  const activeNotesRef = useRef(active.notes);
  activeNotesRef.current = active.notes;
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
  const playfieldBoundsRef = useRef<PlayfieldBounds | null>(null);
  // The editor's layout editor. Playtest has its own, driven by playtest.hudEditing.
  const [layoutEditing, setLayoutEditing] = useState(false);
  // Centres the on-screen display over the playfield, near its top.
  const osdAnchor = useCallback(() => {
    const bounds = playfieldBoundsRef.current;
    const canvas = document.querySelector<HTMLCanvasElement>("[data-playfield-canvas]");
    if (!bounds || !canvas || !canvas.clientWidth) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = rect.width / canvas.clientWidth;
    return {
      x: rect.left + (bounds.left + bounds.width / 2) * scale,
      y: rect.top + rect.height * 0.18,
    };
  }, []);
  const difficultiesRef = useRef(difficulties);
  difficultiesRef.current = difficulties;
  const audioFilesRef = useRef(audioFiles);
  audioFilesRef.current = audioFiles;
  const bgFilesRef = useRef(bgFiles);
  bgFilesRef.current = bgFiles;
  const videoFilesRef = useRef(videoFiles);
  videoFilesRef.current = videoFiles;
  const sampleFilesRef = useRef(sampleFiles);
  sampleFilesRef.current = sampleFiles;
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
        song: projectStarted ? displaySong(meta, preferOriginalMetadata) : null,
        difficulty: active?.name ?? null,
        keyCount: active?.keyCount ?? null,
        playtesting: playtest.active,
      }).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    appSettings.discordPresence,
    projectStarted,
    meta,
    preferOriginalMetadata,

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
  const {
    cloudSkins,
    cloudSkinsLoading,
    effectiveHitsounds,
    hitsoundSkin,
    hitsoundSkinSource,
    menuBackground,
    menuBackgroundBusy,
    menuBackgroundError,
    menuBackgroundUrl,
    onApplyLocalSkin,
    onApplyPresetSkin,
    onClearSkin,
    onDeleteCloudSkin,
    onDeleteLocalSkin,
    onDownloadCloudSkin,
    onRemoveMenuBackground,
    onSkinFile,
    onUploadCloudSkin,
    onUploadMenuBackground,
    onUseDefaultHitsounds,
    onUseSelectedHitsounds,
    onUseVisualHitsounds,
    setHitsoundSkinSource,
    skin,
    skinError,
    skinLibrary,
  } = useSkins({
    appSettings,
    authUser,
    authUserRef,
    setAppSettings,
    t,
  });

  const recoveryChart = useMemo<RecoveryChart>(
    () => ({ meta, timingPoints, difficulties, activeId, bgScope }),
    [meta, timingPoints, difficulties, activeId, bgScope],
  );
  const recoveryMedia = useMemo<RecoveryMedia>(
    () => ({
      audioFiles: Object.values(audioFiles).map(({ name, blob }) => ({ name, blob })),
      backgroundFiles: Object.values(bgFiles).map(({ name, blob }) => ({ name, blob })),
      videoFiles: Object.values(videoFiles).map(({ name, blob }) => ({ name, blob })),
      sampleFiles: Object.values(sampleFiles),
    }),
    [audioFiles, bgFiles, videoFiles, sampleFiles],
  );
  const {
    noteEdit: noteRecoveryEdit,
    saveToken: recoverySaveToken,
    markSaved: markRecoverySaved,
    backup: backupRecovery,
    flush: flushRecovery,
  } = useProjectRecovery({
    enabled: projectStarted,
    projectId: localProjectId,
    chart: recoveryChart,
    media: recoveryMedia,
    onClosedUnsaved: (title) =>
      setImportNotice(
        t("recovery.closedUnsaved", { title: title.trim() || t("app.unnamed") }),
      ),
  });
  const localProjectIdRef = useRef(localProjectId);
  localProjectIdRef.current = localProjectId;

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
    outputVolume,
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
  }, [announceShortcut, t, setAppSettings]);

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
  // The skin dialog joins timing and sv in skipping the blur-and-duck
  // atmosphere: all three are watched while the song runs, and the skin one
  // previews the playfield itself, so dimming what it is showing — and
  // flipping that dim every time Space pauses — defeats the point.
  const modalAtmosphereOpen =
    (modal !== null && modal !== "timing" && modal !== "sv" && modal !== "skin") ||
    askBgScope ||
    pendingImport !== null ||
    exportCheck !== null ||
    mapperPrompt !== null ||
    showHomeConfirm ||
    pendingDeleteDiffIds !== null;
  const modalAtmosphereActive = modalAtmosphereOpen && audio.isPlaying;

  const { playNote: playtestHitsound } = useHitsounds(
    getCurrentTime,
    audio.isPlaying && !playtest.active,
    active.notes,
    active.timingPoints?.length ? active.timingPoints : timingPoints,
    appSettings.hitsoundVolume * outputVolume,
    appSettings.hitsoundsEnabled,
    modalAtmosphereActive,
    effectiveHitsounds,
    audio.duration > 0,
    sampleFiles,
  );

  const noop = useCallback(() => {}, []);
  const audioDuration = audio.duration;
  const {
    announceAssetChange,
    applyingRemoteRef,
    assetAttemptsRef,
    canEdit,
    canEditRef,
    cloudProjectIdRef,
    cloudRevisionRef,
    cloudSavePromiseRef,
    collab,
    collabRef,
    commitDiffFields,
    commitNoteOp,
    liveEnabled,
    localEditVersionRef,
    markStructural,
    opRedoRef,
    opUndoRef,
    ownMutationIdsRef,
    pendingDocSyncRef,
    pendingSeekRef,
    publishedAssetBlobsRef,
    sessionActiveRef,
    updateMeta,
  } = useCollabSession({
    activeId,
    activeIdRef,
    audioDuration,
    audioFiles,
    authUser,
    authUserRef,
    bgFiles,
    bgScope,
    cloudOwnerId,
    cloudProjectId,
    currentTimeRef,
    difficulties,
    difficultiesRef,
    invisibleMode,
    localProjectIdRef,
    markRecoverySaved,
    meta,
    metaRef,
    myRole,
    noteRecoveryEdit,
    playtest,
    recoverySaveToken,
    seekAudio,
    setActiveId,
    setAudioFiles,
    setBgFiles,
    setCloudError,
    setDifficulties,
    setMeta,
    setMyRole,
    setPeerNotice,
    setTimingPoints,
    t,
    timingPoints,
    timingPointsRef,
    view,
  });

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
    [setAppSettings],
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
  }, [adjustVolumeMeter, announceShortcut, t, appSettingsRef, setAppSettings]);

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
    [setAppSettings],
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
  const {
    activeSkin,
    autoplaySummary,
    exitPlaytest,
    heldPlaytestKeys,
    playtestDroppedView,
    playtestGameplayTime,
    playtestHiddenView,
    playtestHoldingView,
    playtestLook,
    playtestPressedColumnsRef,
    playtestRate,
    playtestRunNotes,
    playtestScore,
    playtestSettings,
    playtestWindows,
    restartPlaytest,
    resumePlaytest,
    skillProfile,
    startPlaytest,
  } = usePlaytest({
    active,
    activeNotesRef,
    announceShortcut,
    appSettings,
    audio,
    audioFile,
    authUserRef,
    editorKeybindsRef,
    featureFlagsRef,
    getCurrentTime,
    modalRef,
    openSettings,
    pauseAudio,
    playAudio,
    playtest,
    playtestHitsound,
    playtestRef,
    projectStarted,
    seekAudio,
    setAppSettings,
    setAudioPlaybackRate,
    setCommentsOpen,
    setModal,
    setPlaytest,
    skin,
    skinLibrary,
    t,
  });

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
  const playfieldLayout = useMemo(
    () =>
      resolvePlayfieldLayout({
        settings: appSettings,
        view,
        playtest: playtestSettings,
        playtestActive: playtest.active,
        rate: playtestRate,
      }),
    [appSettings, view, playtestSettings, playtest.active, playtestRate],
  );
  const editorView = useMemo(
    () => ({ ...view, scrollSpeed: playfieldLayout.scrollSpeed }),
    [view, playfieldLayout.scrollSpeed],
  );

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
  }, [t, cloudProjectIdRef]);
  const [importingMap, setImportingMap] = useState(false);
  useEffect(() => {
    if (importingMap) void loadEditorWorkspace();
  }, [importingMap]);
  // Long jobs report a 0-1 ratio plus a label so the loader can say what it is
  // actually doing instead of spinning indefinitely.
  const [importProgress, setImportProgress] = useState<ProgressReport | null>(
    null,
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
    [markStructural, canEditRef],
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
    [patchDifficulty, markStructural, appSettingsRef, canEditRef],
  );

  const [externalEdit, setExternalEdit] = useState<{
    path: string;
    diffId: string;
    name: string;
  } | null>(null);
  const [externalEditBusy, setExternalEditBusy] = useState(false);
  const [externalEditError, setExternalEditError] = useState<string | null>(null);

  const beginExternalEdit = useCallback(async () => {
    if (!canEditRef.current || !isDesktopApp()) return;
    const { startExternalEdit, showExternalEdit } = await loadExternalEdit();
    const d = difficultiesRef.current.find((x) => x.id === activeIdRef.current);
    if (!d) return;
    const text = buildOsuFile({
      meta: metaRef.current,
      difficulty: d,
      timingPoints: d.timingPoints.length ? d.timingPoints : timingPointsRef.current,
      audioFilename:
        d.audioFilename ?? Object.keys(audioFilesRef.current)[0] ?? "audio.mp3",
      backgroundFilename: d.backgroundFilename,
      videoFilename: d.videoFilename,
      videoOffsetMs: d.videoOffsetMs,
      // The file comes back in, so it must not pick up the export watermark.
      cascadeTag: false,
    });
    setExternalEditError(null);
    let path: string;
    try {
      path = await startExternalEdit(d.name, text);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      return;
    }
    setExternalEdit({ path, diffId: d.id, name: d.name });
    try {
      await showExternalEdit(path, false);
    } catch (err) {
      setExternalEditError(err instanceof Error ? err.message : String(err));
    }
  }, [canEditRef]);

  const showExternalFile = useCallback(
    async (inFolder: boolean) => {
      if (!externalEdit) return;
      setExternalEditError(null);
      try {
        const { showExternalEdit } = await loadExternalEdit();
        await showExternalEdit(externalEdit.path, inFolder);
      } catch (err) {
        setExternalEditError(err instanceof Error ? err.message : String(err));
      }
    },
    [externalEdit],
  );

  const applyExternalEdit = useCallback(async () => {
    const session = externalEdit;
    if (!session) return;
    setExternalEditBusy(true);
    setExternalEditError(null);
    try {
      if (!canEditRef.current) throw new Error(t("app.noEditAccess"));
      const { applyExternalOsu, finishExternalEdit, readExternalEdit } =
        await loadExternalEdit();
      const text = await readExternalEdit(session.path);
      const current = difficultiesRef.current.find((d) => d.id === session.diffId);
      if (!current) throw new Error(t("externalEdit.diffGone"));
      const result = applyExternalOsu(current, metaRef.current, timingPointsRef.current, text, {
        audio: Object.keys(audioFilesRef.current),
        backgrounds: Object.keys(bgFilesRef.current),
        videos: Object.keys(videoFilesRef.current),
      });
      const otherNames = difficultiesRef.current
        .filter((d) => d.id !== current.id)
        .map((d) => d.name);
      const difficulty = {
        ...result.difficulty,
        name: uniqueDifficultyName(result.difficulty.name, otherNames),
      };
      await backupRecovery("before-external-edit");
      markStructural();
      setMeta(result.meta);
      setDifficulties((prev) => prev.map((d) => (d.id === current.id ? difficulty : d)));
      void finishExternalEdit(session.path);
      setExternalEdit(null);
      setImportNotice(t("externalEdit.applied", { name: difficulty.name }));
    } catch (err) {
      setExternalEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setExternalEditBusy(false);
    }
  }, [backupRecovery, externalEdit, markStructural, t, canEditRef]);

  const discardExternalEdit = useCallback(() => {
    if (externalEdit) {
      void loadExternalEdit().then(({ finishExternalEdit }) =>
        finishExternalEdit(externalEdit.path),
      );
    }
    setExternalEdit(null);
    setExternalEditError(null);
  }, [externalEdit]);

  const applyBatch = useCallback((request: BatchRequest) => {
    if (!canEditRef.current) return;
    markStructural();
    if (request.meta) setMeta(request.meta);
    setDifficulties(prev => batchApplyDifficulties(prev, request, timingPoints));
  }, [markStructural, timingPoints, canEditRef]);

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
    [markStructural, appSettingsRef, canEditRef],
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
    audio.volume * outputVolume,
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
  const [aiModFiles, setAiModFiles] = useState<AiModFileFacts | undefined>();
  const [confirmResnap, setConfirmResnap] = useState(false);

  // The report engine and the ranked-map corpus it compares against load with
  // the AiMod dialog, not with the app.
  const runAiModCheck = useCallback(() => {
    const input = {
      meta: metaRef.current,
      difficulties: difficultiesRef.current,
      audioFiles,
      bgFiles,
      audioDurationMs: sourceDurationRef.current
        ? Math.round(sourceDurationRef.current)
        : undefined,
      files: aiModFiles,
      sampleFiles: sampleFilesRef.current,
    };
    void import("./lib/aimod").then(({ runAiMod }) => setAiModReport(runAiMod(input)));
  }, [audioFiles, bgFiles, aiModFiles]);

  // The file checks need the audio and backgrounds read, which only happens
  // while AiMod is open; the report fills them in once reading finishes.
  useEffect(() => {
    if (modal !== "aimod") return;
    let cancelled = false;
    import("./lib/aimodFiles")
      .then(({ collectAiModFileFacts }) =>
        collectAiModFileFacts(audioFiles, bgFiles, sampleFiles),
      )
      .then((facts) => {
        if (!cancelled) setAiModFiles(facts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modal, audioFiles, bgFiles, sampleFiles]);

  useEffect(() => {
    if (aiModFiles && modal === "aimod") runAiModCheck();
    // Only fresh file facts should re-run the check here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiModFiles]);

  const openAiMod = useCallback(() => {
    runAiModCheck();
    setModal("aimod");
  }, [runAiModCheck]);

  // Only AiMod and its Resnap prompt show this, so it is not worked out on
  // every edit while neither is open.
  const aiModUnsnappedNeeded = modal === "aimod" || confirmResnap;
  const aiModUnsnapped = useMemo(() => {
    if (!aiModUnsnappedNeeded) return 0;
    const d = difficulties.find((x) => x.id === activeId);
    if (!d) return 0;
    const pts = d.timingPoints?.length ? d.timingPoints : [];
    return countUnsnapped(d.notes, pts);
  }, [aiModUnsnappedNeeded, difficulties, activeId]);

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
      const input = {
        meta: metaRef.current,
        difficulties: difficultiesRef.current.map((x) =>
          x.id === id ? { ...x, notes } : x,
        ),
        audioFiles,
        bgFiles,
        audioDurationMs: sourceDurationRef.current
          ? Math.round(sourceDurationRef.current)
          : undefined,
        files: aiModFiles,
        sampleFiles: sampleFilesRef.current,
      };
      void import("./lib/aimod").then(({ runAiMod }) => setAiModReport(runAiMod(input)));
    }
  }, [patchDifficulty, audioFiles, bgFiles, aiModFiles]);
  const setWaveformSensitivity = useCallback((value: number) => {
    setAppSettings((settings) => ({
      ...settings,
      waveformSensitivity: value,
    }));
  }, [setAppSettings]);
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
  const {
    addBookmark,
    clearBookmarkLoop,
    removeBookmark,
    renameBookmark,
    seekBookmark,
    seekNextBookmark,
    seekPreviousBookmark,
    setBookmarkLoopEnd,
    setBookmarkLoopStart,
    setFadeIn,
    setFadeOut,
    setTrimEnd,
    setTrimStart,
    toggleBookmarkLoop,
  } = useTimelineEdits({
    activeIdRef,
    canEditRef,
    commitDiffFields,
    currentTimeRef,
    difficultiesRef,
    durationRef,
    markStructural,
    seekAudio,
    setBookmarkLoop,
    setDifficulties,
  });
  const {
    addDifficulty,
    copyDifficulty,
    createRateDifficulty,
    deleteDifficulties,
    duplicateDifficulty,
    pasteDifficulty,
  } = useDifficultyActions({
    activeId,
    activeIdRef,
    announceAssetChange,
    audioFilesRef,
    authUserRef,
    backupRecovery,
    bgFilesRef,
    canEditRef,
    difficulties,
    difficultiesRef,
    markStructural,
    metaRef,
    setActiveId,
    setAudioFiles,
    setBgFiles,
    setDifficulties,
    setImportNotice,
    setMeta,
    setVideoFiles,
    t,
    timingPoints,
    videoFilesRef,
  });
  const {
    addNotes,
    applyCopyHitsounds,
    applyCopyHitsoundsToAll,
    applyCropToBrackets,
    applyDropShortLns,
    applyFullLong,
    applyFullRice,
    applySelectionLong,
    applySelectionRice,
    applyShiftLnEnds,
    deleteNote,
    deleteNotes,
    hitsoundSources,
    hitsoundTargets,
    moveNotes,
    placeNote,
  } = useNoteEditing({
    active,
    activeId,
    activeIdRef,
    announceShortcut,
    commitNoteOp,
    difficulties,
    difficultiesRef,
    selectionRange,
    t,
    timingPointsRef,
    view,
  });
  const {
    applyingHistoryRef,
    canRedo,
    canUndo,
    historyCurrent,
    historyEntries,
    jumpHistory,
    redo,
    redoStackRef,
    undo,
    undoStackRef,
  } = useEditHistory({
    applyingRemoteRef,
    canEditRef,
    collabRef,
    difficulties,
    historyPanel,
    liveEnabled,
    markStructural,
    meta,
    modal,
    noteRecoveryEdit,
    opRedoRef,
    opUndoRef,
    sessionActiveRef,
    setActiveId,
    setDifficulties,
    setMeta,
    setTimingPoints,
    t,
    timingPoints,
  });
  const {
    addOsuDifficulties,
    importArchive,
    importFromOsu,
    importMapFile,
    importOsuProjectFile,
    importPackSong,
    importQuaFile,
    importSmFile,
    loadSampleMap,
    logProjectCreated,
    onImportSmPack,
    openOsuAsProject,
    openOsuFiles,
    packError,
    replaceProject,
    requestImportQua,
    requestImportSm,
    scannedPackSongs,
    scanningPack,
    setPackError,
    setScannedPackSongs,
  } = useProjectLoading({
    activeIdRef,
    announceAssetChange,
    applyingHistoryRef,
    audioFilesRef,
    authUserRef,
    bgFilesRef,
    canEditRef,
    difficultiesRef,
    hasProjectContent,
    importStartedRef,
    markStructural,
    metaRef,
    projectStartedRef,
    redoStackRef,
    setActiveId,
    setAppSettings,
    setAudioFiles,
    setBgFiles,
    setCloudOwnerId,
    setCloudProjectId,
    setDifficulties,
    setImportError,
    setImportNotice,
    setImportProgress,
    setImportingMap,
    setLocalProjectId,
    setMeta,
    setModal,
    setMyRole,
    setNeedsSongHint,
    setPendingImport,
    setPendingOsuDiffs,
    setProjectStarted,
    setPublicMapUrl,
    setReferenceId,
    setSampleFiles,
    setTimingPoints,
    setVideoFiles,
    setZenMode,
    t,
    undoStackRef,
    videoFilesRef,
  });

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

  /** Opens a saved project, from this browser's projects or the recovery store. */
  const applySavedProject = useCallback(
    (saved: SavedProject, localProjectId: string) => {
      const loaded = (files: { name: string; blob: Blob }[] = []) =>
        Object.fromEntries(
          files.map((f) => [f.name, { name: f.name, url: URL.createObjectURL(f.blob), blob: f.blob }]),
        );
      // Saves from before multi-file support hold one song and one picture,
      // which every difficulty without its own takes.
      const legacyAudio = !saved.audioFiles?.length && saved.audio ? saved.audio : null;
      const legacyBg =
        !saved.backgroundFiles?.length && saved.background ? saved.background : null;
      replaceProject({
        meta: saved.meta,
        timingPoints: saved.timingPoints,
        difficulties: saved.difficulties.map((d) => ({
          ...d,
          ...(legacyAudio && !d.audioFilename ? { audioFilename: legacyAudio.name } : {}),
          ...(legacyBg && !d.backgroundFilename ? { backgroundFilename: legacyBg.name } : {}),
        })),
        activeId: saved.activeId,
        audioFiles: loaded(legacyAudio ? [legacyAudio] : saved.audioFiles),
        backgroundFiles: loaded(legacyBg ? [legacyBg] : saved.backgroundFiles),
        videoFiles: loaded(saved.videoFiles),
        sampleFiles: Object.fromEntries(
          (saved.sampleFiles ?? []).map((sample) => [sample.name, sample]),
        ),
        localProjectId,
      });
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
    },
    [replaceProject],
  );

  const loadLocalProject = useCallback(
    async (id: string) => {
      setModal(null);
      setImportingMap(true);
      try {
        const saved = await loadProject(id).catch(() => null);
        if (!saved) return;
        applySavedProject(saved, saved.localId ?? id);
      } finally {
        setImportingMap(false);
      }
    },
    [applySavedProject],
  );
  const musicVolume = audio.volume;
  const {
    accountSyncError,
    accountSyncStatus,
  } = useAccountSettingsSync({
    appSettings,
    authUser,
    authUserRef,
    hitsoundSkinSource,
    locale,
    musicVolume,
    setAppSettings,
    setAudioVolume,
    setHitsoundSkinSource,
    setLocale,
    setView,
    view,
  });

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
    if (exportCheck || pendingImport || showHomeConfirm || exitConfirm)
      playUiSound("areYouSure");
  }, [exportCheck, pendingImport, showHomeConfirm, exitConfirm]);

  useEffect(() => {
    const id = window.setTimeout(() => saveViewPreferences(view), 200);
    return () => window.clearTimeout(id);
  }, [view]);

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
  const isPlayingRef = useRef(false);
  isPlayingRef.current = audio.isPlaying;

  // The skin dialog previews against the running song, so opening it starts
  // playback and closing it hands the transport back the way it was found.
  // Space still toggles while it is open (see shouldIgnoreHotkey). Only the
  // dialog's own stage moves: the editor behind it is frozen for as long as
  // the dialog is up, so nothing scrolls past under the dialog.
  const resumeAfterSkinRef = useRef(false);
  useEffect(() => {
    if (modal !== "skin" || !hasAudioRef.current) return;
    resumeAfterSkinRef.current = isPlayingRef.current;
    if (!isPlayingRef.current) playAudio();
    return () => {
      if (!resumeAfterSkinRef.current) pauseAudio();
    };
    // Deliberately keyed on the dialog alone: audio.isPlaying changes as the
    // song is toggled, and re-running then would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);
  const skinPreviewOpen = modal === "skin";
  const editorCanvasPlaying = audio.isPlaying && !skinPreviewOpen;
  const slowHeldRef = useRef(false);
  useEffect(() => {
    const shouldIgnoreHotkey = (e: KeyboardEvent, allowInSkinModal = false) => {
      if (playtestRef.current.active) return true;
      if (!projectStartedRef.current) return true;
      // Play/pause is the one hotkey the skin dialog wants, so its preview can
      // be started and stopped without leaving the dialog. dialogIsOpen() is
      // true for the skin dialog itself, so it has to be exempted as well.
      const skinPreview = allowInSkinModal && modalRef.current === "skin";
      if (!skinPreview && (modalRef.current || askBgScope || dialogIsOpen())) {
        return true;
      }
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
      const snapStep = !noMod ? 0 : is("snapNext") ? 1 : is("snapPrevious") ? -1 : 0;
      const isSnapPreset = noMod && is("snapPreset");
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
        snapDivisor === null &&
        snapStep === 0 &&
        !isSnapPreset
      )
        return;
      if (shouldIgnoreHotkey(e, isSpace)) return;
      // Space in the skin dialog is swallowed even with no audio to play: left
      // to the browser it would press whatever button has focus, and the first
      // one is Close.
      const skinPreviewSpace = isSpace && modalRef.current === "skin";
      if (
        !hasAudioRef.current &&
        !skinPreviewSpace &&
        !isTab &&
        !isTimelineZoomOut &&
        !isTimelineZoomIn &&
        !isZoomIn &&
        !isZoomOut &&
        snapDivisor === null &&
        snapStep === 0 &&
        !isSnapPreset
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
        // hasAudio is re-checked because the skin dialog lets Space through
        // even without it, purely to keep it off the focused button.
        if (!e.repeat && hasAudioRef.current) toggleAudio();
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
      else if (snapStep !== 0 || isSnapPreset) {
        const settings = appSettingsRef.current;
        const custom = settings.customSnapDivisors;
        let preset = presetDivisors(settings.snapPreset, custom).length
          ? settings.snapPreset
          : "common";
        if (isSnapPreset) {
          if (e.repeat) return;
          preset = nextSnapPreset(preset, custom);
          const chosen = preset;
          setAppSettings((s) => ({ ...s, snapPreset: chosen }));
        }
        const divisors = presetDivisors(preset, custom);
        const current = viewRef.current.snapDivisor;
        const next = snapStep !== 0
          ? stepDivisor(divisors, current, snapStep)
          : closestDivisor(divisors, current);
        setView((v) => ({ ...v, snapDivisor: next }));
        announceShortcut({
          label: isSnapPreset ? t("osd.snapPreset") : t("osd.snap"),
          value: isSnapPreset
            ? `${t(`snapPreset.${preset}`)} · 1/${next}`
            : `1/${next}`,
          keys: [editorKeyLabel(e.code)],
        });
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
    appSettingsRef,
    setAppSettings,
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
    [openFiles, importPackSong, resetFileDrag, t, setScannedPackSongs],
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
  }, [appSettingsRef]);
  const {
    confirmMapperName,
    doExportOsz,
    exportIssues,
    exportProgress,
    exporting,
    handleExportMcz,
    handleExportOsu,
    handleExportOsz,
    handleExportQua,
    handleExportSm,
    handleLoadFromOsu,
    handleSendToOsu,
    handleSyncToOsu,
    osuBusy,
    removeDuplicates,
    setExportIssues,
  } = useMapExport({
    active,
    activeTimingPoints,
    appSettings,
    audioFile,
    audioFiles,
    authUser,
    authUserRef,
    bgFiles,
    canEditRef,
    difficulties,
    exportCheck,
    hasProjectContent,
    importMapFile,
    mapperPrompt,
    markStructural,
    meta,
    offerMapCard,
    sampleFiles,
    setDifficulties,
    setExportCheck,
    setImportError,
    setImportNotice,
    setMapperPrompt,
    setMeta,
    setOsuApp,
    setPendingImport,
    t,
    timingPoints,
    videoFiles,
  });

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
    else void openOsuAsProject([entry]);
  }, [pendingOsuDiffs, hasProjectContent, openOsuAsProject]);

  const projectVaultKey = projectStorageKey(localProjectId);
  const {
    acceptRecoveryOffer,
    dismissRecoveryOffer,
    handleRestoreSnapshot,
    recoveryBusy,
    recoveryOffer,
    restoreBackup,
    restoreUnsavedWork,
  } = useRecoveryActions({
    appSettingsRef,
    applySavedProject,
    backupRecovery,
    canEditRef,
    localProjectIdRef,
    markRecoverySaved,
    markStructural,
    noteRecoveryEdit,
    projectStartedRef,
    projectVaultKey,
    recoverySaveToken,
    setActiveId,
    setBgScope,
    setDifficulties,
    setImportError,
    setImportNotice,
    setMeta,
    setModal,
    setTimingPoints,
    t,
    viewRef,
  });
  const {
    handleSave,
    saveErrorDetail,
    saveStatus,
    setSaveStatus,
  } = useLocalSave({
    activeId,
    appSettings,
    audioFiles,
    bgFiles,
    bgScope,
    canEdit,
    difficulties,
    localProjectId,
    markRecoverySaved,
    meta,
    projectStarted,
    recoverySaveToken,
    sampleFiles,
    skin,
    timingPoints,
    videoFiles,
    view,
  });
  const {
    cloudSaveStatus,
    duplicateCloudMatches,
    handleCloudSave,
    loadCloudProject,
    setCloudSaveStatus,
    setDuplicateCloudMatches,
  } = useCloudProject({
    activeId,
    assetAttemptsRef,
    audioFiles,
    authUser,
    authUserRef,
    bgFiles,
    bgScope,
    cloudProjectId,
    cloudRevisionRef,
    cloudSavePromiseRef,
    difficulties,
    localEditVersionRef,
    localProjectId,
    markRecoverySaved,
    meta,
    opRedoRef,
    opUndoRef,
    ownMutationIdsRef,
    pendingDocSyncRef,
    pendingSeekRef,
    publishedAssetBlobsRef,
    recoverySaveToken,
    refreshAuth,
    replaceProject,
    sampleFiles,
    setBgScope,
    setCloudError,
    setCloudOwnerId,
    setCloudProjectId,
    setImportingMap,
    setModal,
    setMyRole,
    setView,
    timingPoints,
    view,
  });
  const {
    dismissInboxNotification,
    ignoreInvite,
    invites,
    joinInvite,
    markInboxAllRead,
    markInboxNotificationRead,
    notifications,
    notificationsError,
    notificationsLoading,
    openInboxNotification,
    refreshNotifications,
  } = useNotificationInbox({
    authUser,
    authUserRef,
    cloudProjectIdRef,
    loadCloudProject,
  });

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

    const fresh = makeDifficulty("Normal", 4);
    if (loadedAudio) fresh.audioFilename = loadedAudio.name;
    replaceProject({
      meta: DEFAULT_SONG_META,
      timingPoints: defaultTimingPoints(),
      difficulties: [fresh],
      audioFiles: loadedAudio ? { [loadedAudio.name]: loadedAudio } : {},
      needsSongHint: !loadedAudio,
    });
    setBgScope("mapset");
    setImportError(null);
    setSaveStatus(null);
    logProjectCreated();

    if (loadedAudio) {
      setAutoTimeOpen(true);
      setAutoTimeStatus("idle");
      setAutoTimeResult(null);
    }
  }, [logProjectCreated, replaceProject, t, setSaveStatus]);

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

  // The Tools dialog is the only reader of these counts.
  const toolsOpen = modal === "tools";
  const holds = useMemo(
    () => (toolsOpen ? active.notes.filter((n) => n.endTime !== undefined).length : 0),
    [toolsOpen, active.notes],
  );

  /** Rice and hold counts inside the current selection, for the Tools panel. */
  const selectionCounts = useMemo(() => {
    const ids = selectionRange?.ids;
    if (!toolsOpen || !ids?.size) return { rice: 0, holds: 0 };
    let rice = 0;
    let holdCount = 0;
    for (const n of active.notes) {
      if (!ids.has(n.id)) continue;
      if (n.endTime !== undefined && n.endTime > n.startTime) holdCount++;
      else rice++;
    }
    return { rice, holds: holdCount };
  }, [toolsOpen, active.notes, selectionRange]);

  const [laneFlash, setLaneFlash] = useState<{ column: number; at: number } | null>(null);
  const flashColumn = useCallback(
    (column: number) => setLaneFlash({ column, at: performance.now() }),
    [],
  );

  const cropInfo = useMemo(() => {
    const start = active.trimStartMs ?? 0;
    const hasEnd = active.trimEndMs !== undefined;
    const end = active.trimEndMs ?? Infinity;
    const trimActive = start > 0.5 || hasEnd;
    let remove = 0;
    let clamp = 0;
    if (trimActive && toolsOpen) {
      for (const n of active.notes) {
        if (n.startTime < start - 0.5 || n.startTime > end + 0.5) remove++;
        else if (hasEnd && n.endTime !== undefined && n.endTime > end + 0.5)
          clamp++;
      }
    }
    return { trimActive, remove, clamp };
  }, [toolsOpen, active.notes, active.trimStartMs, active.trimEndMs]);

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
                { id: "share", label: t("nav.shareTitle"), group: t("palette.group.collaboration"), disabled: !authUser, run: () => setModal("share" as ModalId) },
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
                  {
                    label: t("file.backups"),
                    onClick: () => setModal("backups"),
                  },
                  ...(isDesktopApp()
                    ? [
                        { separator: true as const },
                        {
                          label: t("file.versionHistory"),
                          disabled: !hasProject,
                          onClick: () => setModal("versionHistory"),
                        },
                        {
                          label: t("file.editExternally"),
                          title: t("file.editExternallyHint"),
                          disabled: !hasProject || !canEdit,
                          onClick: () => void beginExternalEdit(),
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
          {!hasProject && !sharedSlug && <NowPlaying
              music={menuMusic}
              preferOriginalMetadata={preferOriginalMetadata}
            />}
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
                        )
                    : undefined
                }
              />
            )}
          </div>
          <HudPreviewViewport
            editing={playtest.hudEditing}
            footer={
              playtest.hudEditing ? (
                <HudScrubber
                  getCurrentTime={playtestGameplayTime}
                  duration={audio.duration}
                  onSeek={(ms) => startPlaytest(ms, { hudEditing: true })}
                />
              ) : undefined
            }
          >
            {(previewScale) => <>
            {exclusiveAudio && audio.nativeAudio.fallbackReason && <div role="status" className="absolute right-3 top-2 z-20 max-w-sm rounded-lg border border-amber-300/20 bg-ink-900/95 px-3 py-2 text-[11px] text-amber-200">{t("app.sharedAudio", { reason: audio.nativeAudio.fallbackReason })} <button className="underline" onClick={() => { pauseAudio(); setModal("audioSetup"); }}>{t("app.audioSetup")}</button></div>}
            <div className="flex h-full w-full">
            <div className="relative min-w-0 flex-1">
            {hasProject ? (
              <MemoizedManiaEditor
                laneColourScheme={appSettings.colourblindLanes ? "colourblind" : "default"}
                snapColours={appSettings.snapColouredNotes}
                laneFlash={laneFlash}
                key={active.id}
                patternTitle={displaySong(meta, preferOriginalMetadata, " – ")}
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
                isPlaying={editorCanvasPlaying}
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
                dimBackground={playfieldLayout.backgroundDim}
                backgroundBlur={appSettings.backgroundBlur}
                skin={activeSkin}
                playfieldScale={playfieldLayout.scale}
                noteHeightScale={playfieldLayout.noteHeightScale}
                longNoteBodyScale={playfieldLayout.longNoteBodyScale}
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
                playfieldBoundsRef={playfieldBoundsRef}
                heldLnIdsRef={playtestHoldingView}
                consumedIdsRef={playtestHiddenView}
                droppedIdsRef={playtestDroppedView}
                pressedColumnsRef={playtestPressedColumnsRef}
                hitPosition={playfieldLayout.hitPosition}
                hitLight={appSettings.hitLight}
                waveformOverlay={appSettings.showWaveform ? waveform : null}
                waveformTransparency={appSettings.waveformTransparency}
                onToggleWaveformOverlay={toggleWaveformOverlay}
                missWindowMs={playtestWindows.hit50}
                hideHints={playtest.active}
                songEndMs={audio.duration}
                trimStartMs={active.trimStartMs}
                trimEndMs={active.trimEndMs}
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
                onExit={
                  canExitDesktop() ? () => setExitConfirm(true) : undefined
                }
                osuBanner={osuBanner}
                logoHitsoundVolume={
                  appSettings.hitsoundsEnabled
                    ? appSettings.hitsoundVolume * outputVolume
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
            {hasProject && layoutEditing && !playtest.active && (
              <EditorLayoutOverlay
                settings={appSettings}
                scrollSpeed={view.scrollSpeed}
                playfieldBoundsRef={playfieldBoundsRef}
                onPatch={(patch) => setAppSettings((value) => ({ ...value, ...patch }))}
                onScrollSpeed={(scrollSpeed) =>
                  setView((value) => ({ ...value, scrollSpeed }))
                }
                onDone={() => setLayoutEditing(false)}
              />
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
                      isPlaying={editorCanvasPlaying}
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
            {hasProject && playtest.active && (
              <PlaytestOverlay
                editing={playtest.hudEditing}
                previewScale={previewScale}
                savedSkinNames={skinLibrary.map((saved) => saved.name)}
                hitLight={appSettings.hitLight}
                onHitLight={(hitLight) => setAppSettings((s) => ({ ...s, hitLight }))}
                onPatch={(patch) => setAppSettings((s) => ({ ...s, playtest: { ...s.playtest, ...patch } }))}
                playfieldBoundsRef={playfieldBoundsRef}
                npsGraph={
                  <MemoizedPlaytestNpsGraph
                    embedded
                    notes={playtestRunNotes}
                    durationMs={audio.duration}
                    getCurrentTime={getEditorCurrentTime}
                    active={playtest.active}
                    running={!playtest.paused && !playtest.ended && playtest.countdownEndsAt === null}
                    label={t("runStats.nps")}
                    peakLabel={t("runStats.peakShort")}
                  />
                }
                runStats={
                  <PlaytestRunStats
                    embedded
                    store={playtestScore}
                    notes={playtestRunNotes}
                    durationMs={audio.duration}
                    getCurrentTime={getEditorCurrentTime}
                    autoplay={playtest.autoplay}
                    autoplaySummary={autoplaySummary}
                    humanized={!playtest.hudEditing && playtestSettings.humanize.enabled}
                    showNps={!playtestSettings.showNpsGraph}
                    skillProfile={skillProfile}
                    skillEnabled
                  />
                }
                store={playtestScore}
                ended={playtest.ended}
                paused={playtest.paused}
                countdownEndsAt={playtest.countdownEndsAt}
                settings={playtestSettings}
                windows={playtestWindows}
                getCurrentTime={playtestGameplayTime}
                hitLineFromEdge={PLAYTEST_HIT_LINE_FROM_EDGE + playfieldLayout.hitPosition}
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
            </>}
          </HudPreviewViewport>

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
          preferOriginalMetadata={preferOriginalMetadata}
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
      {modalMounted("backups") && (
        <BackupsModal
          open={modal === "backups"}
          onClose={close}
          projectId={localProjectId}
          projectOpen={hasProject}
          canEdit={canEdit}
          onBackupNow={() => backupRecovery("manual")}
          onRestoreBackup={restoreBackup}
          onRestoreUnsaved={restoreUnsavedWork}
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
          preferOriginalMetadata={preferOriginalMetadata}
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
          unfocusedVolume={appSettings.unfocusedVolume}
          onUnfocusedVolume={(v) =>
            setAppSettings((s) => ({ ...s, unfocusedVolume: v }))
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
          onOpenHudEditor={hasProject && audioFile ? () => startPlaytest(0, { hudEditing: true }) : undefined}
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
          customSnapDivisors={appSettings.customSnapDivisors}
          onCustomSnapDivisors={(value) =>
            setAppSettings((s) => ({
              ...s,
              customSnapDivisors: value,
              // An emptied custom list can't stay the active preset.
              snapPreset: s.snapPreset === "custom" && !value.length ? "common" : s.snapPreset,
            }))
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
          preferOriginalMetadata={appSettings.preferOriginalMetadata}
          onPreferOriginalMetadata={(v) =>
            setAppSettings((s) => ({ ...s, preferOriginalMetadata: v }))
          }
          holdConfirmMs={appSettings.holdConfirmMs}
          onHoldConfirmMs={(v) =>
            setAppSettings((s) => ({ ...s, holdConfirmMs: clampHoldConfirmMs(v) }))
          }
          parallaxStrength={appSettings.parallaxStrength}
          onParallaxStrength={(v) =>
            setAppSettings((s) => ({
              ...s,
              parallaxStrength: clampParallaxStrength(v),
            }))
          }
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
          // The preview is the editor itself, read-only, so a skin looks in
          // the dialog exactly as it will on the playfield — same geometry,
          // same song, same playhead.
          preview={
            hasProject ? (
              <MemoizedManiaEditor
                notes={active.notes}
                keyCount={active.keyCount}
                timingPoints={activeTimingPoints}
                previewTime={active.previewTime}
                view={editorView}
                getCurrentTime={getEditorCurrentTime}
                getVisualCurrentTime={getEditorVisualCurrentTime}
                isVisualSeekActive={isVisualSeekActive}
                isPlaying={audio.isPlaying}
                seekSignal={audio.seekSignal}
                backgroundUrl={activeBg?.url ?? null}
                backgroundKey={
                  activeBg ? `${activeBg.blob.size}:${activeBg.blob.type}` : null
                }
                videoUrl={null}
                dimBackground={appSettings.dimBackground}
                backgroundBlur={appSettings.backgroundBlur}
                skin={skin?.keymodes[active.keyCount] ?? null}
                // The dialog's stage is roughly a third the height of the real
                // one, and lane width does not shrink with it, so the editor's
                // own scale would fill the frame with two notes. This keeps the
                // proportions the playfield actually has.
                playfieldScale={SKIN_PREVIEW_SCALE}
                noteHeightScale={appSettings.noteHeightScale}
                longNoteBodyScale={appSettings.longNoteBodyScale}
                smoothScrolling={appSettings.smoothScrolling}
                showTimingLines={appSettings.showTimingLines}
                upscroll={appSettings.upscroll}
                svBpmScroll={appSettings.bpmAffectsScroll}
                zenMode
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
            ) : null
          }
          hitLight={appSettings.hitLight}
          onHitLight={(hitLight) => setAppSettings((s) => ({ ...s, hitLight }))}
          onApplyPreset={onApplyPresetSkin}
          onApplySavedSkin={onApplyLocalSkin}
          onSkinFile={onSkinFile}
          onDeleteSavedSkin={onDeleteLocalSkin}
          onUploadCloudSkin={onUploadCloudSkin}
          onDownloadCloudSkin={onDownloadCloudSkin}
          onDeleteCloudSkin={onDeleteCloudSkin}
          onClearSkin={onClearSkin}
          onUseDefaultHitsounds={onUseDefaultHitsounds}
          onUseVisualHitsounds={onUseVisualHitsounds}
          onUseSelectedHitsounds={onUseSelectedHitsounds}
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
          metronomeVolume={outputVolume}
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
              onClick={() => void addOsuDifficulties(pendingOsuDiffs ?? [])}
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
                {displaySong(meta, preferOriginalMetadata)}
              </span>
            </p>
            <p className="mt-1 text-slate-400">
              {t("app.fileLabel")}{" "}
              <span className="font-medium text-slate-100">
                {pendingOsuDiffs?.[0]
                  ? displaySong(pendingOsuDiffs[0].parsed.meta, preferOriginalMetadata)
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
        <OnScreenDisplay notice={shortcutNotice} onHidden={hideShortcutNotice} anchor={osdAnchor} />
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
        <RecoveryPrompt
          offer={recoveryOffer}
          busy={recoveryBusy}
          onRestore={() => void acceptRecoveryOffer()}
          onDismiss={dismissRecoveryOffer}
        />
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
          open={!!exportIssues}
          durationMs={null}
          onDismiss={() => setExportIssues(null)}
          resetKey={exportIssues ? `${exportIssues.target}:${exportIssues.issues.length}` : null}
          showClose
          progressClassName="bg-amber-400"
          className="pointer-events-auto max-w-full rounded-lg border border-amber-400/40 bg-ink-800/95 py-2 pb-3 pl-4 pr-9 text-sm text-amber-100 shadow-lg"
        >
          {exportIssues && (
            <span className="flex flex-col gap-1.5">
              <span className="font-semibold">
                {t("exportVerify.title", { target: exportIssues.target })}
              </span>
              <span className="text-xs text-amber-100/80">
                {exportIssues.issues[0].path}: {exportIssues.issues[0].message}
                {exportIssues.issues.length > 1
                  ? ` ${t("exportVerify.more", { count: exportIssues.issues.length - 1 })}`
                  : ""}
              </span>
              <span className="text-xs text-slate-400">{t("exportVerify.body")}</span>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(
                      formatIssues(
                        exportIssues.issues,
                        `Cascade ${__APP_VERSION__} export check (${exportIssues.target})`,
                      ),
                    )
                    .catch(() => {})
                }
                className="self-start rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
              >
                {t("crash.copyDetails")}
              </button>
            </span>
          )}
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
        open={exitConfirm}
        onClose={() => setExitConfirm(false)}
        center
        title={t("exit.confirmTitle")}
        footer={
          <>
            <Button onClick={() => setExitConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                setExitConfirm(false);
                handleExitApp();
              }}
            >
              {t("exit.confirmButton")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">{t("exit.confirmBody")}</p>
      </Modal>

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
                // The page reloads, so the project is put somewhere durable
                // first: a local save when autosave is on, and the recovery
                // copy either way. Neither may hold the reload up for long.
                const autosave =
                  appSettings.localAutosaveEnabled && canEdit && projectStarted;
                void Promise.race([
                  Promise.all([
                    flushRecovery(),
                    autosave ? handleSave(true) : null,
                  ]),
                  new Promise((resolve) => setTimeout(resolve, 2000)),
                ]).finally(() => window.location.reload());
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

      <ExternalEditModal
        open={externalEdit !== null}
        difficultyName={externalEdit?.name ?? ""}
        path={externalEdit?.path ?? ""}
        busy={externalEditBusy}
        error={externalEditError}
        onOpenEditor={() => void showExternalFile(false)}
        onShowInFolder={() => void showExternalFile(true)}
        onApply={() => void applyExternalEdit()}
        onCancel={discardExternalEdit}
      />

      <HoldConfirmDialog
        open={duplicateCloudMatches !== null}
        title={t("app.duplicateCloudTitle")}
        message={(() => {
          const match = duplicateCloudMatches?.[0];
          if (!match) return null;
          const title = match.title.trim() || t("app.unnamed");
          const others = (duplicateCloudMatches?.length ?? 1) - 1;
          return (
            <>
              <p>
                {match.id_match
                  ? t("app.duplicateCloudBodyId", { title })
                  : t("app.duplicateCloudBodyTitle", { title })}
              </p>
              {others > 0 && (
                <p className="mt-2 text-slate-400">
                  {t("app.duplicateCloudOthers", { count: others })}
                </p>
              )}
            </>
          );
        })()}
        confirmLabel={t("app.holdToOverwrite")}
        onConfirm={() => {
          const match = duplicateCloudMatches?.[0];
          setDuplicateCloudMatches(null);
          if (match) void handleCloudSave({ overwriteId: match.id });
        }}
        onCancel={() => setDuplicateCloudMatches(null)}
        secondaryLabel={t("app.duplicateCloudSaveNew")}
        onSecondary={() => {
          setDuplicateCloudMatches(null);
          void handleCloudSave({ asNewMap: true });
        }}
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
