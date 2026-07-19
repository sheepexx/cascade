import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManiaEditor } from "./components/ManiaEditor";
import { TransportBar } from "./components/TransportBar";
import { BottomTimeline } from "./components/BottomTimeline";
import { DifficultySidebar } from "./components/DifficultySidebar";
import { PPCounter } from "./components/PPCounter";
import { SettingsModal } from "./components/menus/SettingsModal";
import { AppSettingsModal } from "./components/menus/AppSettingsModal";
import { SkinModal } from "./components/menus/SkinModal";
import { DifficultyModal } from "./components/menus/DifficultyModal";
import { TimingModal } from "./components/menus/TimingModal";
import { BackgroundScopeModal } from "./components/menus/BackgroundScopeModal";
import { ToolsModal } from "./components/menus/ToolsModal";
import { ExportValidationModal } from "./components/menus/ExportValidationModal";
import { AiModModal } from "./components/menus/AiModModal";
import {
  runAiMod,
  resnapNotes,
  countUnsnapped,
  type AiModReport,
  type AiModIssue,
} from "./lib/aimod";
import {
  WelcomeModal,
  SampleMapsModal,
  type SampleMap,
} from "./components/menus/StartModal";
import { MyMapsModal } from "./components/menus/MyMapsModal";
import { PackCreator } from "./components/PackCreator";
import { CommentIcon, UsersIcon } from "./components/ui/StartIcons";
import { PresetBrowserModal } from "./components/menus/PresetBrowserModal";
import { PublishPresetModal } from "./components/menus/PublishPresetModal";
import { FeedbackModal } from "./components/menus/FeedbackModal";
import { ShareModal } from "./components/menus/ShareModal";
import { CommentsSidebar } from "./components/CommentsSidebar";
import { PlaytestOverlay } from "./components/PlaytestOverlay";
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
import { useCollab } from "./hooks/useCollab";
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
import { validateProject, type ValidationResult } from "./lib/validation";
import { Button } from "./components/ui/Controls";
import { Menu } from "./components/ui/Menu";
import { Modal } from "./components/ui/Modal";
import { AccountControl } from "./components/auth/LoginButton";
import { AdminPanel } from "./components/admin/AdminPanel";
import {
  InviteNotifications,
  type InviteNotice,
} from "./components/InviteNotifications";
import {
  playUiSound,
  preloadUiSounds,
  setUiSoundsEnabled,
  setUiSoundVolume,
} from "./lib/uiSounds";
import { useAuth } from "./lib/auth";
import { logAnalyticsEvent } from "./lib/analytics";
import { useAudio } from "./hooks/useAudio";
import { useWaveform } from "./hooks/useWaveform";
import { useHitsounds } from "./hooks/useHitsounds";
import { usePlaytestInput } from "./hooks/usePlaytestInput";
import { fullLongNotes, fullRiceNotes, copyHitsounds, countHitsounds } from "./lib/noteTools";
import {
  hasNoteCollisions,
  sameNoteGeometry,
  withoutNoteCollisions,
} from "./lib/noteCollision";
import { downloadOsu } from "./lib/osuExport";
import { downloadOsz } from "./lib/oszExport";
import { importOsz } from "./lib/osuImport";
import { snapshotBlob, snapshotBlobMap } from "./lib/blobSnapshot";
import { importOsk } from "./lib/skinImport";
import { parseSmFile } from "./lib/smImport";
import { PackBrowserModal } from "./components/menus/PackBrowserModal";
import { scanPackFromPicker, scanPackFromDrop, scanPackFromZip } from "./lib/smPackImport";
import type { PackSong } from "./lib/smPackImport";
import { downloadSmZip } from "./lib/smExport";
import {
  emptyJudgementCounts,
  judgeHitError,
  maniaJudgementWindows,
  maniaReleaseWindows,
  scaleWindows,
  clampPlaytestRate,
  type HitResult,
  type PlaytestState,
} from "./lib/playtestJudgements";
import {
  accuracyFromCounts,
  addJudgement,
  scoreFromResults,
} from "./lib/playtestScoring";
import { normalizePlaytestKeybinds } from "./lib/playtestKeybinds";
import {
  loadProject,
  saveProject,
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
  type SavedSkinBlob,
  type SavedProject,
} from "./lib/persistence";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SONG_META,
  DEFAULT_VIEW,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  defaultTimingPoints,
  makeDifficulty,
  makeRedPoint,
  normalizeTimingPoints,
  uid,
  type AppSettings,
  type BackgroundScope,
  type Difficulty,
  type HitsoundSkinSource,
  type LoadedFile,
  type LoadedSkin,
  type ManiaNote,
  type PlaytestSettings,
  type SongMeta,
  type TimingPoint,
  type ViewState,
} from "./types";
import { detectBpmFromBuffer, type BpmDetection } from "./lib/bpmDetect";
import { sortedPoints } from "./lib/timing";
import { AutoTimePrompt, type AutoTimeStatus } from "./components/AutoTimePrompt";

type ModalId =
  | "welcome"
  | "sampleMaps"
  | "mapSettings"
  | "settings"
  | "skin"
  | "timing"
  | "difficulty"
  | "tools"
  | "aimod"
  | "info"
  | "myMaps"
  | "presets"
  | "publishPreset"
  | "feedback"
  | "admin"
  | "share"
  | "packBrowser"
  | null;

type DocSnapshot = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

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

type PlaytestRuntimeState = PlaytestState & { ended: boolean; paused: boolean };

function initialPlaytestState(): PlaytestRuntimeState {
  return {
    active: false,
    ended: false,
    paused: false,
    startTime: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    accuracy: 100,
    unstableRate: 0,
    judgements: emptyJudgementCounts(),
    hitResults: [],
  };
}

