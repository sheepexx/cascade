import { useCallback, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SampleMap } from "../components/menus/StartModal";
import { logAnalyticsEvent, trackFunnel } from "../lib/analytics";
import type { AuthUser } from "../lib/auth";
import { snapshotBlobMap } from "../lib/blobSnapshot";
import type { AccessRole } from "../lib/collab";
import type { Translate } from "../lib/i18n";
import { assertTextImportSize } from "../lib/importLimits";
import type { SampleFile } from "../lib/mapSamples";
import { parseOsuBeatmapLink } from "../lib/osuLinks";
import type { ProgressFn, ProgressReport } from "../lib/progress";
import { formatBytes, readBlobWithProgress, scopedProgress } from "../lib/progress";
import { siteAsset } from "../lib/siteAssets";
import type { PackSong } from "../lib/smPackImport";
import type {
  AppSettings,
  Difficulty,
  LoadedFile,
  SongMeta,
  TimingPoint,
} from "../types";
import { defaultTimingPoints, makeDifficulty, normalizeTimingPoints } from "../types";
import type { DocSnapshot, ModalId, OsuEntry } from "./appTypes";
import { newLocalProjectId } from "./appUtils";
import { loadOsuImport } from "./lazySurfaces";
import { describeImportFailure, type SetImportError } from "../lib/importErrors";

/**
 * Opening maps. replaceProject is the one way the open project is swapped
 * for another, used by every import here and by new maps, saved projects
 * and cloud projects in App, so each starts from the same clean slate with
 * an empty undo history. The rest reads .osz/.zip archives, .osu, .sm/.ssc,
 * .qua and .mc files, StepMania pack folders, osu! beatmap links and the
 * sample maps, asking first when a map with content would be replaced.
 */
