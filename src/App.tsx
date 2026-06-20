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
import {
  WelcomeModal,
  SampleMapsModal,
  type SampleMap,
} from "./components/menus/StartModal";
import { MyMapsModal } from "./components/menus/MyMapsModal";
import { PresetBrowserModal } from "./components/menus/PresetBrowserModal";
import { PublishPresetModal } from "./components/menus/PublishPresetModal";
import { ShareModal } from "./components/menus/ShareModal";
import { CommentsSidebar } from "./components/CommentsSidebar";
import type { Comment } from "./lib/comments";
import {
  saveProjectCloud,
  loadProjectCloud,
} from "./lib/cloud";
import type { PatternNote } from "./lib/patterns";
import { computeStarRating } from "./lib/starRating";
import { supabase, getSupabaseToken } from "./lib/supabase";
import { useCollab } from "./hooks/useCollab";
import { applyNoteOp, invertNoteOp, type NoteOp, type DocState } from "./lib/ops";
import { myAccess, type AccessRole } from "./lib/collab";
import { validateProject, type ValidationResult } from "./lib/validation";
import { Button } from "./components/ui/Controls";
import { Menu } from "./components/ui/Menu";
import { Modal } from "./components/ui/Modal";
import { AccountControl } from "./components/auth/LoginButton";
import { AdminPanel } from "./components/admin/AdminPanel";
import { useAuth } from "./lib/auth";
import { useAudio } from "./hooks/useAudio";
import { useWaveform } from "./hooks/useWaveform";
import { useHitsounds } from "./hooks/useHitsounds";
import { fullLongNotes, fullRiceNotes } from "./lib/noteTools";
import { downloadOsu } from "./lib/osuExport";
import { downloadOsz } from "./lib/oszExport";
import { importOsz } from "./lib/osuImport";
import { importOsk } from "./lib/skinImport";
import {
  loadProject,
  saveProject,
  clearProject,
  savePreferences,
  loadPreferences,
  saveSkinBlob,
  loadSkinBlob,
  saveVolume,
  loadVolume,
  saveViewPreferences,
  loadViewPreferences,
} from "./lib/persistence";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SONG_META,
  DEFAULT_VIEW,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  defaultTimingPoints,
  makeDifficulty,
  normalizeTimingPoints,
  uid,
  type AppSettings,
  type BackgroundScope,
  type Difficulty,
  type LoadedFile,
  type LoadedSkin,
  type ManiaNote,
  type SongMeta,
  type TimingPoint,
  type ViewState,
} from "./types";

type ModalId =
  | "welcome"
  | "sampleMaps"
  | "mapSettings"
  | "settings"
  | "skin"
  | "timing"
  | "difficulty"
  | "tools"
  | "info"
  | "myMaps"
  | "presets"
  | "publishPreset"
  | "admin"
  | "share"
  | null;

/** Snapshot of the undoable beatmap document. */
type DocSnapshot = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