function normalizeAppSettings(
  prefs: Partial<AppSettings> | null,
): AppSettings {
  const playtestPrefs = prefs?.playtest as Partial<PlaytestSettings> | undefined;
  return {
    ...DEFAULT_APP_SETTINGS,
    ...(prefs ?? {}),
    playtest: {
      ...DEFAULT_APP_SETTINGS.playtest,
      ...(playtestPrefs ?? {}),
      keybinds: normalizePlaytestKeybinds(playtestPrefs?.keybinds),
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
  const { user: authUser, refresh: refreshAuth } = useAuth();
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
  const [skinError, setSkinError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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
  const [packCreatorOpen, setPackCreatorOpen] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [pendingDeleteDiffId, setPendingDeleteDiffId] = useState<string | null>(
    null,
  );
  const [projectStarted, setProjectStarted] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => ({
    ...normalizeAppSettings(loadPreferences()),
  }));
  const [bgScope, setBgScope] = useState<BackgroundScope>("mapset");
  const [askBgScope, setAskBgScope] = useState(false);
  const [lnTicks, setLnTicks] = useState(1);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importingMap, setImportingMap] = useState(false);
  const [scannedPackSongs, setScannedPackSongs] = useState<PackSong[]>([]);
  const [scanningPack, setScanningPack] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [currentHitSound, setCurrentHitSound] = useState(0);
  const [currentSampleSet, setCurrentSampleSet] = useState(0);
  const [saveStatus, setSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [saveErrorDetail, setSaveErrorDetail] = useState<string | null>(null);
  const [localProjectId, setLocalProjectId] = useState(newLocalProjectId);
  const [exportCheck, setExportCheck] = useState<{
    result: ValidationResult;
    target: string;
    run: () => void;
  } | null>(null);
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [cloudOwnerId, setCloudOwnerId] = useState<string | null>(null);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [invites, setInvites] = useState<InviteNotice[]>([]);
  const [autoSave, setAutoSave] = useState<"idle" | "saving" | "saved">("idle");
  const [publishPattern, setPublishPattern] = useState<PatternNote[] | null>(
    null,
  );
  const [publishKeyCount, setPublishKeyCount] = useState(4);
  const [presetToCopy, setPresetToCopy] = useState<{
    id: string;
    pattern: PatternNote[];
  } | null>(null);
  const importStartedRef = useRef(false);

  const [myRole, setMyRole] = useState<AccessRole>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [commentMarkers, setCommentMarkers] = useState<
    { time_ms: number; resolved: boolean; body: string; author: string }[]
  >([]);
  const [peerNotice, setPeerNotice] = useState<{
    key: number;
    text: string;
    avatar: string | null;
  } | null>(null);
  const peerNoticeTimer = useRef<number | undefined>(undefined);
  const active =
    difficulties.find((d) => d.id === activeId) ?? difficulties[0];
  const [playtest, setPlaytest] = useState<PlaytestRuntimeState>(
    initialPlaytestState,
  );
  const playtestRef = useRef(playtest);
  playtestRef.current = playtest;
  const [playtestConsumedIds, setPlaytestConsumedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const playtestConsumedRef = useRef<Set<string>>(new Set());
  const playtestHeadJudgedRef = useRef<Set<string>>(new Set());
  const playtestTailJudgedRef = useRef<Set<string>>(new Set());
  const playtestHeldLnRef = useRef<Map<string, ManiaNote>>(new Map());
  const playtestErrStatsRef = useRef({ n: 0, sum: 0, sumSq: 0 });
  const playtestEndArmedRef = useRef(false);
  const difficultiesRef = useRef(difficulties);
  difficultiesRef.current = difficulties;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const timingPointsRef = useRef(timingPoints);
  timingPointsRef.current = timingPoints;
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;
  const cloudProjectIdRef = useRef(cloudProjectId);
  cloudProjectIdRef.current = cloudProjectId;

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
  const collabRef = useRef<ReturnType<typeof useCollab> | null>(null);
  const publishedAssetsRef = useRef<Set<string>>(new Set());
  const [assetSyncTick, setAssetSyncTick] = useState(0);
  const pendingSeekRef = useRef<number | null>(null);

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
  const refreshFromCloud = useCallback(() => {
    const pid = cloudProjectIdRef.current;
    if (!pid) return;
    void loadProjectChartCloud(pid)
      .then((data) => {
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

  const handleSyncRequest = useCallback(() => {
    const pid = cloudProjectIdRef.current;
    if (!pid || !canEditRef.current) return;
    void saveProjectDataCloud(pid, {
      meta: metaRef.current,
      timingPoints: timingPointsRef.current,
      difficulties: difficultiesRef.current,
      activeId: activeIdRef.current,
      view,
      bgScope,
    })
      .then(() => collabRef.current?.sendRefresh())
      .catch(() => {});
  }, [view, bgScope]);

  const showPeerNotice = useCallback((text: string, avatar: string | null) => {
    setPeerNotice({ key: Date.now(), text, avatar });
    window.clearTimeout(peerNoticeTimer.current);
    peerNoticeTimer.current = window.setTimeout(
      () => setPeerNotice(null),
      3500,
    );
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
    onSyncRequest: handleSyncRequest,
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

  const commitNoteOp = useCallback((op: NoteOp) => {
    if (!canEditRef.current) return;
    setDifficulties((prev) => applyNoteOp(prev, op));
    if (sessionActiveRef.current) {
      opUndoRef.current.push(op);
      if (opUndoRef.current.length > 300) opUndoRef.current.shift();
      opRedoRef.current = [];
      collabRef.current?.sendOp(op);
    }
  }, []);

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
    [flushDiffOp],
  );

  const markStructural = useCallback(() => {
    if (sessionActiveRef.current) pendingDocSyncRef.current = true;
  }, []);

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
  // Rate difficulties keep the original audio file and are played faster or
  // slower; the hook re-scales the whole timeline around that.
  const activeRate = difficultyRate(active);
  const audio = useAudio(
    audioFile?.url ?? null,
    waveform ? waveform.duration * 1000 : null,
    waveform?.buffer ?? null,
    {
      startMs: active.trimStartMs,
      endMs: active.trimEndMs,
      fadeInMs: active.fadeInMs,
      fadeOutMs: active.fadeOutMs,
    },
    activeRate,
    active.preservePitch === true,
  );
  const currentTimeRef = useRef(audio.getCurrentTime());
  currentTimeRef.current = audio.getCurrentTime();
  const getCurrentTime = audio.getCurrentTime;
  const durationRef = useRef(audio.duration);
  durationRef.current = audio.duration;
  const modalAtmosphereOpen =
    (modal !== null && modal !== "timing") ||
    askBgScope ||
    pendingImport !== null ||
    exportCheck !== null ||
    showHomeConfirm ||
    pendingDeleteDiffId !== null;
  const modalAtmosphereActive = modalAtmosphereOpen && audio.isPlaying;
  const effectiveHitsounds = useMemo(() => {
    if (hitsoundSkinSource === "default") return null;
    if (hitsoundSkinSource === "selected") {
      return hitsoundSkin?.hitsounds ?? null;
    }
    return skin?.hitsounds ?? null;
  }, [hitsoundSkin, hitsoundSkinSource, skin]);

  const playtestHitsounds = useHitsounds(
    audio.getCurrentTime,
    audio.isPlaying && !playtest.active,
    active.notes,
    active.timingPoints?.length ? active.timingPoints : timingPoints,
    appSettings.hitsoundVolume,
    appSettings.hitsoundsEnabled,
    modalAtmosphereActive,
    effectiveHitsounds,
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
    const id = window.setTimeout(() => {
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
    }, 600);
    return () => window.clearTimeout(id);
  }, [cloudProjectId, activeId, audio.currentTime]);

  useEffect(() => {
    if (pendingSeekRef.current != null && audio.duration > 0) {
      audio.seek(Math.min(pendingSeekRef.current, audio.duration));
      pendingSeekRef.current = null;
    }
  }, [audio.duration, audio]);

  const autoSaveTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!cloudProjectId || !canEdit) return;
    window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      setAutoSave("saving");
      saveProjectDataCloud(cloudProjectId, {
        meta: metaRef.current,
        timingPoints: timingPointsRef.current,
        difficulties: difficultiesRef.current,
        activeId: activeIdRef.current,
        view,
        bgScope,
      })
        .then(() => setAutoSave("saved"))
        .catch(() => setAutoSave("idle"));
    }, 1500);
    return () => window.clearTimeout(autoSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudProjectId, canEdit, difficulties, meta, timingPoints]);

  useEffect(() => {
    if (!cloudProjectId || !liveEnabled || !canEdit) return;
    const pending: { kind: "audio" | "bg"; file: LoadedFile }[] = [];
    for (const f of Object.values(audioFiles))
      if (!publishedAssetsRef.current.has(`audio:${f.name}`))
        pending.push({ kind: "audio", file: f });
    for (const f of Object.values(bgFiles))
      if (!publishedAssetsRef.current.has(`bg:${f.name}`))
        pending.push({ kind: "bg", file: f });
    if (!pending.length) return;

    let cancelled = false;
    void (async () => {
      for (const { kind, file } of pending) {
        if (cancelled) return;
        try {
          await publishProjectAsset(cloudProjectId, kind, {
            name: file.name,
            blob: file.blob,
          });
          publishedAssetsRef.current.add(`${kind}:${file.name}`);
        } catch {
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudProjectId, liveEnabled, canEdit, audioFiles, bgFiles]);

  const assetAttemptsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!cloudProjectId || !liveEnabled) return;
    const ATTEMPT_CAP = 20;
    const wanted = new Set<string>();
    for (const d of difficulties) {
      if (d.audioFilename && !audioFiles[d.audioFilename])
        wanted.add(d.audioFilename);
      if (d.backgroundFilename && !bgFiles[d.backgroundFilename])
        wanted.add(d.backgroundFilename);
    }
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
          publishedAssetsRef.current.add(`${a.kind}:${a.name}`);
          attempts.delete(a.name);
        }
        if (Object.keys(newAudio).length)
          setAudioFiles((prev) => ({ ...newAudio, ...prev }));
        if (Object.keys(newBg).length)
          setBgFiles((prev) => ({ ...newBg, ...prev }));
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

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  const activeBg = active.backgroundFilename ? bgFiles[active.backgroundFilename] ?? null : null;
  const activeVideo = active.videoFilename ? videoFiles[active.videoFilename] ?? null : null;

  const activeTimingPoints =
    active.timingPoints?.length ? active.timingPoints : timingPoints;

  const [autoTimeOpen, setAutoTimeOpen] = useState(false);
  const [autoTimeStatus, setAutoTimeStatus] = useState<AutoTimeStatus>("idle");
  const [autoTimeResult, setAutoTimeResult] = useState<BpmDetection | null>(
    null,
  );

  useEffect(() => {
    if (
      !autoTimeOpen ||
      (autoTimeStatus !== "done" && autoTimeStatus !== "failed")
    )
      return;
    const id = window.setTimeout(
      () => setAutoTimeOpen(false),
      autoTimeStatus === "done" ? 4000 : 6000,
    );
    return () => window.clearTimeout(id);
  }, [autoTimeOpen, autoTimeStatus]);
  const activeSkin = skin?.keymodes[active.keyCount] ?? null;
  const playtestSettings = appSettings.playtest;
  const playtestSettingsRef = useRef(playtestSettings);
  playtestSettingsRef.current = playtestSettings;
  const playtestRate = clampPlaytestRate(playtestSettings.rate);
  const playtestWindows = useMemo(
    () => scaleWindows(maniaJudgementWindows(active.overallDifficulty), playtestRate),
    [active.overallDifficulty, playtestRate],
  );
  const playtestReleaseWindows = useMemo(
    () => scaleWindows(maniaReleaseWindows(active.overallDifficulty), playtestRate),
    [active.overallDifficulty, playtestRate],
  );
  // Refs so the input handlers pick up rate/OD changes without re-binding.
  const playtestWindowsRef = useRef(playtestWindows);
  playtestWindowsRef.current = playtestWindows;
  const playtestReleaseWindowsRef = useRef(playtestReleaseWindows);
  playtestReleaseWindowsRef.current = playtestReleaseWindows;

  const resetPlaytestRuntime = useCallback((startTime: number) => {
    const headJudged = new Set<string>();
    const tailJudged = new Set<string>();
    for (const n of active.notes) {
      if (n.startTime < startTime) {
        headJudged.add(n.id);
        tailJudged.add(n.id);
      }
    }
    playtestHeadJudgedRef.current = headJudged;
    playtestTailJudgedRef.current = tailJudged;
    playtestHeldLnRef.current = new Map();
    playtestErrStatsRef.current = { n: 0, sum: 0, sumSq: 0 };
    playtestConsumedRef.current = new Set();
    playtestEndArmedRef.current = false;
    setPlaytestConsumedIds(new Set());
    setPlaytest({
      ...initialPlaytestState(),
      active: true,
      startTime,
    });
  }, [active.notes]);

  const registerPlaytestResult = useCallback((result: HitResult) => {
    if (result.judgement !== "miss") {
      const s = playtestErrStatsRef.current;
      s.n += 1;
      s.sum += result.hitError;
      s.sumSq += result.hitError * result.hitError;
    }
    const { n, sum, sumSq } = playtestErrStatsRef.current;
    const mean = n ? sum / n : 0;
    const unstableRate = n ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) * 10 : 0;
    setPlaytest((prev) => {
      if (!prev.active) return prev;
      const judgements = addJudgement(prev.judgements, result.judgement);
      const hitResults = [...prev.hitResults, result];
      const combo =
        result.judgement === "miss" ? 0 : Math.min(prev.combo + 1, 99999);
      const maxCombo = Math.max(prev.maxCombo, combo);
      return {
        ...prev,
        combo,
        maxCombo,
        judgements,
        hitResults,
        accuracy: accuracyFromCounts(judgements),
        score: scoreFromResults(hitResults),
        unstableRate,
      };
    });
  }, []);

  const consumePlaytestNote = useCallback((id: string) => {
    if (playtestConsumedRef.current.has(id)) return;
    playtestConsumedRef.current.add(id);
    setPlaytestConsumedIds(new Set(playtestConsumedRef.current));
  }, []);

  const playtestInputTime = useCallback(() => {
    const raw = audio.getCurrentTime();
    return playtestSettings.offsetMode === "audio"
      ? raw + playtestSettings.offsetMs
      : raw;
  }, [audio, playtestSettings.offsetMode, playtestSettings.offsetMs]);

  const missPlaytestPart = useCallback(
    (
      note: ManiaNote,
      time: number,
      part: HitResult["part"],
      targetTime: number,
    ) => {
      registerPlaytestResult({
        noteId: note.id,
        column: note.column,
        time,
        hitError: time - targetTime,
        judgement: "miss",
        part,
      });
    },
    [registerPlaytestResult],
  );

  const handlePlaytestPress = useCallback(
    (column: number) => {
      const pt = playtestRef.current;
      if (!pt.active || pt.ended || pt.paused) return;
      const time = playtestInputTime();
      const windows = playtestWindowsRef.current;
      const candidate = active.notes
        .filter(
          (n) =>
            n.column === column &&
            !playtestConsumedRef.current.has(n.id) &&
            !playtestHeadJudgedRef.current.has(n.id),
        )
        .sort(
          (a, b) =>
            Math.abs(a.startTime - time) - Math.abs(b.startTime - time),
        )[0];
      if (!candidate) return;

      const hitError = time - candidate.startTime;
      const judgement = judgeHitError(hitError, windows);
      if (!judgement) return;

      playtestHeadJudgedRef.current.add(candidate.id);
      const part: HitResult["part"] =
        candidate.endTime !== undefined ? "ln-head" : "rice";
      registerPlaytestResult({
        noteId: candidate.id,
        column,
        time,
        hitError,
        judgement,
        part,
      });
      playtestHitsounds.playNote(candidate);

      if (candidate.endTime !== undefined && judgement !== "miss") {
        playtestHeldLnRef.current.set(candidate.id, candidate);
      } else {
        if (candidate.endTime !== undefined) {
          playtestTailJudgedRef.current.add(candidate.id);
        }
        consumePlaytestNote(candidate.id);
      }
    },
    [
      active.notes,
      active.overallDifficulty,
      consumePlaytestNote,
      playtestHitsounds,
      playtestInputTime,
      registerPlaytestResult,
    ],
  );

  const handlePlaytestRelease = useCallback(
    (column: number) => {
      const pt = playtestRef.current;
      if (!pt.active || pt.ended || pt.paused) return;
      const time = playtestInputTime();
      const held = [...playtestHeldLnRef.current.values()].find(
        (n) => n.column === column,
      );
      if (!held || held.endTime === undefined) return;
      const releaseWindows = playtestReleaseWindowsRef.current;
      const droppedEarly = time < held.endTime - releaseWindows.miss;
      playtestHeldLnRef.current.delete(held.id);
      playtestTailJudgedRef.current.add(held.id);
      if (droppedEarly) {
        setPlaytest((prev) => (prev.active ? { ...prev, combo: 0 } : prev));
      } else {
        consumePlaytestNote(held.id);
      }
    },
    [active.overallDifficulty, consumePlaytestNote, playtestInputTime],
  );

  const exitPlaytest = useCallback(() => {
    audio.pause();
    setPlaytest((prev) => ({ ...prev, active: false, ended: false, paused: false }));
    playtestHeadJudgedRef.current = new Set();
    playtestTailJudgedRef.current = new Set();
    playtestHeldLnRef.current = new Map();
    playtestErrStatsRef.current = { n: 0, sum: 0, sumSq: 0 };
    playtestConsumedRef.current = new Set();
    setPlaytestConsumedIds(new Set());
  }, [audio]);

  const startPlaytest = useCallback(
    (startTime = audio.getCurrentTime()) => {
      if (!audioFile || !projectStarted) return;
      const clamped = Math.max(0, Math.min(startTime, audio.duration || startTime));
      setModal(null);
      setCommentsOpen(false);
      resetPlaytestRuntime(clamped);
      audio.setPlaybackRate(clampPlaytestRate(playtestSettingsRef.current.rate));
      audio.seek(clamped);
      audio.play();
    },
    [audio, audioFile, projectStarted, resetPlaytestRuntime],
  );

  const restartPlaytest = useCallback(() => {
    startPlaytest(playtestRef.current.startTime ?? 0);
  }, [startPlaytest]);

  const pausePlaytest = useCallback(() => {
    setPlaytest((prev) =>
      prev.active && !prev.ended && !prev.paused
        ? { ...prev, paused: true }
        : prev,
    );
    audio.pause();
  }, [audio]);

  const resumePlaytest = useCallback(() => {
    setPlaytest((prev) =>
      prev.active && !prev.ended && prev.paused
        ? { ...prev, paused: false }
        : prev,
    );
    if (playtestRef.current.active && !playtestRef.current.ended) audio.play();
  }, [audio]);

  const togglePlaytestPause = useCallback(() => {
    const pt = playtestRef.current;
    if (!pt.active || pt.ended) return;
    if (pt.paused) resumePlaytest();
    else pausePlaytest();
  }, [pausePlaytest, resumePlaytest]);

  const { heldCodes: heldPlaytestKeys, pressedColumnsRef: playtestPressedColumnsRef } =
    usePlaytestInput({
      active: playtest.active,
      paused: playtest.paused,
      keyCount: active.keyCount,
      keybinds: playtestSettings.keybinds,
      quickRestartCode: playtestSettings.quickRestartKey,
      onPress: handlePlaytestPress,
      onRelease: handlePlaytestRelease,
      onPause: togglePlaytestPause,
      onRestart: restartPlaytest,
    });

  const playtestTickRef = useRef({
    audio,
    active,
    playtestInputTime,
    missPlaytestPart,
    consumePlaytestNote,
  });
  playtestTickRef.current = {
    audio,
    active,
    playtestInputTime,
    missPlaytestPart,
    consumePlaytestNote,
  };

  useEffect(() => {
    if (!playtest.active || playtest.ended || playtest.paused) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const {
        audio,
        active,
        playtestInputTime,
        missPlaytestPart,
        consumePlaytestNote,
      } = playtestTickRef.current;
      const time = playtestInputTime();
      const windows = playtestWindowsRef.current;
      const releaseWindows = playtestReleaseWindowsRef.current;
      for (const note of active.notes) {
        if (playtestConsumedRef.current.has(note.id)) continue;
        if (
          !playtestHeadJudgedRef.current.has(note.id) &&
          time > note.startTime + windows.miss
        ) {
          playtestHeadJudgedRef.current.add(note.id);
          playtestTailJudgedRef.current.add(note.id);
          playtestHeldLnRef.current.delete(note.id);
          missPlaytestPart(
            note,
            time,
            note.endTime === undefined ? "rice" : "ln-head",
            note.startTime,
          );
          continue;
        }
        if (
          note.endTime !== undefined &&
          playtestHeadJudgedRef.current.has(note.id) &&
          !playtestTailJudgedRef.current.has(note.id) &&
          time > note.endTime + releaseWindows.miss
        ) {
          playtestTailJudgedRef.current.add(note.id);
          playtestHeldLnRef.current.delete(note.id);
          consumePlaytestNote(note.id);
        }
      }
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
  }, [playtest.active, playtest.ended, playtest.paused]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "F5") return;
      e.preventDefault();
      if (playtestRef.current.active) exitPlaytest();
      else if (!modalRef.current) startPlaytest(audio.getCurrentTime());
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [audio, startPlaytest, exitPlaytest]);

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
    timingPoints.length !== 1 ||
    timingPoints[0]?.bpm !== 120 ||
    !hasDefaultDifficulty;
  const showChrome = hasProject && !zenMode && !playtest.active;
  const showChromeRef = useRef(showChrome);
  showChromeRef.current = showChrome;
  const playtestVisualOffset =
    playtest.active && playtestSettings.offsetMode === "visual"
      ? playtestSettings.offsetMs
      : 0;
  const editorCurrentTime = audio.currentTime + playtestVisualOffset;
  const getEditorCurrentTime = useCallback(
    () => getCurrentTime() + playtestVisualOffset,
    [getCurrentTime, playtestVisualOffset],
  );
  const editorNotes = useMemo(
    () =>
      playtest.active
        ? active.notes.filter((note) => !playtestConsumedIds.has(note.id))
        : active.notes,
    [active.notes, playtest.active, playtestConsumedIds],
  );
  const editorView = useMemo(
    () =>
      playtest.active
        ? { ...view, scrollSpeed: playtestSettings.scrollSpeed }
        : view,
    [playtest.active, playtestSettings.scrollSpeed, view],
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
    setDifficulties((prev) =>
      prev.map((d) =>
        d.videoFilename === videoName
          ? { ...d, videoOffsetMs: ms || undefined }
          : d,
      ),
    );
  }, [active.videoFilename]);

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
        if (!res.ok) throw new Error("Couldn't load that preset skin.");
        await loadSkin(await res.blob(), fileName, target, false);
      } catch (err) {
        setSkinError(
          err instanceof Error ? err.message : "Couldn't load that preset skin.",
        );
      }
    },
    [loadSkin],
  );

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

  const importMapFile = useCallback(async (file: File) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    try {
      const map = await importOsz(file);
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
      setActiveId(diffs[0].id);
      setPendingImport(null);
      setModal(null);
      setLocalProjectId(newLocalProjectId());
      void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import .osz file.",
      );
    } finally {
      setImportingMap(false);
    }
  }, []);

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
          const songs = await scanPackFromZip(file);
          if (songs.length > 0) {
            setScannedPackSongs(songs);
            setImportingMap(false);
            setModal("packBrowser");
            return;
          }
        } catch {
        }
        setImportingMap(false);
      }
      requestImportMap(file);
    },
    [requestImportMap],
  );

  const importSmFile = useCallback(async (file: File) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    try {
      const text = await file.text();
      const map = parseSmFile(text);
      setCloudProjectId(null);
      setCloudOwnerId(null);
      setMyRole(null);
      setReferenceId(null);
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
        err instanceof Error ? err.message : "Failed to import .sm file.",
      );
    } finally {
      setImportingMap(false);
    }
  }, []);

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
        setPackError(err instanceof Error ? err.message : "Failed to scan pack.");
      }
    } finally {
      setScanningPack(false);
    }
  }, []);

  const loadSampleMap = useCallback(
    async (map: SampleMap) => {
      setModal(null);
      setImportingMap(true);
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}${map.osz}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const name = map.osz.split("/").pop() ?? `${map.id}.osz`;
        const file = new File([blob], name, { type: "application/octet-stream" });
        await importMapFile(file);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : "Failed to load the map.",
        );
        setImportingMap(false);
      }
    },
    [importMapFile],
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
    (points: TimingPoint[]) => patchDifficulty(activeIdRef.current, { timingPoints: points }),
    [patchDifficulty],
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

  const [aiModReport, setAiModReport] = useState<AiModReport | null>(null);

  const runAiModCheck = useCallback(() => {
    setAiModReport(
      runAiMod({
        meta: metaRef.current,
        difficulties: difficultiesRef.current,
        audioFiles,
        bgFiles,
        audioDurationMs: durationRef.current
          ? Math.round(durationRef.current)
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
    (issue: AiModIssue) => {
      if (issue.diffId && issue.diffId !== activeIdRef.current)
        setActiveId(issue.diffId);
      if (issue.time !== undefined) audio.seek(Math.max(0, issue.time));
    },
    [audio],
  );

  const handleResnap = useCallback(() => {
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
          audioDurationMs: durationRef.current
            ? Math.round(durationRef.current)
            : undefined,
        }),
      );
    }
  }, [patchDifficulty, audioFiles, bgFiles]);

  const addBookmark = useCallback(
    (ms: number) => {
      if (!canEditRef.current) return;
      const t = Math.round(ms);
      if (!(t >= 0)) return;
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          const existing = d.bookmarks ?? [];
          if (existing.some((b) => Math.abs(b - t) <= 5)) return d;
          return { ...d, bookmarks: [...existing, t].sort((a, b) => a - b) };
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
          return next.length === existing.length
            ? d
            : { ...d, bookmarks: next.length ? next : undefined };
        }),
      );
    },
    [markStructural],
  );

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
          name: `${src.name} (copy)`,
          // Unsubmitted copy: reusing the source's id would collide with it.
          beatmapId: undefined,
          timingPoints: src.timingPoints.map((p) => ({ ...p, id: uid("tp") })),
          notes: src.notes.map((n) => ({ ...n, id: uid("n") })),
        };
        return [...prev, copy];
      });
    },
    [markStructural],
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

  const deleteDifficulty = useCallback(
    (id: string) => {
      if (!canEditRef.current) return;
      const prev = difficultiesRef.current;
      if (prev.length <= 1) return;
      markStructural();
      const next = prev.filter((d) => d.id !== id);
      setDifficulties(next);
      if (id === activeIdRef.current) setActiveId(next[0].id);
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

  const applyCopyHitsounds = useCallback(
    (sourceId: string) => {
      const did = activeIdRef.current;
      if (sourceId === did) return;
      const diffs = difficultiesRef.current;
      const target = diffs.find((d) => d.id === did);
      const source = diffs.find((d) => d.id === sourceId);
      if (!target || !source) return;
      const { before, after } = copyHitsounds(target.notes, source.notes);
      if (after.length === 0) return;
      commitNoteOp({ t: "note.update", diffId: did, before, after });
    },
    [commitNoteOp],
  );

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
  const [, bumpHistory] = useState(0);

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
    undoStackRef.current.push(presentRef.current);
    if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    redoStackRef.current = [];
    presentRef.current = snapshot;
    bumpHistory((v) => v + 1);
  }, [snapshot]);

  useEffect(() => {
    if (!sessionActiveRef.current || !pendingDocSyncRef.current) return;
    pendingDocSyncRef.current = false;
    const pid = cloudProjectIdRef.current;
    if (!pid || !canEditRef.current) return;
    void saveProjectDataCloud(pid, {
      meta,
      timingPoints,
      difficulties,
      activeId: activeIdRef.current,
      view,
      bgScope,
    })
      .then(() => collabRef.current?.sendRefresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, timingPoints, difficulties]);

  const applySnapshot = useCallback((s: DocSnapshot) => {
    applyingHistoryRef.current = true;
    setMeta(s.meta);
    setTimingPoints(s.timingPoints);
    setDifficulties(s.difficulties);
  }, []);

  const undo = useCallback(() => {
    if (sessionActiveRef.current) {
      const op = opUndoRef.current.pop();
      if (!op) return;
      const inv = invertNoteOp(op);
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
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (sessionActiveRef.current) {
      const op = opRedoRef.current.pop();
      if (!op) return;
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
  }, [applySnapshot]);

  const canUndo = liveEnabled
    ? opUndoRef.current.length > 0
    : undoStackRef.current.length > 0;
  const canRedo = liveEnabled
    ? opRedoRef.current.length > 0
    : redoStackRef.current.length > 0;

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

  useEffect(() => {
    preloadUiSounds();
  }, []);
  useEffect(() => {
    setUiSoundsEnabled(appSettings.uiSoundsEnabled);
  }, [appSettings.uiSoundsEnabled]);
  useEffect(() => {
    setUiSoundVolume(appSettings.uiSoundVolume);
  }, [appSettings.uiSoundVolume]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const hit = el?.closest(
        'button, [role="button"], a[href], select, summary',
      );
      if (hit && !hit.closest("[data-no-uisound]")) playUiSound("click");
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (exportCheck || pendingImport || showHomeConfirm || pendingDeleteDiffId)
      playUiSound("areYouSure");
  }, [exportCheck, pendingImport, showHomeConfirm, pendingDeleteDiffId]);

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
        const loaded = await importOsk(rec.blob, rec.name).catch(() => null);
        if (!cancelled && loaded) setSkin(loaded);
      }
      const hitsoundRec = await loadHitsoundSkinBlob().catch(() => null);
      if (!cancelled && hitsoundRec) {
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
    if (v !== null) audio.setVolume(v);
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
  const projectStartedRef = useRef(false);
  projectStartedRef.current = projectStarted;
  const slowHeldRef = useRef(false);
  useEffect(() => {
    const isSlowKey = (e: KeyboardEvent) =>
      e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey && !e.altKey;
    const shouldIgnoreHotkey = (e: KeyboardEvent) => {
      if (playtestRef.current.active) return true;
      if (!projectStartedRef.current) return true;
      if (modalRef.current || askBgScope) return true;
      if (!isTypingTarget(e.target)) return false;
      return (e.target as HTMLInputElement).type !== "range";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const isSpace = e.code === "Space" || e.key === " ";
      const isTab = e.key === "Tab";
      const isUp = e.key === "ArrowUp";
      const isDown = e.key === "ArrowDown";
      const isF3 = e.key === "F3";
      const isF4 = e.key === "F4";
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;
      const isZoomIn =
        noMod && (e.key === "+" || e.key === "=" || e.code === "NumpadAdd");
      const isZoomOut =
        noMod && (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract");
      const isSlow = isSlowKey(e);
      const isBookmark =
        e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (
        !isSpace &&
        !isTab &&
        !isUp &&
        !isDown &&
        !isF3 &&
        !isF4 &&
        !isZoomIn &&
        !isZoomOut &&
        !isSlow &&
        !isBookmark
      )
        return;
      if (shouldIgnoreHotkey(e)) return;
      if (
        !hasAudioRef.current &&
        !isTab &&
        !isF3 &&
        !isF4 &&
        !isZoomIn &&
        !isZoomOut
      )
        return;
      e.preventDefault();
      blurActiveControl();
      if (isTab) setZenMode((z) => !z);
      else if (isBookmark) {
        if (!e.repeat) addBookmark(Math.round(currentTimeRef.current));
      } else if (isSpace) audio.toggle();
      else if (isSlow) {
        if (slowHeldRef.current || e.repeat) return;
        slowHeldRef.current = true;
        audio.setPlaybackRate(0.25);
      }
      else if (isUp) audio.setVolume(audio.volume + 0.05);
      else if (isDown) audio.setVolume(audio.volume - 0.05);
      else if (isF3 || isF4) {
        setView((v) => ({
          ...v,
          scrollSpeed: Math.max(
            MIN_SCROLL_SPEED,
            Math.min(MAX_SCROLL_SPEED, v.scrollSpeed + (isF4 ? 1 : -1)),
          ),
        }));
      } else if (isZoomIn || isZoomOut) {
        setAppSettings((s) => ({
          ...s,
          playfieldScale: Math.round(
            Math.max(
              0.5,
              Math.min(2.5, s.playfieldScale + (isZoomIn ? 0.1 : -0.1)),
            ) * 100,
          ) / 100,
        }));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isSlowKey(e) || !slowHeldRef.current) return;
      slowHeldRef.current = false;
      e.preventDefault();
      audio.setPlaybackRate(1);
    };
    const onBlur = () => {
      if (!slowHeldRef.current) return;
      slowHeldRef.current = false;
      audio.setPlaybackRate(1);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [audio, askBgScope, addBookmark]);

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
  const isOszFile = (f: File) => /\.(osz|zip)$/i.test(f.name);
  const isOskFile = (f: File) => /\.osk$/i.test(f.name);
  const isSmFile = (f: File) => /\.(sm|ssc)$/i.test(f.name);

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
            setImportError("Failed to read the dropped folder.");
            setImportingMap(false);
            return;
          }
          setImportingMap(false);
        }
      }

      const files = Array.from(e.dataTransfer.files);
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
      const sm = files.find(isSmFile);
      if (sm) {
        requestImportSm(sm);
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
    [onAudioFile, onBackgroundFile, onVideoFile, onSkinFile, importArchive, requestImportSm, importPackSong, resetFileDrag],
  );

  const canExport = Object.keys(audioFiles).length > 0 && totalNotes > 0;

  useEffect(() => {
    audio.setAmbientDucking(modalAtmosphereActive);
  }, [audio.setAmbientDucking, modalAtmosphereActive]);

  const doExportOsu = useCallback(() => {
    if (!audioFile) return;
    downloadOsu({
      meta,
      difficulty: active,
      timingPoints: activeTimingPoints,
      audioFilename: audioFile.name,
      backgroundFilename: active.backgroundFilename,
      videoFilename: active.videoFilename,
      videoOffsetMs: active.videoOffsetMs,
    });
    playUiSound("mapExportDone");
    void logAnalyticsEvent("export_osu", authUser?.id).catch(() => {});
  }, [audioFile, active, activeTimingPoints, meta, authUser?.id]);

  const doExportSm = useCallback(async () => {
    if (Object.keys(audioFiles).length === 0) return;
    setExporting(true);
    try {
      await downloadSmZip({
        meta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
      });
      playUiSound("mapExportDone");
      void logAnalyticsEvent("export_sm", authUser?.id).catch(() => {});
    } finally {
      setExporting(false);
    }
  }, [meta, difficulties, timingPoints, audioFiles, bgFiles, authUser?.id]);

  const doExportOsz = useCallback(async () => {
    if (Object.keys(audioFiles).length === 0) return;
    setExporting(true);
    try {
      await downloadOsz({
        meta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
        videoFiles,
        jpegQuality: appSettings.exportPngBackgroundsAsJpeg
          ? appSettings.exportJpegQuality
          : undefined,
      });
      playUiSound("mapExportDone");
      void logAnalyticsEvent("export_osz", authUser?.id).catch(() => {});
    } finally {
      setExporting(false);
    }
  }, [
    audioFiles,
    difficulties,
    bgFiles,
    videoFiles,
    meta,
    timingPoints,
    authUser?.id,
    appSettings.exportPngBackgroundsAsJpeg,
    appSettings.exportJpegQuality,
  ]);

  const requestExport = useCallback(
    (target: string, run: () => void) => {
      const result = validateProject({
        meta,
        difficulties,
        audioFiles,
        bgFiles,
        target,
      });
      if (result.errors.length > 0 || result.warnings.length > 0) {
        setExportCheck({ result, target, run });
      } else {
        run();
      }
    },
    [meta, difficulties, audioFiles, bgFiles],
  );

  const handleExportOsu = useCallback(
    () => requestExport(".osu", doExportOsu),
    [requestExport, doExportOsu],
  );
  const handleExportOsz = useCallback(
    () => requestExport(".osz", () => void doExportOsz()),
    [requestExport, doExportOsz],
  );
  const handleExportSm = useCallback(
    () => requestExport(".sm", () => void doExportSm()),
    [requestExport, doExportSm],
  );

  const importFile = useCallback(
    (file: File) => {
      if (/\.(sm|ssc)$/i.test(file.name)) {
        void importSmFile(file);
      } else {
        void importMapFile(file);
      }
    },
    [importSmFile, importMapFile],
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
      setImportError("Failed to export current project. Import canceled.");
    }
  }, [pendingImport, doExportOsz, importFile]);

  const cancelPendingImport = useCallback(() => {
    setPendingImport(null);
  }, []);

  const removeDuplicates = useCallback(() => {
    if (!exportCheck) return;
    const dupMap = exportCheck.result.duplicateNoteIds;
    const nextDiffs = difficulties.map((d) => {
      const ids = new Set(dupMap[d.id] ?? []);
      return ids.size
        ? { ...d, notes: d.notes.filter((n) => !ids.has(n.id)) }
        : d;
    });
    setDifficulties(nextDiffs);
    const result = validateProject({
      meta,
      difficulties: nextDiffs,
      audioFiles,
      bgFiles,
      target: exportCheck.target,
    });
    setExportCheck((check) => (check ? { ...check, result } : check));
  }, [exportCheck, difficulties, meta, audioFiles, bgFiles]);

  const buildSavedProject = useCallback((): SavedProject => ({
    version: 1,
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

  const handleSave = useCallback(async (silent = false) => {
    if (!silent) setSaveStatus("saving");
    try {
      await saveProject(buildSavedProject(), localProjectId);
      setSaveErrorDetail(null);
      if (!silent) setSaveStatus("saved");
    } catch (err) {
      setSaveErrorDetail(describeSaveError(err));
      setSaveStatus("error");
    }
  }, [buildSavedProject, localProjectId]);

  const localAutosaveTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!projectStarted || !appSettings.localAutosaveEnabled || !canEdit) return;
    window.clearTimeout(localAutosaveTimerRef.current);
    localAutosaveTimerRef.current = window.setTimeout(() => {
      void handleSave(true);
    }, 2500);
    return () => window.clearTimeout(localAutosaveTimerRef.current);
  }, [
    projectStarted,
    appSettings.localAutosaveEnabled,
    canEdit,
    handleSave,
  ]);

  useEffect(() => {
    if (saveStatus !== "saved" && saveStatus !== "error") return;
    const id = window.setTimeout(() => setSaveStatus(null), 2000);
    return () => window.clearTimeout(id);
  }, [saveStatus]);

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
      });
      publishedAssetsRef.current = new Set([
        ...Object.values(audioFiles).map((f) => `audio:${f.name}`),
        ...Object.values(bgFiles).map((f) => `bg:${f.name}`),
      ]);
      setCloudProjectId(id);
      setCloudOwnerId(authUser.id);
      setMyRole("owner");
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

  useEffect(() => {
    if (cloudSaveStatus !== "saved" && cloudSaveStatus !== "error") return;
    const id = window.setTimeout(() => setCloudSaveStatus(null), 2000);
    return () => window.clearTimeout(id);
  }, [cloudSaveStatus]);

  const loadCloudProject = useCallback(async (id: string) => {
    setCloudError(null);
    setModal(null);
    setImportingMap(true);
    try {
      const proj = await loadProjectCloud(id);
      importStartedRef.current = true;
      applyingHistoryRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      publishedAssetsRef.current = new Set([
        ...proj.audio.map((a) => `audio:${a.name}`),
        ...proj.bg.map((b) => `bg:${b.name}`),
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

  const addInviteNotice = useCallback(async (projectId: string) => {
    if (projectId === cloudProjectIdRef.current) return;
    try {
      const rows = await listMyProjectsRich();
      const proj = rows.find((r) => r.id === projectId);
      if (!proj) return;
      const owner = proj.participants.find((x) => x.role === "owner");
      setInvites((prev) =>
        prev.some((n) => n.projectId === projectId)
          ? prev
          : [
              ...prev,
              {
                projectId,
                title: proj.title || "Untitled",
                who: owner?.username ?? null,
                avatar: owner?.avatar_url ?? null,
              },
            ],
      );
      playUiSound("invite");
    } catch {
    }
  }, []);

  useEffect(() => {
    if (!authUser) {
      setInvites([]);
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

  const joinInvite = useCallback(
    (n: InviteNotice) => {
      setInvites((prev) => prev.filter((x) => x.projectId !== n.projectId));
      void loadCloudProject(n.projectId);
    },
    [loadCloudProject],
  );
  const ignoreInvite = useCallback((n: InviteNotice) => {
    setInvites((prev) => prev.filter((x) => x.projectId !== n.projectId));
  }, []);

  const handlePublishPattern = useCallback(
    (pattern: PatternNote[], keyCount: number) => {
      setPublishPattern(pattern);
      setPublishKeyCount(keyCount);
      setModal("publishPreset");
    },
    [],
  );

  const copyPresetToClipboard = useCallback((pattern: PatternNote[]) => {
    setPresetToCopy({ id: uid("clip"), pattern });
    setModal(null);
  }, []);

  const handleNew = useCallback((confirm = true) => {
    if (confirm) {
      const confirmed = window.confirm(
        "Start a new map? This removes the current audio, background, notes and " +
          "timing from the editor.",
      );
      if (!confirmed) return;
    }

    applyingHistoryRef.current = true;
    undoStackRef.current = [];
    redoStackRef.current = [];

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

    const fresh = makeDifficulty("Normal", 4);
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
    setLocalProjectId(newLocalProjectId());
    setCloudProjectId(null);
    setCloudOwnerId(null);
    setMyRole(null);
    setReferenceId(null);
    void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
      () => {},
    );

  }, []);

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

  return (
    <div
      className="relative h-full overflow-hidden bg-ink-900"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className={`flex h-full flex-col transition-[filter,opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          modalAtmosphereActive
            ? "scale-[0.992] blur-[2px] opacity-75"
            : "scale-100 blur-0 opacity-100"
        }`}
      >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-ink-900/76 backdrop-blur-md">
          <div className="rounded-2xl border-2 border-dashed border-accent/70 bg-ink-800/82 px-12 py-10 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-2 text-3xl">🎵</div>
            <p className="text-lg font-semibold text-slate-100">Drop to load</p>
            <p className="text-sm text-slate-400">
              audio (.mp3 / .ogg) · image background · .osz / .sm / .ssc map (folder) · .osk skin
            </p>
          </div>
        </div>
      )}

      {importingMap && (
        <div className="loader-fade-in fixed inset-0 z-[55] flex flex-col items-center justify-center gap-8 bg-ink-900/80">
          <img
            src={`${import.meta.env.BASE_URL}logo.png?v=2`}
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
          <p className="loader-content-in text-sm font-medium tracking-wide text-slate-300">
            Loading map…
          </p>
        </div>
      )}

      <header
        className={`flex items-center justify-between gap-4 overflow-hidden border-white/10 bg-ink-800/65 px-5 shadow-[0_10px_35px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[max-height,padding,opacity,transform] duration-300 ease-out ${
          zenMode
            ? "pointer-events-none max-h-0 -translate-y-full border-b-0 py-0 opacity-0"
            : "max-h-20 translate-y-0 border-b py-2.5 opacity-100"
        }`}
        aria-hidden={zenMode}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => hasProject && setShowHomeConfirm(true)}
              className="flex items-center gap-2.5 rounded-md transition hover:opacity-80"
              title={hasProject ? "Return to home screen" : undefined}
              data-no-uisound=""
            >
              <img
                src={`${import.meta.env.BASE_URL}logo.png?v=2`}
                alt="Cascade"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="h-8 w-8 select-none rounded-lg object-cover"
              />
              <span className="text-sm font-semibold text-slate-100">
                Cascade
              </span>
            </button>
          </div>

          <div
            className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
              hasProject
                ? "max-w-[44rem] translate-x-0 opacity-100"
                : "pointer-events-none max-w-0 -translate-x-3 opacity-0"
            }`}
            aria-hidden={!hasProject}
          >
            <nav className="flex items-center gap-1 whitespace-nowrap">
              <MenuButton onClick={() => setModal("mapSettings")}>
                Map Settings
              </MenuButton>
              <MenuButton onClick={() => setModal("timing")}>Timing</MenuButton>
              <MenuButton onClick={() => setModal("difficulty")}>
                Difficulty
              </MenuButton>
              <MenuButton onClick={() => setModal("tools")}>Tools</MenuButton>
              <MenuButton onClick={openAiMod}>AiMod</MenuButton>
              <MenuButton onClick={() => setModal("presets")}>
                Presets
              </MenuButton>
              <MenuButton onClick={() => setModal("skin")}>Skin</MenuButton>
              <MenuButton onClick={() => setModal("settings")}>
                Settings
              </MenuButton>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <IconButton
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                ↶
              </IconButton>
              <IconButton
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
              >
                ↷
              </IconButton>
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
              hasProject
                ? "max-w-[44rem] translate-x-0 opacity-100"
                : "pointer-events-none max-w-0 translate-x-3 opacity-0"
            }`}
            aria-hidden={!hasProject}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="mr-1 hidden text-xs text-slate-500 2xl:inline">
                {active.keyCount}K · {active.notes.length} notes ({holds} holds)
              </span>
              {cloudProjectId && myRole === "viewer" && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  View only
                </span>
              )}
              {cloudProjectId && authUser && cloudOwnerId === authUser.id && (
                <IconButton
                  onClick={() => setModal("share")}
                  title="Share - invite collaborators"
                >
                  <UsersIcon className="h-4 w-4" />
                </IconButton>
              )}
              {cloudProjectId && authUser && (
                <IconButton
                  onClick={() => setCommentsOpen((v) => !v)}
                  title="Comments"
                >
                  <CommentIcon className="h-4 w-4" />
                </IconButton>
              )}
              <Menu
                label="File"
                items={[
                  {
                    label: "New / open…",
                    onClick: () => setModal("welcome"),
                  },
                  {
                    label: saveStatus === "saving" ? "Saving…" : "Save locally",
                    hint: "Ctrl+S",
                    disabled: saveStatus === "saving",
                    onClick: () => void handleSave(),
                  },
                  {
                    label:
                      cloudSaveStatus === "saving"
                        ? "Saving…"
                        : "Save to cloud",
                    title: !authUser ? "Log in first!" : undefined,
                    disabled:
                      !authUser || !canEdit || cloudSaveStatus === "saving",
                    onClick: () => void handleCloudSave(),
                  },
                  { separator: true },
                  {
                    label: "Export .osu",
                    disabled: !canExport,
                    onClick: handleExportOsu,
                  },
                  {
                    label: "Export .osz",
                    disabled: !canExport || exporting,
                    onClick: handleExportOsz,
                  },
                  {
                    label: "Export .sm",
                    disabled: !canExport,
                    onClick: handleExportSm,
                  },
                ]}
              />
            </div>
          </div>
          {liveEnabled && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-700/42 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur-xl"
              title={
                collab.status === "connected"
                  ? "Live - edits sync in realtime"
                  : collab.status === "connecting"
                    ? "Connecting to the live session…"
                    : "Live sync offline - check Realtime is enabled"
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
              <span className="text-slate-300">
                {collab.status === "connected"
                  ? "Live"
                  : collab.status === "connecting"
                    ? "Connecting…"
                    : "Offline"}
              </span>
            </span>
          )}
          {cloudProjectId && canEdit && autoSave !== "idle" && (
            <span
              className="text-[11px] text-slate-500"
              title="Changes auto-save to the cloud"
            >
              {autoSave === "saving" ? "Saving…" : "All changes saved"}
            </span>
          )}
          {liveEnabled && collab.peers.length > 0 && (
            <div
              className="flex items-center -space-x-1.5"
              title="Editing now"
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
          <AccountControl
            compact
            onOpenMyMaps={() => setModal("myMaps")}
            onOpenPresets={() => setModal("presets")}
            onOpenFeedback={() => setModal("feedback")}
            onOpenAdmin={() => setModal("admin")}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          className={`shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out ${
            showChrome ? "w-60 opacity-100" : "w-0 opacity-0"
          }`}
          aria-hidden={!showChrome}
        >
          <div className="h-full w-60">
            <DifficultySidebar
              difficulties={difficulties}
              activeId={active.id}
              onSelect={setActiveId}
              onAdd={addDifficulty}
              onDuplicate={duplicateDifficulty}
              onDelete={(id) => setPendingDeleteDiffId(id)}
              onRename={(id, name) => patchDifficulty(id, { name })}
              onCreateRate={createRateDifficulty}
              canEdit={canEdit}
              songDurationMs={audio.duration > 0 ? audio.duration : null}
              peers={liveEnabled ? collab.peers : undefined}
            />
          </div>
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
            <TransportBar
              audio={audio}
              view={view}
              onView={setView}
              hitsoundVolume={appSettings.hitsoundVolume}
              onHitsoundVolume={(v) =>
                setAppSettings((s) => ({ ...s, hitsoundVolume: v }))
              }
              jumpOpen={jumpToTimeOpen}
              onJumpOpenChange={setJumpToTimeOpen}
            />
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="flex h-full w-full">
            <div className="relative min-w-0 flex-1">
            {hasProject ? (
              <ManiaEditor
                notes={editorNotes}
                keyCount={active.keyCount}
                timingPoints={activeTimingPoints}
                previewTime={active.previewTime}
                bookmarks={active.bookmarks}
                view={editorView}
                currentTime={editorCurrentTime}
                getCurrentTime={getEditorCurrentTime}
                isPlaying={audio.isPlaying}
                backgroundUrl={activeBg?.url ?? null}
                videoUrl={activeVideo?.url ?? null}
                videoOffsetMs={active.videoOffsetMs ?? 0}
                playbackRate={audio.playbackRate}
                timeScale={activeRate}
                dimBackground={editorDimBackground}
                skin={activeSkin}
                playfieldScale={editorPlayfieldScale}
                longNoteBodyScale={appSettings.longNoteBodyScale}
                smoothScrolling={appSettings.smoothScrolling}
                showTimingLines={appSettings.showTimingLines}
                upscroll={appSettings.upscroll}
                zenMode={zenMode || playtest.active}
                onPlaceNote={placeNote}
                onDeleteNote={deleteNote}
                onAddNotes={addNotes}
                onDeleteNotes={deleteNotes}
                onMoveNotes={moveNotes}
                onView={setView}
                onSeek={audio.seek}
                onVolumeChange={(delta) => audio.setVolume(audio.volume + delta)}
                currentHitSound={currentHitSound}
                currentSampleSet={currentSampleSet}
                onCurrentHitSound={setCurrentHitSound}
                onCurrentSampleSet={setCurrentSampleSet}
                hitsoundSources={hitsoundSources}
                onCopyHitsounds={applyCopyHitsounds}
                onPublishPattern={authUser ? handlePublishPattern : undefined}
                pendingClip={presetToCopy}
                readOnly={!canEdit}
                playtestMode={playtest.active}
                heldLnIdsRef={playtestHeldLnRef}
                consumedIdsRef={playtestConsumedRef}
                pressedColumnsRef={playtestPressedColumnsRef}
                hitPositionOffset={playtestSettings.hitPositionOffset}
                waveformOverlay={appSettings.showWaveform ? waveform : null}
                onToggleWaveformOverlay={() =>
                  setAppSettings((s) => ({
                    ...s,
                    showWaveform: !s.showWaveform,
                  }))
                }
                missWindowMs={playtestWindows.miss}
                hideHints={playtest.active}
              />
            ) : (
              <EmptyState onEnter={() => setModal("welcome")} />
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
                    <ManiaEditor
                      notes={referenceDiff.notes}
                      keyCount={referenceDiff.keyCount}
                      timingPoints={referenceTimingPoints}
                      previewTime={referenceDiff.previewTime}
                      view={view}
                      currentTime={audio.currentTime}
                      getCurrentTime={getCurrentTime}
                      isPlaying={audio.isPlaying}
                      backgroundUrl={null}
                      videoUrl={null}
                      dimBackground={appSettings.dimBackground}
                      skin={referenceSkin}
                      playfieldScale={appSettings.playfieldScale}
                      longNoteBodyScale={appSettings.longNoteBodyScale}
                      smoothScrolling={appSettings.smoothScrolling}
                      showTimingLines={appSettings.showTimingLines}
                      upscroll={appSettings.upscroll}
                      zenMode={zenMode}
                      onPlaceNote={noop}
                      onDeleteNote={noop}
                      onAddNotes={noop}
                      onDeleteNotes={noop}
                      onMoveNotes={noop}
                      onView={noop}
                      onSeek={noop}
                      onVolumeChange={noop}
                      currentHitSound={0}
                      currentSampleSet={0}
                      onCurrentHitSound={noop}
                      onCurrentSampleSet={noop}
                      readOnly
                      hideHints
                    />
                  </div>
                  <div className="absolute left-2 top-2 z-20 rounded border border-white/10 bg-ink-900/65 px-2 py-0.5 text-[11px] font-medium text-slate-200 shadow backdrop-blur-xl">
                    Reference · {referenceDiff.name} ({referenceDiff.keyCount}K)
                  </div>
                </>
              )}
            </div>
            </div>
            {hasProject && (
              <PlaytestOverlay
                state={playtest}
                ended={playtest.ended}
                paused={playtest.paused}
                settings={playtestSettings}
                windows={playtestWindows}
                currentTimeMs={audio.currentTime}
                skin={skin}
                keyCount={active.keyCount}
                heldCodes={heldPlaytestKeys}
                onContinue={resumePlaytest}
                onRetry={restartPlaytest}
                onReturn={exitPlaytest}
              />
            )}
            {audioFile && hasProject && !zenMode && !playtest.active && (
              <PPCounter
                notes={active.notes}
                keyCount={active.keyCount}
                playbackRate={audio.playbackRate}
                onPlaybackRateChange={audio.setPlaybackRate}
              />
            )}
            {!playtest.active && (
              <button
                type="button"
                onClick={() => setModal("info")}
                className="absolute bottom-3 left-3 z-30 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-ink-900/62 font-serif text-lg font-semibold text-slate-100 shadow-xl shadow-black/25 backdrop-blur-xl transition hover:border-slate-500/80 hover:bg-white/10"
                aria-label="Open shortcuts and functions"
                title="Shortcuts and functions"
              >
                i
              </button>
            )}
            {hasProject && !zenMode && !playtest.active && eligibleRefs.length > 0 && (
              <div className="absolute left-3 top-14 z-30 rounded-lg border border-white/10 bg-ink-900/62 shadow-xl shadow-black/20 backdrop-blur-xl">
                <Menu
                  label={
                    referenceDiff ? `Ref: ${referenceDiff.name}` : "Reference"
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
                            label: "Turn off reference",
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
                onSeek={audio.seek}
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
                      })),
                  )
                }
              />
            )}
          </div>

          <div
            className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${
              showChrome
                ? "max-h-24 translate-y-0 opacity-100"
                : "pointer-events-none max-h-0 translate-y-4 opacity-0"
            }`}
            aria-hidden={!showChrome}
          >
            <BottomTimeline
              waveform={waveform}
              notes={active.notes}
              timingPoints={activeTimingPoints}
              previewTime={active.previewTime}
              duration={audio.duration}
              currentTime={audio.currentTime}
              getCurrentTime={getCurrentTime}
              onSeek={audio.seek}
              sensitivity={appSettings.waveformSensitivity}
              onSensitivity={(v) =>
                setAppSettings((s) => ({ ...s, waveformSensitivity: v }))
              }
              revealWaveform={hasProject}
              peers={collab.peers}
              comments={commentMarkers}
              onCommentClick={(ms) => {
                audio.seek(ms);
                setCommentsOpen(true);
              }}
              bookmarks={active.bookmarks}
              onSetPreviewPoint={canEdit ? setPreviewPoint : undefined}
              onAddBookmark={canEdit ? addBookmark : undefined}
              onRemoveBookmark={canEdit ? removeBookmark : undefined}
              trimStart={active.trimStartMs}
              trimEnd={active.trimEndMs}
              fadeIn={active.fadeInMs}
              fadeOut={active.fadeOutMs}
              onSetTrimStart={canEdit ? setTrimStart : undefined}
              onSetTrimEnd={canEdit ? setTrimEnd : undefined}
              onSetFadeIn={canEdit ? setFadeIn : undefined}
              onSetFadeOut={canEdit ? setFadeOut : undefined}
            />
          </div>
        </main>
      </div>

      </div>

      <WelcomeModal
        open={modal === "welcome"}
        onClose={close}
        onNewMap={() => handleNew(hasProjectContent)}
        onTryMaps={() => setModal("sampleMaps")}
        onImportSmPack={onImportSmPack}
        onPackCreator={() => {
          setModal(null);
          setPackCreatorOpen(true);
        }}
        onOpenLocalProject={(id) => void loadLocalProject(id)}
        onOpenCloudProject={(id) => void loadCloudProject(id)}
      />
      <PackCreator
        jpegQuality={
          appSettings.exportPngBackgroundsAsJpeg
            ? appSettings.exportJpegQuality
            : undefined
        }
        open={packCreatorOpen}
        onClose={() => {
          setPackCreatorOpen(false);
          if (!hasProject) setModal("welcome");
        }}
      />
      <SampleMapsModal
        open={modal === "sampleMaps"}
        onClose={close}
        onBack={() => setModal("welcome")}
        onSelect={loadSampleMap}
      />
      <MyMapsModal
        open={modal === "myMaps"}
        onClose={close}
        onSelect={(id) => void loadCloudProject(id)}
      />
      <PresetBrowserModal
        open={modal === "presets"}
        onClose={close}
        activeKeyCount={active.keyCount}
        onCopy={copyPresetToClipboard}
      />
      <PublishPresetModal
        open={modal === "publishPreset"}
        onClose={close}
        pattern={publishPattern}
        keyCount={publishKeyCount}
      />
      <FeedbackModal open={modal === "feedback"} onClose={close} />
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
        onImportSm={requestImportSm}
        onImportSmPack={onImportSmPack}
        activeDiff={active}
        onSmMeta={(sm) => patchDifficulty(active.id, { smMeta: sm })}
      />
      <AppSettingsModal
        open={modal === "settings"}
        onClose={close}
        playfieldScale={appSettings.playfieldScale}
        onPlayfieldScale={(v) =>
          setAppSettings((s) => ({ ...s, playfieldScale: v }))
        }
        longNoteBodyScale={appSettings.longNoteBodyScale}
        onLongNoteBodyScale={(v) =>
          setAppSettings((s) => ({ ...s, longNoteBodyScale: v }))
        }
        hitsoundsEnabled={appSettings.hitsoundsEnabled}
        onHitsoundsEnabled={(v) =>
          setAppSettings((s) => ({ ...s, hitsoundsEnabled: v }))
        }
        hitsoundVolume={appSettings.hitsoundVolume}
        onHitsoundVolume={(v) =>
          setAppSettings((s) => ({ ...s, hitsoundVolume: v }))
        }
        dimBackground={appSettings.dimBackground}
        onDimBackground={(v) =>
          setAppSettings((s) => ({ ...s, dimBackground: v }))
        }
        smoothScrolling={appSettings.smoothScrolling}
        onSmoothScrolling={(v) =>
          setAppSettings((s) => ({ ...s, smoothScrolling: v }))
        }
        showWaveform={appSettings.showWaveform}
        onShowWaveform={(v) =>
          setAppSettings((s) => ({ ...s, showWaveform: v }))
        }
        showTimingLines={appSettings.showTimingLines}
        onShowTimingLines={(v) =>
          setAppSettings((s) => ({ ...s, showTimingLines: v }))
        }
        upscroll={appSettings.upscroll}
        onUpscroll={(v) => setAppSettings((s) => ({ ...s, upscroll: v }))}
        playtest={appSettings.playtest}
        onPlaytest={(v) => setAppSettings((s) => ({ ...s, playtest: v }))}
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
        uiSoundsEnabled={appSettings.uiSoundsEnabled}
        onUiSoundsEnabled={(v) =>
          setAppSettings((s) => ({ ...s, uiSoundsEnabled: v }))
        }
        uiSoundVolume={appSettings.uiSoundVolume}
        onUiSoundVolume={(v) =>
          setAppSettings((s) => ({ ...s, uiSoundVolume: v }))
        }
      />
      <SkinModal
        open={modal === "skin"}
        onClose={close}
        skin={skin}
        hitsoundSource={hitsoundSkinSource}
        hitsoundSkin={hitsoundSkin}
        savedSkins={skinLibrary}
        activeKeyCount={active.keyCount}
        onApplyPreset={onApplyPresetSkin}
        onApplySavedSkin={onApplyLocalSkin}
        onSkinFile={onSkinFile}
        onClearSkin={onClearSkin}
        onUseDefaultHitsounds={onUseDefaultHitsounds}
        onUseVisualHitsounds={onUseVisualHitsounds}
        error={skinError}
      />
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
        trimActive={cropInfo.trimActive}
        cropRemoveCount={cropInfo.remove}
        cropClampCount={cropInfo.clamp}
        onCropToBrackets={applyCropToBrackets}
      />
      <AutoTimePrompt
        open={autoTimeOpen}
        status={autoTimeStatus}
        ready={!!waveform?.buffer}
        fileName={audioFile?.name ?? null}
        result={autoTimeResult}
        onRun={runAutoTime}
        onDismiss={() => setAutoTimeOpen(false)}
      />
      <TimingModal
        open={modal === "timing"}
        onClose={close}
        timingPoints={activeTimingPoints}
        onTimingPoints={applyTimingPoints}
        isPlaying={audio.isPlaying}
        playbackRate={audio.playbackRate}
        getCurrentTime={getCurrentTime}
        onToggle={audio.toggle}
        onSetPlaybackRate={audio.setPlaybackRate}
        audioBuffer={waveform?.buffer ?? null}
        timeScale={activeRate}
      />
      <DifficultyModal
        open={modal === "difficulty"}
        onClose={close}
        difficulty={active}
        onDifficulty={(d) => patchDifficulty(active.id, d)}
      />
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
        title="Import new map?"
        footer={
          <>
            <Button onClick={cancelPendingImport} disabled={importingMap || exporting}>
              Cancel
            </Button>
            <Button
              onClick={confirmImportWithoutExport}
              disabled={importingMap || exporting}
            >
              Don't save and import new
            </Button>
            <Button
              variant="accent"
              onClick={() => void confirmExportAndImport()}
              disabled={importingMap || exporting || !canExport}
            >
              Export current project and import new
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            You are about to replace the current project with{" "}
            <span className="font-medium text-slate-100">
              {pendingImport?.name}
            </span>
            .
          </p>
          <p className="text-xs text-slate-500">
            Export current project downloads an .osz first. Don't save imports
            the new map and clears the old local save. Cancel stops the import.
          </p>
        </div>
      </Modal>

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

      <AiModModal
        open={modal === "aimod"}
        onClose={close}
        report={aiModReport}
        activeDiffName={active.name || "(unnamed)"}
        onRefresh={runAiModCheck}
        onJump={handleAiModJump}
        unsnappedCount={aiModUnsnapped}
        onResnap={handleResnap}
      />

      <InfoModal open={modal === "info"} onClose={close} />

      <AdminPanel
        open={modal === "admin"}
        onClose={close}
        invisible={invisibleMode}
        onToggleInvisible={toggleInvisibleMode}
      />

      <ShareModal
        open={modal === "share"}
        onClose={close}
        projectId={cloudProjectId}
      />

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

      {peerNotice && (
        <div
          key={peerNotice.key}
          className="toast-in fixed left-1/2 top-16 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-ink-800/90 py-1.5 pl-1.5 pr-4 text-sm text-slate-100 shadow-2xl backdrop-blur-2xl"
        >
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-ink-700/70 text-[10px] font-semibold">
            {peerNotice.avatar ? (
              <img
                src={peerNotice.avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              "👤"
            )}
          </span>
          {peerNotice.text}
        </div>
      )}

      {(saveStatus === "saved" || saveStatus === "error") && (
        <div
          className={`toast-in fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
            saveStatus === "saved"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : "border-red-500/40 bg-red-950/90 text-red-200"
          }`}
        >
          {saveStatus === "saved"
            ? "Progress saved locally"
            : saveErrorDetail
              ? `Couldn't save progress (${saveErrorDetail})`
              : "Couldn't save progress"}
        </div>
      )}

      {(cloudSaveStatus === "saving" || exporting) && (
        <div className="toast-in fixed bottom-28 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-lg border border-white/10 bg-ink-800/95 px-4 py-2 text-sm text-slate-200 shadow-lg backdrop-blur-xl">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-accent" />
          {cloudSaveStatus === "saving"
            ? "Saving to your account…"
            : "Exporting map…"}
        </div>
      )}

      {(cloudSaveStatus === "saved" || cloudSaveStatus === "error") && (
        <div
          className={`toast-in fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
            cloudSaveStatus === "saved"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : "border-red-500/40 bg-red-950/90 text-red-200"
          }`}
        >
          {cloudSaveStatus === "saved"
            ? "Saved to your account"
            : cloudError ?? "Couldn't save to your account"}
        </div>
      )}

      {cloudError && cloudSaveStatus !== "error" && (
        <div className="toast-in fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-lg">
          {cloudError}
          <button
            onClick={() => setCloudError(null)}
            className="ml-3 text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {importError && (
        <div className="toast-in fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-lg">
          {importError}
          <button
            onClick={() => setImportError(null)}
            className="ml-3 text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      <InviteNotifications
        notices={invites}
        onJoin={joinInvite}
        onIgnore={ignoreInvite}
      />

      <Modal
        open={showHomeConfirm}
        onClose={() => setShowHomeConfirm(false)}
        title="Return to home screen?"
        footer={
          <>
            <Button onClick={() => setShowHomeConfirm(false)}>Cancel</Button>
            <Button
              variant="accent"
              onClick={() => {
                setShowHomeConfirm(false);
                document.body.classList.add('fade-out');
                setTimeout(() => window.location.reload(), 120);
              }}
            >
              Return to home
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          This will open the home screen. Your current project stays in the
          editor, and you can come back to it at any time.
        </p>
      </Modal>

      <Modal
        open={pendingDeleteDiffId !== null}
        onClose={() => setPendingDeleteDiffId(null)}
        title="Delete difficulty?"
        footer={
          <>
            <Button onClick={() => setPendingDeleteDiffId(null)}>Cancel</Button>
            <Button
              variant="accent"
              onClick={() => {
                if (pendingDeleteDiffId) deleteDifficulty(pendingDeleteDiffId);
                setPendingDeleteDiffId(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          {(() => {
            const d = difficulties.find((x) => x.id === pendingDeleteDiffId);
            const name = d?.name?.trim() || "This difficulty";
            return `“${name}” and all its notes will be removed. This can't be undone.`;
          })()}
        </p>
      </Modal>
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
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
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
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid h-8 w-8 place-items-center rounded-md text-base text-slate-300 transition hover:bg-white/10 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function InfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shortcuts and functions"
      width="max-w-3xl"
    >
      <div className="grid gap-5 text-sm text-slate-300 md:grid-cols-2">
        <InfoSection title="Playback">
          <InfoRow keys="Space" text="Play or pause the song." />
          <InfoRow keys="Hold S" text="Ease playback to 25%; release for 100%." />
          <InfoRow keys="Tab" text="Toggle zen mode and hide editor chrome." />
          <InfoRow keys="Arrow Up / Down" text="Raise or lower volume by 5%." />
          <InfoRow keys="Alt + wheel" text="Change volume over the notefield." />
          <InfoRow keys="Speed buttons" text="Set playback rate to 25%, 50%, 75% or 100%." />
        </InfoSection>

        <InfoSection title="Editing">
          <InfoRow keys="Left click" text="Place a snapped note in an empty lane." />
          <InfoRow keys="Left drag" text="Create a long note from the drag range." />
          <InfoRow keys="Click note" text="Select a placed note." />
          <InfoRow keys="Ctrl/Cmd + click" text="Toggle notes in the selection." />
          <InfoRow keys="Drag selected" text="Move selected notes by lane and snap time." />
          <InfoRow keys="Right click note" text="Delete that note, or the selected notes." />
        </InfoSection>

        <InfoSection title="Selection">
          <InfoRow keys="Shift + drag" text="Box select notes. Near edges, the notefield autoscrolls." />
          <InfoRow keys="Ctrl/Cmd + A" text="Select all notes in the active difficulty." />
          <InfoRow keys="Ctrl/Cmd + C" text="Copy selected notes." />
          <InfoRow keys="Ctrl/Cmd + X" text="Cut selected notes." />
          <InfoRow keys="Ctrl/Cmd + V" text="Paste copied notes at the snapped playhead time." />
          <InfoRow keys="M" text="Mirror selected notes left↔right (flip columns)." />
          <InfoRow keys="Delete / Backspace" text="Delete selected notes." />
        </InfoSection>

        <InfoSection title="Navigation">
          <InfoRow keys="Wheel" text="Scrub the playhead by one snap step in the notefield." />
          <InfoRow keys="Ctrl/Cmd + wheel" text="Change snap divisor without zooming the page." />
          <InfoRow keys="Bottom timeline click/drag" text="Seek through the song." />
          <InfoRow keys="Timeline wheel" text="Adjust waveform sensitivity." />
          <InfoRow keys="Timestamp" text="Click the time display to copy the current timestamp." />
        </InfoSection>

        <InfoSection title="Grid and display">
          <InfoRow keys="Snap" text="Choose the grid divisor from 1/1 through 1/16." />
          <InfoRow keys="F3 / F4" text="Decrease or increase visual note scroll speed." />
          <InfoRow keys="Scroll speed" text="Change visual note scroll speed. This is not exported." />
          <InfoRow keys="R" text="Toggle receptors on or off." />
          <InfoRow keys="W" text="Toggle the waveform overlay on the hit lane (outside hitsound mode)." />
          <InfoRow keys="PP counter" text="Shows max SS no-mod pp for the active difficulty." />
          <InfoRow keys="Kiai" text="Kiai timing sections tint notes during preview." />
        </InfoSection>

        <InfoSection title="Hitsounds">
          <InfoRow keys="H" text="Toggle hitsound mode: shows the toolbar and per-note letters." />
          <InfoRow keys="W / F / C" text="In hitsound mode, add whistle / finish / clap to the selection." />
          <InfoRow keys="Sample set" text="Pick Auto, Normal, Soft or Drum for selected or new notes." />
          <InfoRow keys="W F C labels" text="Letters on a note show its applied additions." />
          <InfoRow keys="Playback" text="The map's hitsounds always play, even outside hitsound mode." />
        </InfoSection>

        <InfoSection title="Project">
          <InfoRow keys="Ctrl/Cmd + S" text="Save progress locally." />
          <InfoRow keys="Ctrl/Cmd + Z" text="Undo beatmap edits." />
          <InfoRow keys="Ctrl/Cmd + Shift + Z" text="Redo beatmap edits." />
          <InfoRow keys="Ctrl/Cmd + Y" text="Redo on Windows-style shortcuts." />
          <InfoRow keys="New" text="Clear the current map and local project." />
          <InfoRow keys="Export" text="Export the active .osu or package the mapset as .osz." />
        </InfoSection>

        <InfoSection title="Menus">
          <InfoRow keys="Map Settings" text="Import .osz, set audio, background and metadata." />
          <InfoRow keys="Timing" text="Edit red BPM points, green SV points, kiai, volume and tap BPM." />
          <InfoRow keys="Difficulty" text="Set name, key count, HP and OD for the active difficulty." />
          <InfoRow keys="Tools" text="Apply Full LN or convert holds back to rice notes." />
          <InfoRow keys="Skin" text="Apply presets, upload .osk skins or clear the current skin." />
          <InfoRow keys="Settings" text="Adjust playfield scale, long-note body width and hitsound playback / volume." />
        </InfoSection>

        <InfoSection title="Difficulty list">
          <InfoRow keys="Click difficulty" text="Switch the active difficulty." />
          <InfoRow keys="+" text="Add a new difficulty." />
          <InfoRow keys="Duplicate" text="Copy a difficulty with its notes and timing." />
          <InfoRow keys="Delete" text="Remove a difficulty when more than one exists." />
        </InfoSection>
      </div>
    </Modal>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-ink-600 bg-ink-700/35 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function InfoRow({ keys, text }: { keys: string; text: string }) {
  return (
    <div className="grid grid-cols-[8.5rem,1fr] gap-3 text-xs leading-5">
      <div className="font-mono text-[11px] font-semibold text-slate-100">
        {keys}
      </div>
      <div className="text-slate-400">{text}</div>
    </div>
  );
}

function EmptyState({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="relative grid min-h-full place-items-center text-center">
        <div className="max-w-sm">
          <img
            src={`${import.meta.env.BASE_URL}logo.png?v=2`}
            alt="Cascade"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="mx-auto mb-4 h-24 w-24 select-none rounded-2xl object-cover"
          />
          <h2 className="mb-1 text-lg font-semibold text-slate-200">
            Drop audio anywhere to start mapping
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Or press Enter and pick a sample map.{" "}
            <kbd className="rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-slate-300">
              Space
            </kbd>{" "}
            plays, clicks place notes.
          </p>
          <Button variant="accent" onClick={onEnter}>
            Enter
          </Button>
          <p className="mt-6 text-[11px] font-medium tracking-wide text-slate-600">
            Cascade · v{__APP_VERSION__}
          </p>
        </div>
        <div className="absolute bottom-4 left-1/2 flex w-max -translate-x-1/2 flex-col items-center gap-1 text-xs text-slate-500">
          <p>
            Made by{" "}
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
            Contributors:{" "}
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
            href="https://buymeacoffee.com/sheepex_"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-400 transition hover:text-accent"
          >
            buy me a coffee :)
          </a>
        </div>
      </div>

      <section className="mx-auto max-w-2xl px-5 pb-14 pt-10 text-left text-sm leading-relaxed text-slate-400">
        <h1 className="mb-3 text-xl font-bold text-slate-200">
          Free Online osu!mania Editor &amp; Map Viewer
        </h1>
        <p className="mb-2">
          <strong className="font-semibold text-slate-300">Cascade</strong> is a
          browser-based <strong className="font-semibold text-slate-300">osu!mania</strong>{" "}
          beatmap editor, StepMania editor, Etterna editor, and VSRG map viewer.
          Import <code className="text-slate-300">.osz</code> /{" "}
          <code className="text-slate-300">.osu</code> files, convert osu to
          Etterna or StepMania, chart notes on a vertical scrolling playfield,
          set timing, hear real osu! hitsounds, collaborate in realtime, and
          export a ready-to-play <code className="text-slate-300">.osu</code>,{" "}
          <code className="text-slate-300">.osz</code>, or{" "}
          <code className="text-slate-300">.sm</code> map. No download, no
          install.
        </p>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          What you can do
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Edit osu!mania beatmaps online (1K to 18K), with rice notes and long notes</li>
          <li>Edit StepMania and Etterna charts in a browser-based ArrowVortex-style workflow</li>
          <li>Preview and view osu!mania maps right in the browser</li>
          <li>
            Import <code className="text-slate-300">.osz</code> /{" "}
            <code className="text-slate-300">.osu</code>, export{" "}
            <code className="text-slate-300">.osu</code>,{" "}
            <code className="text-slate-300">.osz</code>, or{" "}
            <code className="text-slate-300">.sm</code>
          </li>
          <li>Convert osu!mania maps to Etterna or StepMania-compatible .sm files</li>
          <li>Combine multiple maps into one .osz song pack with the Pack Creator</li>
          <li>Set BPM and timing with tap tempo and a metronome</li>
          <li>Set a background image or a muted background video, like ranked osu! maps</li>
          <li>Real osu! hitsounds and <code className="text-slate-300">.osk</code> skin support</li>
          <li>Realtime collaborative mapping with live comments</li>
        </ul>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          osu!mania editor FAQ
        </h2>
        <dl>
          <dt className="mt-3 font-semibold text-slate-300">Is Cascade free to use?</dt>
          <dd>Yes. Cascade is a free online osu!mania editor that runs entirely in your web browser.</dd>
          <dt className="mt-3 font-semibold text-slate-300">Do I need to install anything?</dt>
          <dd>No. It is a web app: open it in any modern browser and start mapping immediately.</dd>
          <dt className="mt-3 font-semibold text-slate-300">Can I import my existing osu!mania beatmaps?</dt>
          <dd>
            Yes. Drag an <code className="text-slate-300">.osz</code> or{" "}
            <code className="text-slate-300">.osu</code> file onto the page to
            edit an existing map, then export it back out or convert osu to
            Etterna / StepMania.
          </dd>
          <dt className="mt-3 font-semibold text-slate-300">Is this a VSRG editor?</dt>
          <dd>
            Yes. Cascade charts on a standard vertical-scrolling rhythm-game
            (VSRG) playfield and exports osu!mania .osu / .osz files plus
            StepMania and Etterna .sm charts.
          </dd>
          <dt className="mt-3 font-semibold text-slate-300">Is Cascade like ArrowVortex?</dt>
          <dd>
            Cascade covers similar mania chart editing and conversion workflows
            in the browser, including osu!mania, StepMania, and Etterna formats.
          </dd>
          <dt className="mt-3 font-semibold text-slate-300">
            Can I combine multiple maps into one .osz pack?
          </dt>
          <dd>
            Yes. The Pack Creator on the start menu merges several beatmaps
            into a single .osz song pack with shared metadata, mapper credits,
            and generated difficulty names, for local play.
          </dd>
        </dl>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Guides
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a href="/how-to-make-an-osu-mania-map" className="text-slate-300 underline-offset-2 transition hover:text-accent hover:underline">
              How to make an osu!mania map online
            </a>
          </li>
          <li>
            <a href="/osu-to-stepmania" className="text-slate-300 underline-offset-2 transition hover:text-accent hover:underline">
              Convert osu!mania maps to StepMania / Etterna (.osz to .sm)
            </a>
          </li>
          <li>
            <a href="/osu-mania-map-viewer" className="text-slate-300 underline-offset-2 transition hover:text-accent hover:underline">
              Preview osu!mania maps online
            </a>
          </li>
          <li>
            <a href="/osu-mania-pack-creator" className="text-slate-300 underline-offset-2 transition hover:text-accent hover:underline">
              Combine multiple maps into one .osz pack
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