export function useProjectLoading({
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
}: {
  activeIdRef: MutableRefObject<string>;
  announceAssetChange: (action: string) => void;
  applyingHistoryRef: MutableRefObject<boolean>;
  audioFilesRef: MutableRefObject<Record<string, LoadedFile>>;
  authUserRef: MutableRefObject<AuthUser | null>;
  bgFilesRef: MutableRefObject<Record<string, LoadedFile>>;
  canEditRef: MutableRefObject<boolean>;
  difficultiesRef: MutableRefObject<Difficulty[]>;
  hasProjectContent: boolean;
  importStartedRef: MutableRefObject<boolean>;
  markStructural: () => void;
  metaRef: MutableRefObject<SongMeta>;
  projectStartedRef: MutableRefObject<boolean>;
  redoStackRef: MutableRefObject<DocSnapshot[]>;
  setActiveId: Dispatch<SetStateAction<string>>;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  setAudioFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  setBgFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  setCloudOwnerId: Dispatch<SetStateAction<string | null>>;
  setCloudProjectId: Dispatch<SetStateAction<string | null>>;
  setDifficulties: Dispatch<SetStateAction<Difficulty[]>>;
  setImportError: SetImportError;
  setImportNotice: Dispatch<SetStateAction<string | null>>;
  setImportProgress: Dispatch<SetStateAction<ProgressReport | null>>;
  setImportingMap: Dispatch<SetStateAction<boolean>>;
  setLocalProjectId: Dispatch<SetStateAction<string>>;
  setMeta: Dispatch<SetStateAction<SongMeta>>;
  setModal: Dispatch<SetStateAction<ModalId>>;
  setMyRole: Dispatch<SetStateAction<AccessRole>>;
  setNeedsSongHint: Dispatch<SetStateAction<boolean>>;
  setPendingImport: Dispatch<SetStateAction<File | null>>;
  setPendingOsuDiffs: Dispatch<SetStateAction<OsuEntry[] | null>>;
  setProjectStarted: Dispatch<SetStateAction<boolean>>;
  setPublicMapUrl: Dispatch<SetStateAction<string | null>>;
  setReferenceId: Dispatch<SetStateAction<string | null>>;
  setSampleFiles: Dispatch<SetStateAction<Record<string, SampleFile>>>;
  setTimingPoints: Dispatch<SetStateAction<TimingPoint[]>>;
  setVideoFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  setZenMode: Dispatch<SetStateAction<boolean>>;
  t: Translate;
  undoStackRef: MutableRefObject<DocSnapshot[]>;
  videoFilesRef: MutableRefObject<Record<string, LoadedFile>>;
}) {
  /**
   * Swaps the open project for another: a new map, an import, a saved local
   * or cloud project. Every way of opening a map goes through here, so each
   * starts from the same clean slate: the old media's object URLs revoked,
   * no cloud link or reference difficulty, and an empty undo history, so
   * Ctrl+Z cannot reach back into the map that was open before.
   */
  const replaceProject = useCallback(
    (next: {
      meta: SongMeta;
      timingPoints: TimingPoint[];
      difficulties: Difficulty[];
      activeId?: string;
      audioFiles?: Record<string, LoadedFile>;
      backgroundFiles?: Record<string, LoadedFile>;
      videoFiles?: Record<string, LoadedFile>;
      sampleFiles?: Record<string, SampleFile>;
      /** Defaults to a fresh local id: an import is a new project. */
      localProjectId?: string;
      needsSongHint?: boolean;
    }) => {
      applyingHistoryRef.current = true;
      undoStackRef.current = [];
      redoStackRef.current = [];
      const swap =
        (files: Record<string, LoadedFile> = {}) =>
        (prev: Record<string, LoadedFile>) => {
          for (const old of Object.values(prev)) {
            if (files[old.name]?.url !== old.url) URL.revokeObjectURL(old.url);
          }
          return files;
        };
      setAudioFiles(swap(next.audioFiles));
      setBgFiles(swap(next.backgroundFiles));
      setVideoFiles(swap(next.videoFiles));
      setSampleFiles(next.sampleFiles ?? {});
      setMeta(next.meta);
      setTimingPoints(
        next.timingPoints.length
          ? normalizeTimingPoints(next.timingPoints)
          : defaultTimingPoints(),
      );
      const diffs = (next.difficulties.length ? next.difficulties : [makeDifficulty()]).map(
        (d) => ({ ...d, timingPoints: normalizeTimingPoints(d.timingPoints) }),
      );
      setDifficulties(diffs);
      setActiveId(
        diffs.some((d) => d.id === next.activeId) ? (next.activeId as string) : diffs[0].id,
      );
      setProjectStarted(true);
      setZenMode(false);
      setPublicMapUrl(null);
      setCloudProjectId(null);
      setCloudOwnerId(null);
      setMyRole(null);
      setReferenceId(null);
      setPendingImport(null);
      setPendingOsuDiffs(null);
      setModal(null);
      setLocalProjectId(next.localProjectId ?? newLocalProjectId());
      if (next.needsSongHint !== undefined) setNeedsSongHint(next.needsSongHint);
      importStartedRef.current = true;
    },
    [
      importStartedRef,
      setActiveId,
      setAudioFiles,
      setBgFiles,
      setCloudOwnerId,
      setCloudProjectId,
      setDifficulties,
      setLocalProjectId,
      setMeta,
      setModal,
      setMyRole,
      setNeedsSongHint,
      setProjectStarted,
      setPublicMapUrl,
      setReferenceId,
      setSampleFiles,
      setTimingPoints,
      setVideoFiles,
      setZenMode,
      applyingHistoryRef,
      redoStackRef,
      undoStackRef,
      setPendingImport,
      setPendingOsuDiffs,
    ],
  );

  /** A new project counts as created once, for the funnel. */
  const logProjectCreated = useCallback(() => {
    void logAnalyticsEvent("local_project_created", authUserRef.current?.id).catch(
      () => {},
    );
    trackFunnel("created");
  }, [authUserRef]);

  const reportImportFailure = useCallback(
    (error: unknown, fallback: string) => {
      const problem = describeImportFailure(error, fallback, t);
      setImportError(problem.message, problem.details);
    },
    [setImportError, t],
  );

  const [scannedPackSongs, setScannedPackSongs] = useState<PackSong[]>([]);
  const [scanningPack, setScanningPack] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);

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
      const { importOsz } = await loadOsuImport();
      const map = await importOsz(file, onProgress);
      replaceProject({
        meta: map.meta,
        timingPoints: map.timingPoints,
        difficulties: map.difficulties,
        activeId: preferredBeatmapId
          ? map.difficulties.find((d) => d.beatmapId === preferredBeatmapId)?.id
          : undefined,
        audioFiles: map.audioFiles,
        backgroundFiles: map.backgroundFiles,
        videoFiles: map.videoFiles,
        sampleFiles: map.sampleFiles,
      });
      if (map.unsupported?.length) {
        setImportNotice(
          map.unsupported
            .map((feature) =>
              feature === "storyboard"
                ? t("import.storyboardLeftOut")
                : t("import.specialStyleLeftOut"),
            )
            .join(" "),
        );
      }
      logProjectCreated();
      void logAnalyticsEvent("import_osz", authUserRef.current?.id).catch(
        () => {},
      );
    } catch (err) {
      reportImportFailure(err, t("app.importOszFailed"));
    } finally {
      setImportingMap(false);
      setImportProgress(null);
    }
  }, [logProjectCreated, replaceProject, t, authUserRef, importStartedRef, setImportError, setImportNotice, setImportProgress, setImportingMap, reportImportFailure]);

  const requestImportMap = useCallback(
    (file: File) => {
      if (hasProjectContent) {
        setPendingImport(file);
      } else {
        void importMapFile(file);
      }
    },
    [hasProjectContent, importMapFile, setPendingImport],
  );

  const importArchive = useCallback(
    async (file: File) => {
      if (/\.zip$/i.test(file.name)) {
        setImportingMap(true);
        try {
          const { scanPackFromZip } = await import("../lib/smPackImport");
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
    [requestImportMap, t, setImportError, setImportingMap, setModal],
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
    [hasProjectContent, importMapFile, t, authUserRef, setImportProgress, setImportingMap],
  );

  const importSmFile = useCallback(async (file: File) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    try {
      assertTextImportSize(file);
      const text = await file.text();
      const { parseSmFile } = await import("../lib/smImport");
      const map = parseSmFile(text);
      void logAnalyticsEvent("import_sm", authUserRef.current?.id).catch(
        () => {},
      );
      const smBgFilename = map.backgroundFilename;
      replaceProject({
        meta: map.meta,
        timingPoints: map.timingPoints,
        difficulties: map.difficulties.map((d) => ({
          ...d,
          backgroundFilename: d.backgroundFilename || smBgFilename || undefined,
        })),
      });
      logProjectCreated();
    } catch (err) {
      reportImportFailure(err, t("app.importSmFailed"));
    } finally {
      setImportingMap(false);
    }
  }, [logProjectCreated, replaceProject, t, authUserRef, importStartedRef, setImportError, setImportingMap, reportImportFailure]);

  const importQuaFile = useCallback(async (file: File) => {
    importStartedRef.current = true;
    setImportError(null);
    setImportingMap(true);
    try {
      assertTextImportSize(file);
      const malody = /\.mc$/i.test(file.name);
      const source = await file.text();
      const map = malody
        ? { ...(await import("../lib/malody")).parseMalodyChart(source), bpmAffectsScroll: null }
        : (await import("../lib/qua")).parseQuaFile(source);
      replaceProject({
        meta: map.meta,
        timingPoints: map.timingPoints,
        difficulties: [map.difficulty],
        needsSongHint: true,
      });
      const bpmAffectsScroll = map.bpmAffectsScroll;
      if (bpmAffectsScroll !== null) {
        setAppSettings((settings) => ({ ...settings, bpmAffectsScroll }));
      }
      logProjectCreated();
    } catch (error) {
      reportImportFailure(error, t("import.failed", { name: file.name }));
    } finally {
      setImportingMap(false);
    }
  }, [logProjectCreated, replaceProject, t, setAppSettings, importStartedRef, setImportError, setImportingMap, reportImportFailure]);

  const requestImportSm = useCallback(
    (file: File) => {
      if (hasProjectContent) {
        setPendingImport(file);
      } else {
        void importSmFile(file);
      }
    },
    [hasProjectContent, importSmFile, setPendingImport],
  );

  const requestImportQua = useCallback(
    (file: File) => {
      if (hasProjectContent) setPendingImport(file);
      else void importQuaFile(file);
    },
    [hasProjectContent, importQuaFile, setPendingImport],
  );

  const readOsuFiles = useCallback(async (files: File[]) => {
    const { isManiaOsu, parseOsuFile } = await loadOsuImport();
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

  const openOsuAsProject = useCallback(async (entries: OsuEntry[]) => {
    if (!entries.length) return;
    const { adoptOsuDifficulty } = await loadOsuImport();
    setImportError(null);
    const names: string[] = [];
    const diffs = entries.map(({ parsed }) => {
      const diff = adoptOsuDifficulty(parsed, {
        audioFilenames: [],
        backgroundFilenames: [],
        videoFilenames: [],
        existingNames: names,
      });
      names.push(diff.name);
      return diff;
    });
    replaceProject({
      meta: entries[0].parsed.meta,
      timingPoints: entries[0].parsed.timingPoints,
      difficulties: diffs,
      needsSongHint: true,
    });
    logProjectCreated();
  }, [logProjectCreated, replaceProject, setImportError]);

  const importOsuProjectFile = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        await openOsuAsProject(await readOsuFiles([file]));
      } catch (err) {
        reportImportFailure(err, t("app.importOsuFailed"));
      }
    },
    [readOsuFiles, openOsuAsProject, t, setImportError, reportImportFailure],
  );

  const addOsuDifficulties = useCallback(
    async (entries: OsuEntry[]) => {
      if (!entries.length) return;
      const { adoptOsuDifficulty } = await loadOsuImport();
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
    [markStructural, announceAssetChange, t, canEditRef, activeIdRef, audioFilesRef, bgFilesRef, difficultiesRef, setActiveId, setDifficulties, setImportError, setImportNotice, setModal, setPendingOsuDiffs, videoFilesRef],
  );

  const openOsuFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setImportError(null);
      let entries: OsuEntry[];
      try {
        entries = await readOsuFiles(files);
      } catch (err) {
        reportImportFailure(err, t("app.readOsuFailed"));
        return;
      }
      if (!projectStartedRef.current) {
        await openOsuAsProject(entries);
        return;
      }
      const { isSameSong } = await loadOsuImport();
      if (entries.every(({ parsed }) => isSameSong(metaRef.current, parsed.meta))) {
        await addOsuDifficulties(entries);
        return;
      }
      setPendingOsuDiffs(entries);
    },
    [readOsuFiles, openOsuAsProject, addOsuDifficulties, t, metaRef, projectStartedRef, setImportError, setPendingOsuDiffs, reportImportFailure],
  );

  const importPackSong = useCallback(
    (song: PackSong) => {
      void (async () => {
        const audioBlobs = await snapshotBlobMap(song.audioBlobs);
        const bgBlobs = await snapshotBlobMap(song.bgBlobs);
        const register = (blobs: Record<string, Blob>): Record<string, LoadedFile> =>
          Object.fromEntries(
            Object.entries(blobs).map(([name, blob]) => [
              name,
              { name, url: URL.createObjectURL(blob), blob },
            ]),
          );
        const audioKeys = Object.keys(audioBlobs);
        const bgKeys = Object.keys(bgBlobs);
        const smAudioFilename = song.parsed.audioFilename ?? (audioKeys.length > 0 ? audioKeys[0] : undefined);
        const smBgFilename = song.parsed.backgroundFilename ?? (bgKeys.length > 0 ? bgKeys[0] : undefined);
        replaceProject({
          meta: song.parsed.meta,
          timingPoints: song.parsed.timingPoints,
          difficulties: (song.parsed.difficulties.length
            ? song.parsed.difficulties
            : [makeDifficulty()]
          ).map((d) => ({
            ...d,
            audioFilename: d.audioFilename || smAudioFilename || undefined,
            backgroundFilename: d.backgroundFilename || smBgFilename || undefined,
          })),
          audioFiles: register(audioBlobs),
          backgroundFiles: register(bgBlobs),
        });
        logProjectCreated();
      })();
    },
    [logProjectCreated, replaceProject],
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
      const { scanPackFromPicker } = await import("../lib/smPackImport");
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
  }, [t, setModal]);

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
        reportImportFailure(err, t("app.loadMapFailed"));
        setImportingMap(false);
      }
    },
    [importMapFile, t, setImportingMap, setModal, reportImportFailure],
  );

  return {
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
  };
}