/** Decode a JWT's payload (claims) without verifying — for client diagnostics. */
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

  // Every audio file in the set, keyed by filename. A difficulty references
  // its song by name; the active difficulty's audio is derived below.
  const [audioFiles, setAudioFiles] = useState<Record<string, LoadedFile>>({});
  const [bgFiles, setBgFiles] = useState<Record<string, LoadedFile>>({});
  const [pendingBgName, setPendingBgName] = useState<string | null>(null);
  const [skin, setSkin] = useState<LoadedSkin | null>(null);
  const [skinError, setSkinError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [modal, setModal] = useState<ModalId>(null);
  const [projectStarted, setProjectStarted] = useState(false);
  // Zen mode (toggled with Tab): slide all chrome out and show only the
  // notefield.
  const [zenMode, setZenMode] = useState(false);
  // Site-level preferences load from localStorage immediately (synchronous) so
  // they apply on first paint and are independent of any loaded map.
  const [appSettings, setAppSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_APP_SETTINGS,
    ...(loadPreferences() ?? {}),
  }));
  const [bgScope, setBgScope] = useState<BackgroundScope>("mapset");
  const [askBgScope, setAskBgScope] = useState(false);
  const [lnTicks, setLnTicks] = useState(1);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importingMap, setImportingMap] = useState(false);
  // Hitsound applied to newly placed notes (additions bitmask + normal set).
  const [currentHitSound, setCurrentHitSound] = useState(0);
  const [currentSampleSet, setCurrentSampleSet] = useState(0);
  const [saveStatus, setSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [exportCheck, setExportCheck] = useState<{
    result: ValidationResult;
    target: string;
    run: () => void;
  } | null>(null);
  // Cloud (account) project: the id of the row this session is bound to (null =
  // not yet saved to the cloud), plus a separate save indicator and error.
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  // Owner of the currently-bound cloud project (for the owner-only Share UI).
  const [cloudOwnerId, setCloudOwnerId] = useState<string | null>(null);
  const [cloudSaveStatus, setCloudSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  // Pattern pending publication as a preset (from the editor's clipboard panel).
  const [publishPattern, setPublishPattern] = useState<PatternNote[] | null>(
    null,
  );
  const [publishKeyCount, setPublishKeyCount] = useState(4);
  // A preset pattern handed to the editor to load into its clipboard. The id
  // changes each copy so the editor re-loads even for the same pattern.
  const [presetToCopy, setPresetToCopy] = useState<{
    id: string;
    pattern: PatternNote[];
  } | null>(null);
  const importStartedRef = useRef(false);

  // ---- Co-op (realtime) state --------------------------------------------
  // The signed-in user's role on the open cloud project ('owner'|'editor'|
  // 'viewer'|null). Drives edit permission while in a shared session.
  const [myRole, setMyRole] = useState<AccessRole>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Reference mode: id of a second difficulty shown side-by-side (read-only).
  const [referenceId, setReferenceId] = useState<string | null>(null);
  // Top-level comments, for the bottom-timeline markers (+ hover tooltips).
  const [commentMarkers, setCommentMarkers] = useState<
    { time_ms: number; resolved: boolean; body: string; author: string }[]
  >([]);
  // Transient toast announcing a collaborator joining/leaving the session.
  const [peerNotice, setPeerNotice] = useState<{
    key: number;
    text: string;
    avatar: string | null;
  } | null>(null);
  const peerNoticeTimer = useRef<number | undefined>(undefined);
  const active =
    difficulties.find((d) => d.id === activeId) ?? difficulties[0];

  // Latest-value refs so collab callbacks/getDoc read fresh state without
  // re-subscribing the channel.
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

  // A live session is active whenever a cloud project is open and we're signed
  // in (even solo — it enables the join handoff when someone arrives).
  const liveEnabled = !!cloudProjectId && !!authUser;
  // Whether the current user may edit (local maps + owner/editor; viewers not).
  const canEdit = !cloudProjectId || myRole === "owner" || myRole === "editor";
  const sessionActiveRef = useRef(false);
  sessionActiveRef.current = liveEnabled;
  const canEditRef = useRef(true);
  canEditRef.current = canEdit;

  // Op-based personal undo/redo (used only while a session is active); plain
  // single-user editing keeps the snapshot history further below.
  const applyingRemoteRef = useRef(false);
  const opUndoRef = useRef<NoteOp[]>([]);
  const opRedoRef = useRef<NoteOp[]>([]);
  const pendingDocSyncRef = useRef(false);
  const collabRef = useRef<ReturnType<typeof useCollab> | null>(null);
  // Playhead position to restore once audio is ready (reload-resume).
  const pendingSeekRef = useRef<number | null>(null);

  // Live role updates: if the owner changes our role or removes us mid-session,
  // re-resolve access so the UI relocks (or unlocks) without a reload.
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

  // Apply edits arriving from collaborators (never re-broadcast / re-record).
  const applyRemoteOp = useCallback((op: NoteOp) => {
    applyingRemoteRef.current = true;
    setDifficulties((prev) => applyNoteOp(prev, op));
  }, []);
  const applyRemoteDoc = useCallback((doc: DocState) => {
    applyingRemoteRef.current = true;
    setMeta(doc.meta);
    setTimingPoints(doc.timingPoints);
    setDifficulties(doc.difficulties);
  }, []);

  // Show a transient toast when a collaborator joins/leaves.
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
    me: authUser
      ? { id: authUser.id, username: authUser.username, avatar: authUser.avatar_url }
      : null,
    onRemoteOp: applyRemoteOp,
    onRemoteDoc: applyRemoteDoc,
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
    getDoc: () => ({
      meta: metaRef.current,
      timingPoints: timingPointsRef.current,
      difficulties: difficultiesRef.current,
    }),
  });
  collabRef.current = collab;

  // Apply + record a note op locally, and broadcast it during a live session.
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

  // Mark a structural change (meta/diff/timing) so the doc-sync effect
  // broadcasts the whole document to collaborators after it applies.
  const markStructural = useCallback(() => {
    if (sessionActiveRef.current) pendingDocSyncRef.current = true;
  }, []);

  // No-op handler set for the read-only reference editor.
  const noop = useCallback(() => {}, []);

  // Metadata edits from the map-settings panel (structural → doc-sync).
  const updateMeta = useCallback(
    (m: SongMeta) => {
      if (!canEditRef.current) return;
      markStructural();
      setMeta(m);
    },
    [markStructural],
  );

  // Presence: tell collaborators which difficulty this user is on.
  useEffect(() => {
    if (liveEnabled) collabRef.current?.updatePresence({ activeDiffId: activeId });
  }, [activeId, liveEnabled]);

  // The song for the active difficulty: its own audio, or the set's single
  // audio when this difficulty hasn't named one (manual uploads, legacy maps).
  const audioFile = useMemo<LoadedFile | null>(() => {
    const named = active.audioFilename ? audioFiles[active.audioFilename] : null;
    if (named) return named;
    const all = Object.values(audioFiles);
    return all.length === 1 ? all[0] : null;
  }, [active.audioFilename, audioFiles]);

  const waveform = useWaveform(audioFile?.blob ?? null);
  // The decoded waveform yields a sample-accurate duration AND the PCM buffer.
  // Feed both to the audio clock: the duration keeps the seek clamp / timeline
  // scale correct, and the buffer lets the song play through the Web Audio API
  // so it shares the hitsounds' near-zero latency (an HTMLAudioElement's output
  // lag otherwise makes the song drift seconds behind the falling notes).
  const audio = useAudio(
    audioFile?.url ?? null,
    waveform ? waveform.duration * 1000 : null,
    waveform?.buffer ?? null,
  );
  const modalAtmosphereOpen =
    (modal !== null && modal !== "timing") ||
    askBgScope ||
    pendingImport !== null ||
    exportCheck !== null;
  const modalAtmosphereActive = modalAtmosphereOpen && audio.isPlaying;

  // Play the map's actual osu! hitsounds as notes cross the judgement line.
  useHitsounds(
    audio.currentTime,
    audio.isPlaying,
    active.notes,
    active.timingPoints?.length ? active.timingPoints : timingPoints,
    appSettings.hitsoundVolume,
    appSettings.hitsoundsEnabled,
    modalAtmosphereActive,
  );

  // Presence: broadcast this user's playhead to collaborators (throttled).
  const currentTimeRef = useRef(0);
  currentTimeRef.current = audio.currentTime;
  useEffect(() => {
    if (!liveEnabled) return;
    const id = window.setInterval(() => {
      collabRef.current?.updatePresence({
        playheadMs: Math.round(currentTimeRef.current),
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [liveEnabled]);

  // Reload-resume: persist {activeId, playhead} per cloud project (debounced)…
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
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [cloudProjectId, activeId, audio.currentTime]);

  // …and apply a pending restored playhead once the audio duration is known.
  useEffect(() => {
    if (pendingSeekRef.current != null && audio.duration > 0) {
      audio.seek(Math.min(pendingSeekRef.current, audio.duration));
      pendingSeekRef.current = null;
    }
  }, [audio.duration, audio]);

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

  // Background for the active difficulty.
  const activeBg = active.backgroundFilename ? bgFiles[active.backgroundFilename] ?? null : null;

  const activeTimingPoints =
    active.timingPoints?.length ? active.timingPoints : timingPoints;
  const activeSkin = skin?.keymodes[active.keyCount] ?? null;

  // ---- Reference mode: view another difficulty (same audio) side by side ---
  // Only difficulties sharing the active one's MP3 can be referenced in sync,
  // sorted easiest → hardest by star rating (matching the difficulty sidebar).
  // Memoized: star rating is expensive, and this must NOT run on every frame
  // (the app re-renders each frame during playback).
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
    referenceId && referenceId !== active.id
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
    totalNotes > 0 ||
    meta.title !== DEFAULT_SONG_META.title ||
    meta.artist !== DEFAULT_SONG_META.artist ||
    meta.creator !== DEFAULT_SONG_META.creator ||
    timingPoints.length !== 1 ||
    timingPoints[0]?.bpm !== 120 ||
    !hasDefaultDifficulty;
  // Surrounding chrome is shown only with a project open and outside zen mode.
  const showChrome = hasProject && !zenMode;

  // ---- File handling -------------------------------------------------------
  const loadFile = (file: File): LoadedFile => ({
    name: file.name,
    url: URL.createObjectURL(file),
    blob: file,
  });

  const onAudioFile = useCallback(
    (file: File) => {
      const loaded = loadFile(file);
      setProjectStarted(true);
      setAudioFiles((prev) => {
        const existing = prev[loaded.name];
        if (existing) URL.revokeObjectURL(existing.url);
        return { ...prev, [loaded.name]: loaded };
      });
      // Assign to the active difficulty, plus any that haven't named a song
      // yet (so the common single-track workflow keeps "one song for all").
      setDifficulties((prev) =>
        prev.map((d) =>
          d.id === activeId || !d.audioFilename
            ? { ...d, audioFilename: loaded.name }
            : d,
        ),
      );
    },
    [activeId],
  );

  const onBackgroundFile = useCallback((file: File) => {
    const loaded = loadFile(file);
    setProjectStarted(true);
    setBgFiles((prev) => {
      if (prev[loaded.name]) URL.revokeObjectURL(prev[loaded.name].url);
      return { ...prev, [loaded.name]: loaded };
    });
    setPendingBgName(loaded.name);
    setAskBgScope(true);
  }, []);

  const onClearBackground = useCallback(() => {
    const bgName = active.backgroundFilename;
    if (!bgName) return;
    setDifficulties((prev) => {
      const updated = prev.map((d) =>
        (bgScope === "mapset" || d.id === activeId) && d.backgroundFilename === bgName
          ? { ...d, backgroundFilename: undefined }
          : d,
      );
      // If no diff references this file anymore, revoke + remove it.
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
  }, [active.backgroundFilename, activeId, bgScope]);

  // ---- Skin (.osk) ---------------------------------------------------------
  const loadSkin = useCallback(async (blob: Blob, fileName: string) => {
    setSkinError(null);
    try {
      const loaded = await importOsk(blob, fileName);
      setSkin((prev) => {
        if (prev) prev.objectUrls.forEach(URL.revokeObjectURL);
        return loaded;
      });
    } catch (err) {
      setSkinError(
        err instanceof Error ? err.message : "Failed to load skin (.osk).",
      );
    }
  }, []);

  const onSkinFile = useCallback(
    (file: File) => {
      void loadSkin(file, file.name);
    },
    [loadSkin],
  );

  /** Fetch a bundled preset `.osk` by URL and apply it. */
  const onApplyPresetSkin = useCallback(
    async (url: string, fileName: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Couldn't load that preset skin.");
        await loadSkin(await res.blob(), fileName);
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

  // ---- Import .osz ---------------------------------------------------------
  const importMapFile = useCallback(async (file: File) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    try {
      const map = await importOsz(file);
      // Importing a new map leaves any cloud/collab session.
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
      void clearProject().catch(() => {});
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

  // ---- Bundled "try these maps" -------------------------------------------
  const loadSampleMap = useCallback(
    async (map: SampleMap) => {
      // Close the gallery immediately so it never locks up while the (possibly
      // large) .osz downloads + imports — the editor shows its own import state.
      setModal(null);
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
      }
    },
    [importMapFile],
  );

  // ---- Difficulty management ----------------------------------------------
  // Difficulty / metadata / timing edits are infrequent; in a live session they
  // sync via a whole-document broadcast (markStructural → doc-sync effect).
  const patchDifficulty = useCallback(
    (id: string, patch: Partial<Difficulty>) => {
      if (!canEditRef.current) return;
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d;
          const next = { ...d, ...patch };
          // If key count shrank, drop notes in removed lanes.
          if (patch.keyCount !== undefined) {
            next.notes = next.notes.filter((n) => n.column < next.keyCount);
          }
          return next;
        }),
      );
    },
    [markStructural],
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
          timingPoints: src.timingPoints.map((p) => ({ ...p, id: uid("tp") })),
          notes: src.notes.map((n) => ({ ...n, id: uid("n") })),
        };
        return [...prev, copy];
      });
    },
    [markStructural],
  );

  const deleteDifficulty = useCallback(
    (id: string) => {
      if (!canEditRef.current) return;
      markStructural();
      setDifficulties((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((d) => d.id !== id);
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId, markStructural],
  );

  // ---- Note editing (on the active difficulty) ----------------------------
  // All note edits flow through commitNoteOp as granular, invertible ops so they
  // sync to collaborators and power personal undo. Reads use refs for freshness.
  const placeNote = useCallback(
    (note: ManiaNote) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const dup = target.notes.some(
        (n) =>
          n.column === note.column &&
          n.startTime === note.startTime &&
          n.endTime === undefined &&
          note.endTime === undefined,
      );
      if (dup) return;
      commitNoteOp({ t: "note.add", diffId: did, notes: [note] });
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

  /** Append several notes at once (used by paste). */
  const addNotes = useCallback(
    (notes: ManiaNote[]) => {
      if (!notes.length) return;
      commitNoteOp({ t: "note.add", diffId: activeIdRef.current, notes });
    },
    [commitNoteOp],
  );

  /** Delete several notes at once (used by multi-select delete / cut). */
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

  /** Full LN: convert every note in the active difficulty to a long note. */
  const applyFullLong = useCallback(
    (ticks: number) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const points = target.timingPoints?.length
        ? target.timingPoints
        : timingPointsRef.current;
      const after = fullLongNotes(target.notes, points, view.snapDivisor, ticks);
      commitNoteOp({
        t: "note.update",
        diffId: did,
        before: target.notes,
        after,
      });
    },
    [commitNoteOp, view.snapDivisor],
  );

  /** Full RC: convert every long note in the active difficulty to a rice note. */
  const applyFullRice = useCallback(() => {
    const did = activeIdRef.current;
    const target = difficultiesRef.current.find((d) => d.id === did);
    if (!target) return;
    commitNoteOp({
      t: "note.update",
      diffId: did,
      before: target.notes,
      after: fullRiceNotes(target.notes),
    });
  }, [commitNoteOp]);

  /** Replace several notes in place by id (used by drag-to-move). */
  const moveNotes = useCallback(
    (updated: ManiaNote[]) => {
      if (!updated.length) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const byId = new Map(updated.map((n) => [n.id, n]));
      const before = target.notes.filter((n) => byId.has(n.id));
      if (!before.length) return;
      commitNoteOp({ t: "note.update", diffId: did, before, after: updated });
    },
    [commitNoteOp],
  );

  // ---- Undo / redo --------------------------------------------------------
  // The undoable "document" is the map content: metadata, timing, and every
  // difficulty (notes included). Pure view/UI state (zoom, active diff, …) is
  // intentionally excluded so undo only ever touches the beatmap itself.
  const snapshot = useMemo<DocSnapshot>(
    () => ({ meta, timingPoints, difficulties }),
    [meta, timingPoints, difficulties],
  );
  const undoStackRef = useRef<DocSnapshot[]>([]);
  const redoStackRef = useRef<DocSnapshot[]>([]);
  const presentRef = useRef<DocSnapshot | null>(null);
  const applyingHistoryRef = useRef(false);
  const [, bumpHistory] = useState(0);

  // Record every real document change. Updates triggered by undo/redo set the
  // applying flag so they aren't recorded as fresh edits. During a live session
  // the op stacks handle undo instead, so we only track `present` (no recording)
  // — including for remote edits, which must never enter the snapshot history.
  useEffect(() => {
    if (presentRef.current === null) {
      presentRef.current = snapshot; // initial mount, nothing to record
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

  // Broadcast the whole document after a local structural change (meta / diff /
  // timing). Note ops are broadcast granularly, so they don't set the flag.
  useEffect(() => {
    if (!sessionActiveRef.current || !pendingDocSyncRef.current) return;
    pendingDocSyncRef.current = false;
    collabRef.current?.sendDoc({ meta, timingPoints, difficulties });
  }, [meta, timingPoints, difficulties]);

  const applySnapshot = useCallback((s: DocSnapshot) => {
    applyingHistoryRef.current = true;
    setMeta(s.meta);
    setTimingPoints(s.timingPoints);
    setDifficulties(s.difficulties);
  }, []);

  const undo = useCallback(() => {
    // Live session: undo only the user's own note ops, and broadcast the inverse
    // so collaborators stay in sync.
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

  // ---- Restore the last locally-saved project on first load ---------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadProject().catch(() => null);
      if (cancelled || importStartedRef.current || !saved) return;
      // Don't record the restore as an undoable edit.
      applyingHistoryRef.current = true;
      setProjectStarted(true);
      setMeta(saved.meta);
      setTimingPoints(normalizeTimingPoints(saved.timingPoints));

      // Rebuild the audio registry. New saves store `audioFiles`; older ones a
      // single `audio` that every difficulty then implicitly shares.
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

      setDifficulties(
        (legacyAudio
          ? saved.difficulties.map((d) =>
              d.audioFilename ? d : { ...d, audioFilename: legacyAudio.name },
            )
          : saved.difficulties
        ).map((d) => ({
          ...d,
          timingPoints: normalizeTimingPoints(d.timingPoints),
        })),
      );
      setActiveId(saved.activeId);
      // Older saves carried a `zoom` field and a vestigial scrollSpeed that was
      // never user-settable. Detect those and fall back to the default speed;
      // otherwise restore the saved speed, clamped to the osu!mania range.
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
      // App settings + skin are restored separately (site-level prefs), not
      // from the per-map project record.
      setBgScope(saved.bgScope);

      // Restore background files registry.
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
        // Legacy save: single background - assign it to all difficulties that
        // don't already have a per-diff background set.
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Persist site preferences (general settings) on change --------------
  useEffect(() => {
    const id = window.setTimeout(() => savePreferences(appSettings), 200);
    return () => window.clearTimeout(id);
  }, [appSettings]);

  // ---- Persist editor view controls (snap + scroll speed) on change -------
  useEffect(() => {
    const id = window.setTimeout(() => saveViewPreferences(view), 200);
    return () => window.clearTimeout(id);
  }, [view]);

  // ---- Restore + persist the editor skin independently of any map ---------
  const skinLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rec = await loadSkinBlob().catch(() => null);
      if (!cancelled && rec) {
        const loaded = await importOsk(rec.blob, rec.name).catch(() => null);
        if (!cancelled && loaded) setSkin(loaded);
      }
      if (!cancelled) skinLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save whenever the skin changes - but not before the initial load resolves,
  // so the freshly-loaded skin isn't clobbered by an empty save on mount.
  useEffect(() => {
    if (!skinLoadedRef.current) return;
    void saveSkinBlob(skin ? { name: skin.fileName, blob: skin.blob } : null);
  }, [skin]);

  // ---- Restore + persist the playback volume (site-level) -----------------
  useEffect(() => {
    const v = loadVolume();
    if (v !== null) audio.setVolume(v);
    // Run once on mount; setVolume is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => saveVolume(audio.volume), 200);
    return () => window.clearTimeout(id);
  }, [audio.volume]);

  // ---- Hotkeys: Space = play/pause, Tab = zen mode ------------------------
  // (both off while typing or a modal is open)
  const hasAudioRef = useRef(false);
  hasAudioRef.current = !!audioFile;
  const modalRef = useRef<ModalId>(null);
  modalRef.current = modal;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSpace = e.code === "Space" || e.key === " ";
      const isTab = e.key === "Tab";
      const isUp = e.key === "ArrowUp";
      const isDown = e.key === "ArrowDown";
      if (!isSpace && !isTab && !isUp && !isDown) return;
      if (modalRef.current || askBgScope) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable;
      if (typing) return;
      if (!hasAudioRef.current && !isTab) return;
      e.preventDefault();
      if (isTab) setZenMode((z) => !z);
      else if (isSpace) audio.toggle();
      else if (isUp) audio.setVolume(audio.volume + 0.05);
      else if (isDown) audio.setVolume(audio.volume - 0.05);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [audio, askBgScope]);

  // ---- Drag & drop (audio / image / .osz) ----------------------------------
  const isAudioFile = (f: File) =>
    f.type.startsWith("audio/") || /\.(mp3|ogg)$/i.test(f.name);
  const isImageFile = (f: File) =>
    f.type.startsWith("image/") || /\.(png|jpe?g|gif)$/i.test(f.name);
  const isOszFile = (f: File) => /\.(osz|zip)$/i.test(f.name);
  const isOskFile = (f: File) => /\.osk$/i.test(f.name);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      const osk = files.find(isOskFile);
      if (osk) {
        void onSkinFile(osk);
        return;
      }
      const osz = files.find(isOszFile);
      if (osz) {
        requestImportMap(osz);
        return;
      }
      const audioF = files.find(isAudioFile);
      if (audioF) onAudioFile(audioF);
      const image = files.find(isImageFile);
      if (image) onBackgroundFile(image);
    },
    [onAudioFile, onBackgroundFile, onSkinFile, requestImportMap],
  );

  // ---- Export --------------------------------------------------------------
  const canExport = Object.keys(audioFiles).length > 0 && totalNotes > 0;

  // Pre-export validation. When there's anything worth flagging, the check
  // modal opens and holds the actual export until the user proceeds.
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
    });
  }, [audioFile, active, activeTimingPoints, meta]);

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
      });
    } finally {
      setExporting(false);
    }
  }, [audioFiles, difficulties, bgFiles, meta, timingPoints]);

  /** Validate first; only export straight away when there's nothing to flag. */
  const requestExport = useCallback(
    (target: string, run: () => void) => {
      const result = validateProject({ meta, difficulties, audioFiles, bgFiles });
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

  const confirmImportWithoutExport = useCallback(() => {
    if (!pendingImport) return;
    void importMapFile(pendingImport);
  }, [pendingImport, importMapFile]);

  const confirmExportAndImport = useCallback(async () => {
    if (!pendingImport) return;
    try {
      await doExportOsz();
      await importMapFile(pendingImport);
    } catch {
      setImportError("Failed to export current project. Import canceled.");
    }
  }, [pendingImport, doExportOsz, importMapFile]);

  const cancelPendingImport = useCallback(() => {
    setPendingImport(null);
  }, []);

  /** Strip duplicate notes (same column & time) flagged by validation. */
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
    });
    setExportCheck((check) => (check ? { ...check, result } : check));
  }, [exportCheck, difficulties, meta, audioFiles, bgFiles]);

  // ---- Save progress locally (Ctrl+S) -------------------------------------
  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      await saveProject({
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
        background: null,
        skin: skin ? { name: skin.fileName, blob: skin.blob } : null,
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    appSettings,
    bgScope,
    audioFiles,
    bgFiles,
    skin,
  ]);

  // Auto-dismiss the save toast once it has settled.
  useEffect(() => {
    if (saveStatus !== "saved" && saveStatus !== "error") return;
    const id = window.setTimeout(() => setSaveStatus(null), 2000);
    return () => window.clearTimeout(id);
  }, [saveStatus]);

  // ---- Save / load project to the user's account (cloud) ------------------
  const handleCloudSave = useCallback(async () => {
    if (!authUser) return;
    setCloudSaveStatus("saving");
    setCloudError(null);

    // Refresh the minted Supabase token first, so an expired/rotated token
    // doesn't get rejected as anonymous → spurious "violates RLS" on write.
    try {
      await refreshAuth();
    } catch {
      /* validated below */
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
      setCloudProjectId(id);
      setCloudOwnerId(authUser.id);
      setMyRole("owner");
      setCloudSaveStatus("saved");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Couldn't save to your account.";
      // Translate an RLS rejection into the actual cause, using the token we
      // already decoded, so it's actionable instead of cryptic.
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
              "isn't accepting it — the Worker's SUPABASE_JWT_SECRET must match " +
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
    try {
      const proj = await loadProjectCloud(id);
      // Treat like a fresh import: don't record as undoable, drop old history.
      importStartedRef.current = true;
      applyingHistoryRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];

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
      // Fresh collab session: reset personal op history and resolve our role.
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
      // Reload-resume: return to the difficulty + playhead we left last time.
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
        /* ignore */
      }
      setModal(null);
    } catch (err) {
      setCloudError(
        err instanceof Error ? err.message : "Couldn't load that map.",
      );
    }
  }, []);

  // ---- Pattern presets -----------------------------------------------------
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

  // ---- New project (reset everything) -------------------------------------
  const handleNew = useCallback((confirm = true) => {
    if (confirm) {
      const confirmed = window.confirm(
        "Start a new map? This removes the current audio, background, notes and " +
          "timing, and clears the locally saved project.",
      );
      if (!confirmed) return;
    }

    // Reset is not an undoable edit, and the old history must not survive it.
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
    // Skin and general settings are site-level prefs - they persist across a
    // new map rather than being reset here.

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
    // A brand-new map is no longer tied to any cloud project / collab session.
    setCloudProjectId(null);
    setCloudOwnerId(null);
    setMyRole(null);
    setReferenceId(null);

    void clearProject().catch(() => {});
  }, []);

  // ---- Undo / redo / save shortcuts ---------------------------------------
  // Kept on refs so the global listener mounts once and always sees the latest
  // handlers (they change whenever the document does).
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      // Ctrl+S saves regardless of focus (and always blocks the browser dialog).
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
        // Windows-style redo.
        e.preventDefault();
        redoRef.current();
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

  return (
    <div
      className="relative h-full overflow-hidden bg-ink-900"
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
      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-ink-900/76 backdrop-blur-md">
          <div className="rounded-2xl border-2 border-dashed border-accent/70 bg-ink-800/82 px-12 py-10 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-2 text-3xl">🎵</div>
            <p className="text-lg font-semibold text-slate-100">Drop to load</p>
            <p className="text-sm text-slate-400">
              audio (.mp3 / .ogg) · image background · .osz map · .osk skin
            </p>
          </div>
        </div>
      )}

      {/* Map import overlay (shown while a selected/sample .osz loads) */}
      {importingMap && (
        <div className="fixed inset-0 z-[55] grid place-items-center bg-ink-900/68 backdrop-blur-md">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-800/86 px-6 py-4 text-sm font-medium text-slate-200 shadow-2xl backdrop-blur-xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-accent" />
            Loading map…
          </div>
        </div>
      )}

      {/* Header + menu bar (slides up out of view in zen mode) */}
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
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="o!m editor"
              className="h-8 w-8 rounded-lg object-cover"
            />
            <h1 className="text-sm font-semibold text-slate-100">
              mania editor
            </h1>
          </div>

          <div
            className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
              hasProject
                ? "max-w-[36rem] translate-x-0 opacity-100"
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
                  title="Share — invite collaborators"
                >
                  👥
                </IconButton>
              )}
              {cloudProjectId && authUser && (
                <IconButton
                  onClick={() => setCommentsOpen((v) => !v)}
                  title="Comments"
                >
                  💬
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
                ]}
              />
            </div>
          </div>
          {liveEnabled && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-700/42 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur-xl"
              title={
                collab.status === "connected"
                  ? "Live — edits sync in realtime"
                  : collab.status === "connecting"
                    ? "Connecting to the live session…"
                    : "Live sync offline — check Realtime is enabled"
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
            onOpenAdmin={() => setModal("admin")}
          />
        </div>
      </header>

      {/* Body: difficulty rail + editor */}
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
              onDelete={deleteDifficulty}
              onRename={(id, name) => patchDifficulty(id, { name })}
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
            />
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="flex h-full w-full">
            <div className="relative min-w-0 flex-1">
            {hasProject ? (
              <ManiaEditor
                notes={active.notes}
                keyCount={active.keyCount}
                timingPoints={activeTimingPoints}
                previewTime={active.previewTime}
                view={view}
                currentTime={audio.currentTime}
                backgroundUrl={activeBg?.url ?? null}
                skin={activeSkin}
                playfieldScale={appSettings.playfieldScale}
                longNoteBodyScale={appSettings.longNoteBodyScale}
                zenMode={zenMode}
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
                onPublishPattern={authUser ? handlePublishPattern : undefined}
                pendingClip={presetToCopy}
                readOnly={!canEdit}
              />
            ) : (
              <EmptyState onEnter={() => setModal("welcome")} />
            )}
            </div>
            {/* Reference difficulty: read-only, dimmed, synced to the playhead. */}
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
                      backgroundUrl={null}
                      skin={referenceSkin}
                      playfieldScale={appSettings.playfieldScale}
                      longNoteBodyScale={appSettings.longNoteBodyScale}
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
            {audioFile && !zenMode && (
              <PPCounter
                notes={active.notes}
                keyCount={active.keyCount}
                playbackRate={audio.playbackRate}
                onPlaybackRateChange={audio.setPlaybackRate}
              />
            )}
            <button
              type="button"
              onClick={() => setModal("info")}
              className="absolute bottom-3 left-3 z-30 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-ink-900/62 font-serif text-lg font-semibold text-slate-100 shadow-xl shadow-black/25 backdrop-blur-xl transition hover:border-slate-500/80 hover:bg-white/10"
              aria-label="Open shortcuts and functions"
              title="Shortcuts and functions"
            >
              i
            </button>
            {hasProject && !zenMode && eligibleRefs.length > 0 && (
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
            />
          </div>
        </main>
      </div>

      </div>

      {/* ---- Modals ---- */}
      <WelcomeModal
        open={modal === "welcome"}
        onClose={close}
        onNewMap={() => handleNew(hasProjectContent)}
        onTryMaps={() => setModal("sampleMaps")}
        onOpenCloudProject={(id) => void loadCloudProject(id)}
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
        onImportOsz={requestImportMap}
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
      />
      <SkinModal
        open={modal === "skin"}
        onClose={close}
        skin={skin}
        activeKeyCount={active.keyCount}
        onApplyPreset={onApplyPresetSkin}
        onSkinFile={onSkinFile}
        onClearSkin={onClearSkin}
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
      />
      <TimingModal
        open={modal === "timing"}
        onClose={close}
        timingPoints={activeTimingPoints}
        onTimingPoints={(points) =>
          patchDifficulty(active.id, { timingPoints: points })
        }
        audio={audio}
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

      <InfoModal open={modal === "info"} onClose={close} />

      <AdminPanel open={modal === "admin"} onClose={close} />

      <ShareModal
        open={modal === "share"}
        onClose={close}
        projectId={cloudProjectId}
      />

      {/* Collaborator join/leave toast */}
      {peerNotice && (
        <div
          key={peerNotice.key}
          className="fixed left-1/2 top-16 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-ink-800/90 py-1.5 pl-1.5 pr-4 text-sm text-slate-100 shadow-2xl backdrop-blur-2xl"
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

      {/* Save status toast */}
      {(saveStatus === "saved" || saveStatus === "error") && (
        <div
          className={`fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
            saveStatus === "saved"
              ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-200"
              : "border-red-500/40 bg-red-950/90 text-red-200"
          }`}
        >
          {saveStatus === "saved"
            ? "Progress saved locally"
            : "Couldn't save progress"}
        </div>
      )}

      {/* Cloud save toast */}
      {(cloudSaveStatus === "saved" || cloudSaveStatus === "error") && (
        <div
          className={`fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
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

      {/* Cloud error toast (load / delete failures) */}
      {cloudError && cloudSaveStatus !== "error" && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-lg">
          {cloudError}
          <button
            onClick={() => setCloudError(null)}
            className="ml-3 text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Import error toast */}
      {importError && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-lg">
          {importError}
          <button
            onClick={() => setImportError(null)}
            className="ml-3 text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
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
          <InfoRow keys="Scroll speed" text="Change visual note scroll speed. This is not exported." />
          <InfoRow keys="R" text="Toggle receptors on or off." />
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
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="o!m editor"
          className="mx-auto mb-4 h-24 w-24 rounded-2xl object-cover"
        />
        <h2 className="mb-1 text-lg font-semibold text-slate-200">
          Drop audio anywhere to start mapping
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Drag an <code className="text-slate-400">.mp3</code>,{" "}
          <code className="text-slate-400">.ogg</code>, an image background, or
          a whole <code className="text-slate-400">.osz</code> onto this window.
          Set BPM in <span className="text-slate-300">Timing</span>, then click
          the lanes to place notes. Press{" "}
          <kbd className="rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-slate-300">
            Space
          </kbd>{" "}
          to play / pause.
        </p>
        <Button variant="accent" onClick={onEnter}>
          Enter
        </Button>
        <p className="mt-6 text-[11px] font-medium tracking-wide text-slate-600">
          mania editor · v{__APP_VERSION__}
        </p>
      </div>
    </div>
  );
}
