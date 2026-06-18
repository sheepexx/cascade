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
import { Button } from "./components/ui/Controls";
import { useAudio } from "./hooks/useAudio";
import { useWaveform } from "./hooks/useWaveform";
import { fullLongNotes, fullRiceNotes } from "./lib/noteTools";
import { downloadOsu } from "./lib/osuExport";
import { downloadOsz } from "./lib/oszExport";
import { importOsz } from "./lib/osuImport";
import { importOsk } from "./lib/skinImport";
import { loadProject, saveProject, clearProject } from "./lib/persistence";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SONG_META,
  DEFAULT_VIEW,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  defaultTimingPoints,
  makeDifficulty,
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
  | "mapSettings"
  | "settings"
  | "skin"
  | "timing"
  | "difficulty"
  | "tools"
  | null;

/** Snapshot of the undoable beatmap document. */
type DocSnapshot = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

export default function App() {
  const [meta, setMeta] = useState<SongMeta>(DEFAULT_SONG_META);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>(
    defaultTimingPoints,
  );
  const [difficulties, setDifficulties] = useState<Difficulty[]>(() => [
    makeDifficulty("Normal", 4),
  ]);
  const [activeId, setActiveId] = useState<string>(() => difficulties[0].id);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);

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
  // Zen mode (toggled with Tab): slide all chrome out and show only the
  // notefield.
  const [zenMode, setZenMode] = useState(false);
  const [appSettings, setAppSettings] =
    useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [bgScope, setBgScope] = useState<BackgroundScope>("mapset");
  const [askBgScope, setAskBgScope] = useState(false);
  const [lnTicks, setLnTicks] = useState(1);
  const [importError, setImportError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);

  const active =
    difficulties.find((d) => d.id === activeId) ?? difficulties[0];

  // The song for the active difficulty: its own audio, or the set's single
  // audio when this difficulty hasn't named one (manual uploads, legacy maps).
  const audioFile = useMemo<LoadedFile | null>(() => {
    const named = active.audioFilename ? audioFiles[active.audioFilename] : null;
    if (named) return named;
    const all = Object.values(audioFiles);
    return all.length === 1 ? all[0] : null;
  }, [active.audioFilename, audioFiles]);

  const audio = useAudio(audioFile?.url ?? null);
  const waveform = useWaveform(audioFile?.blob ?? null);

  // Background for the active difficulty.
  const activeBg = active.backgroundFilename ? bgFiles[active.backgroundFilename] ?? null : null;

  const activeTimingPoints =
    active.timingPoints?.length ? active.timingPoints : timingPoints;
  const activeSkin = skin?.keymodes[active.keyCount] ?? null;
  const hasProject = Object.keys(audioFiles).length > 0;
  // Surrounding chrome is shown only with a project loaded and outside zen mode.
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
    setImportError(null);
    try {
      const map = await importOsz(file);
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
        map.timingPoints.length ? map.timingPoints : defaultTimingPoints(),
      );
      const diffs = map.difficulties.length
        ? map.difficulties
        : [makeDifficulty()];
      setDifficulties(diffs);
      setActiveId(diffs[0].id);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import .osz file.",
      );
    }
  }, []);

  // ---- Difficulty management ----------------------------------------------
  const patchDifficulty = useCallback(
    (id: string, patch: Partial<Difficulty>) => {
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
    [],
  );

  const addDifficulty = useCallback(() => {
    const base = difficulties.find((d) => d.id === activeId);
    const diff = makeDifficulty("New Difficulty", base?.keyCount ?? 4);
    diff.audioFilename = base?.audioFilename;
    diff.timingPoints = (base?.timingPoints?.length
      ? base.timingPoints
      : timingPoints
    ).map((p) => ({ ...p, id: uid("tp") }));
    setDifficulties((prev) => [...prev, diff]);
    setActiveId(diff.id);
  }, [difficulties, activeId, timingPoints]);

  const duplicateDifficulty = useCallback((id: string) => {
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
  }, []);

  const deleteDifficulty = useCallback(
    (id: string) => {
      setDifficulties((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((d) => d.id !== id);
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId],
  );

  // ---- Note editing (on the active difficulty) ----------------------------
  const placeNote = useCallback(
    (note: ManiaNote) => {
      setDifficulties((prev) => {
        const target = prev.find((d) => d.id === activeId);
        if (!target) return prev;
        const dup = target.notes.some(
          (n) =>
            n.column === note.column &&
            n.startTime === note.startTime &&
            n.endTime === undefined &&
            note.endTime === undefined,
        );
        // Return prev unchanged so React bails out (no phantom undo entry).
        if (dup) return prev;
        return prev.map((d) =>
          d.id === activeId ? { ...d, notes: [...d.notes, note] } : d,
        );
      });
    },
    [activeId],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      setDifficulties((prev) =>
        prev.map((d) =>
          d.id === activeId
            ? { ...d, notes: d.notes.filter((n) => n.id !== noteId) }
            : d,
        ),
      );
    },
    [activeId],
  );

  /** Append several notes at once (used by paste). */
  const addNotes = useCallback(
    (notes: ManiaNote[]) => {
      if (!notes.length) return;
      setDifficulties((prev) =>
        prev.map((d) =>
          d.id === activeId ? { ...d, notes: [...d.notes, ...notes] } : d,
        ),
      );
    },
    [activeId],
  );

  /** Delete several notes at once (used by multi-select delete / cut). */
  const deleteNotes = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const set = new Set(ids);
      setDifficulties((prev) =>
        prev.map((d) =>
          d.id === activeId
            ? { ...d, notes: d.notes.filter((n) => !set.has(n.id)) }
            : d,
        ),
      );
    },
    [activeId],
  );

  /** Full LN: convert every note in the active difficulty to a long note. */
  const applyFullLong = useCallback(
    (ticks: number) => {
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeId) return d;
          const points = d.timingPoints?.length
            ? d.timingPoints
            : timingPoints;
          return {
            ...d,
            notes: fullLongNotes(d.notes, points, view.snapDivisor, ticks),
          };
        }),
      );
    },
    [activeId, timingPoints, view.snapDivisor],
  );

  /** Full RC: convert every long note in the active difficulty to a rice note. */
  const applyFullRice = useCallback(() => {
    setDifficulties((prev) =>
      prev.map((d) =>
        d.id === activeId ? { ...d, notes: fullRiceNotes(d.notes) } : d,
      ),
    );
  }, [activeId]);

  /** Replace several notes in place by id (used by drag-to-move). */
  const moveNotes = useCallback(
    (updated: ManiaNote[]) => {
      if (!updated.length) return;
      const map = new Map(updated.map((n) => [n.id, n]));
      setDifficulties((prev) =>
        prev.map((d) =>
          d.id === activeId
            ? { ...d, notes: d.notes.map((n) => map.get(n.id) ?? n) }
            : d,
        ),
      );
    },
    [activeId],
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
  // applying flag so they aren't recorded as fresh edits.
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
    undoStackRef.current.push(presentRef.current);
    if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    redoStackRef.current = [];
    presentRef.current = snapshot;
    bumpHistory((v) => v + 1);
  }, [snapshot]);

  const applySnapshot = useCallback((s: DocSnapshot) => {
    applyingHistoryRef.current = true;
    setMeta(s.meta);
    setTimingPoints(s.timingPoints);
    setDifficulties(s.difficulties);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    if (presentRef.current) redoStackRef.current.push(presentRef.current);
    applySnapshot(prev);
    bumpHistory((v) => v + 1);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    if (presentRef.current) undoStackRef.current.push(presentRef.current);
    applySnapshot(next);
    bumpHistory((v) => v + 1);
  }, [applySnapshot]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  // ---- Restore the last locally-saved project on first load ---------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadProject().catch(() => null);
      if (cancelled || !saved) return;
      // Don't record the restore as an undoable edit.
      applyingHistoryRef.current = true;
      setMeta(saved.meta);
      setTimingPoints(saved.timingPoints);

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
        legacyAudio
          ? saved.difficulties.map((d) =>
              d.audioFilename ? d : { ...d, audioFilename: legacyAudio.name },
            )
          : saved.difficulties,
      );
      setActiveId(saved.activeId);
      // Older saves carried a `zoom` field and a vestigial scrollSpeed that was
      // never user-settable. Detect those and fall back to the default speed;
      // otherwise restore the saved speed, clamped to the osu!mania range.
      const isLegacyView = "zoom" in saved.view;
      setView({
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
      setAppSettings({ ...DEFAULT_APP_SETTINGS, ...saved.appSettings });
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
        // Legacy save: single background — assign it to all difficulties that
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
      if (saved.skin) {
        const loaded = await importOsk(
          saved.skin.blob,
          saved.skin.name,
        ).catch(() => null);
        if (!cancelled && loaded) setSkin(loaded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!hasAudioRef.current) return;
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
        void importMapFile(osz);
        return;
      }
      const audioF = files.find(isAudioFile);
      if (audioF) onAudioFile(audioF);
      const image = files.find(isImageFile);
      if (image) onBackgroundFile(image);
    },
    [onAudioFile, onBackgroundFile, importMapFile, onSkinFile],
  );

  // ---- Export --------------------------------------------------------------
  const totalNotes = difficulties.reduce((s, d) => s + d.notes.length, 0);
  const canExport = Object.keys(audioFiles).length > 0 && totalNotes > 0;

  const handleExportOsu = useCallback(() => {
    if (!audioFile) return;
    downloadOsu({
      meta,
      difficulty: active,
      timingPoints: activeTimingPoints,
      audioFilename: audioFile.name,
      backgroundFilename: active.backgroundFilename,
    });
  }, [audioFile, active, activeTimingPoints, meta]);

  const handleExportOsz = useCallback(async () => {
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

  // ---- New project (reset everything) -------------------------------------
  const handleNew = useCallback(() => {
    const confirmed = window.confirm(
      "Start a new map? This removes the current audio, background, notes and " +
        "timing, and clears the locally saved project.",
    );
    if (!confirmed) return;

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
    setSkin((prev) => {
      if (prev) prev.objectUrls.forEach(URL.revokeObjectURL);
      return null;
    });
    setSkinError(null);

    const fresh = makeDifficulty("Normal", 4);
    setMeta(DEFAULT_SONG_META);
    setTimingPoints(defaultTimingPoints());
    setDifficulties([fresh]);
    setActiveId(fresh.id);
    setView(DEFAULT_VIEW);
    setZenMode(false);
    setAppSettings(DEFAULT_APP_SETTINGS);
    setBgScope("mapset");
    setModal(null);
    setImportError(null);
    setSaveStatus(null);

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
      className="relative flex h-full flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-ink-900/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent/70 px-12 py-10 text-center">
            <div className="mb-2 text-3xl">🎵</div>
            <p className="text-lg font-semibold text-slate-100">Drop to load</p>
            <p className="text-sm text-slate-400">
              audio (.mp3 / .ogg) · image background · .osz map · .osk skin
            </p>
          </div>
        </div>
      )}

      {/* Header + menu bar (slides up out of view in zen mode) */}
      <header
        className={`flex items-center justify-between gap-4 overflow-hidden border-ink-600 bg-ink-800 px-5 transition-[max-height,padding,opacity,transform] duration-300 ease-out ${
          zenMode
            ? "pointer-events-none max-h-0 -translate-y-full border-b-0 py-0 opacity-0"
            : "max-h-20 translate-y-0 border-b py-2.5 opacity-100"
        }`}
        aria-hidden={zenMode}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-bold text-white shadow-[0_0_18px_-4px] shadow-accent">
              M
            </div>
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
              <MenuButton onClick={() => setModal("skin")}>Skin</MenuButton>
              <MenuButton onClick={() => setModal("settings")}>
                Settings
              </MenuButton>
              <span className="mx-1 h-5 w-px bg-ink-600" />
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

        <div
          className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out ${
            hasProject
              ? "max-w-[36rem] translate-x-0 opacity-100"
              : "pointer-events-none max-w-0 translate-x-3 opacity-0"
          }`}
          aria-hidden={!hasProject}
        >
          <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="mr-2 text-xs text-slate-500">
            {active.keyCount}K · {active.notes.length} notes ({holds} holds)
          </span>
          <Button
            onClick={handleNew}
            title="New map (clears everything)"
          >
            New
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saveStatus === "saving"}
            title="Save progress locally (Ctrl+S)"
          >
            {saveStatus === "saving" ? "Saving…" : "Save"}
          </Button>
          <Button onClick={handleExportOsu} disabled={!canExport}>
            Export .osu
          </Button>
          <Button
            variant="accent"
            onClick={handleExportOsz}
            disabled={!canExport || exporting}
          >
            {exporting ? "Packaging…" : "Export .osz"}
          </Button>
          </div>
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
            />
          </div>
          <div className="relative min-h-0 flex-1">
            {audioFile ? (
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
                onPlaceNote={placeNote}
                onDeleteNote={deleteNote}
                onAddNotes={addNotes}
                onDeleteNotes={deleteNotes}
                onMoveNotes={moveNotes}
                onSeek={audio.seek}
                onVolumeChange={(delta) => audio.setVolume(audio.volume + delta)}
              />
            ) : (
              <EmptyState onOpenSettings={() => setModal("mapSettings")} />
            )}
            {audioFile && !zenMode && (
              <PPCounter notes={active.notes} keyCount={active.keyCount} />
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
            />
          </div>
        </main>
      </div>

      {/* ---- Modals ---- */}
      <SettingsModal
        open={modal === "mapSettings"}
        onClose={close}
        meta={meta}
        onMeta={setMeta}
        audio={audioFile}
        background={activeBg}
        bgScope={bgScope}
        onBgScope={setBgScope}
        onAudioFile={onAudioFile}
        onBackgroundFile={onBackgroundFile}
        onClearBackground={onClearBackground}
        onImportOsz={importMapFile}
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
      className="rounded-md px-3 py-1.5 text-sm text-slate-300 transition hover:bg-ink-600 hover:text-slate-100"
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
      className="grid h-8 w-8 place-items-center rounded-md text-base text-slate-300 transition hover:bg-ink-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ink-700 text-2xl">
          🎵
        </div>
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
        <Button variant="accent" onClick={onOpenSettings}>
          Open Map Settings
        </Button>
      </div>
    </div>
  );
}
