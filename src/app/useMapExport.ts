import { useCallback, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { logAnalyticsEvent } from "../lib/analytics";
import type { AuthUser } from "../lib/auth";
import type { Translate } from "../lib/i18n";
import { chooseMapperName } from "../lib/mapperName";
import type { SampleFile } from "../lib/mapSamples";
import type { OsuStatus } from "../lib/osuDesktop";
import {
  osuChooseRoot,
  osuFolderName,
  osuMapLabel,
  osuReadMap,
  osuSelectedMap,
  osuSendMap,
  osuStatus,
  osuSyncMap,
} from "../lib/osuDesktop";
import { downloadOsu, setFilename } from "../lib/osuExport";
import type { ProgressFn, ProgressReport } from "../lib/progress";
import type { ChartLike, RoundTripIssue } from "../lib/roundTrip";
import { formatIssues } from "../lib/roundTrip";
import { playUiSound } from "../lib/uiSounds";
import type { ValidationResult } from "../lib/validation";
import { validateProject } from "../lib/validation";
import type {
  AppSettings,
  Difficulty,
  LoadedFile,
  SongMeta,
  TimingPoint,
} from "../types";

/**
 * Exporting the map: .osu, .osz, .sm, .qua and .mcz downloads, sending a
 * set into osu! or syncing it into the Songs folder on desktop, and opening
 * the map selected in osu!. Every export first asks for a mapper name if the
 * map has none, then runs export validation, and a written .osz is read back
 * and checked against the editor.
 */
export function useMapExport({
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
}: {
  active: Difficulty;
  activeTimingPoints: TimingPoint[];
  appSettings: AppSettings;
  audioFile: LoadedFile | null;
  audioFiles: Record<string, LoadedFile>;
  authUser: AuthUser | null;
  authUserRef: MutableRefObject<AuthUser | null>;
  bgFiles: Record<string, LoadedFile>;
  canEditRef: MutableRefObject<boolean>;
  difficulties: Difficulty[];
  exportCheck: { result: ValidationResult; target: string; run: () => void; } | null;
  hasProjectContent: boolean;
  importMapFile: (file: File, preferredBeatmapId?: number, onProgress?: ProgressFn) => Promise<void>;
  mapperPrompt: { target: string; run: (songMeta: SongMeta) => void; } | null;
  markStructural: () => void;
  meta: SongMeta;
  offerMapCard: (target: string) => void;
  sampleFiles: Record<string, SampleFile>;
  setDifficulties: Dispatch<SetStateAction<Difficulty[]>>;
  setExportCheck: Dispatch<SetStateAction<{ result: ValidationResult; target: string; run: () => void; } | null>>;
  setImportError: Dispatch<SetStateAction<string | null>>;
  setImportNotice: Dispatch<SetStateAction<string | null>>;
  setMapperPrompt: Dispatch<SetStateAction<{ target: string; run: (songMeta: SongMeta) => void; } | null>>;
  setMeta: Dispatch<SetStateAction<SongMeta>>;
  setOsuApp: Dispatch<SetStateAction<OsuStatus | null>>;
  setPendingImport: Dispatch<SetStateAction<File | null>>;
  t: Translate;
  timingPoints: TimingPoint[];
  videoFiles: Record<string, LoadedFile>;
}) {
  const [exporting, setExporting] = useState(false);
  const [osuBusy, setOsuBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<ProgressReport | null>(
    null,
  );

  const [exportIssues, setExportIssues] = useState<{
    target: string;
    issues: RoundTripIssue[];
  } | null>(null);
  /**
   * Reads an exported set back and compares it with the map that went out.
   * Runs after the download, so it never holds an export up; a difference
   * means a bug in Cascade, and the mapper is told before they upload.
   */
  const checkExportedSet = useCallback(
    (archive: Blob, chart: ChartLike, target: string) => {
      void import("../lib/exportCheck")
        .then(({ verifyOszArchive }) => verifyOszArchive(archive, chart))
        .then((issues) => {
          if (!issues.length) return;
          console.warn(formatIssues(issues, `Export check (${target})`));
          setExportIssues({ target, issues });
        })
        .catch(() => {});
    },
    [],
  );

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
      const { downloadSmZip } = await import("../lib/smExport");
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
  }, [meta, difficulties, timingPoints, audioFiles, bgFiles, authUser?.id, t, offerMapCard, setImportError]);

  const doExportQua = useCallback(async (songMeta: SongMeta = meta) => {
    if (!audioFile || (active.keyCount !== 4 && active.keyCount !== 7)) return;
    setImportError(null);
    try {
      const { downloadQua } = await import("../lib/qua");
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
    setImportError,
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
      const { downloadMcz } = await import("../lib/malody");
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
  }, [meta, difficulties, timingPoints, audioFiles, bgFiles, t, offerMapCard, setImportError]);

  const doExportOsz = useCallback(async (songMeta: SongMeta = meta) => {
    if (Object.keys(audioFiles).length === 0) return;
    setExporting(true);
    setImportError(null);
    setExportProgress({ ratio: 0, label: t("app.startingEncoder") });
    try {
      const { downloadOsz } = await import("../lib/oszExport");
      const archive = await downloadOsz({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
        videoFiles,
        sampleFiles,
        jpegQuality: appSettings.exportPngBackgroundsAsJpeg
          ? appSettings.exportJpegQuality
          : undefined,
        cascadeTag: appSettings.addCascadeTag,
        onProgress: setExportProgress,
      });
      playUiSound("mapExportDone");
      checkExportedSet(archive, { meta: songMeta, timingPoints, difficulties }, ".osz");
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
    setImportError,
    t,
    audioFiles,
    difficulties,
    bgFiles,
    videoFiles,
    sampleFiles,
    meta,
    timingPoints,
    authUser?.id,
    appSettings.exportPngBackgroundsAsJpeg,
    appSettings.exportJpegQuality,
    appSettings.addCascadeTag,
    offerMapCard,
    checkExportedSet,
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
    [difficulties, audioFiles, bgFiles, setExportCheck],
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
    [meta, authUser?.username, checkAndExport, setMapperPrompt, setMeta],
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
    [mapperPrompt, meta, checkAndExport, setMapperPrompt, setMeta],
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
  }, [setOsuApp]);

  const doSendToOsu = useCallback(async (songMeta: SongMeta = meta) => {
    if (Object.keys(audioFiles).length === 0) return;
    if (!(await ensureOsuFolder())) return;
    setOsuBusy(true);
    setImportError(null);
    setExportProgress({ ratio: 0, label: t("app.startingEncoder") });
    try {
      const { buildOsz } = await import("../lib/oszExport");
      const archive = await buildOsz({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
        videoFiles,
        sampleFiles,
        jpegQuality: appSettings.exportPngBackgroundsAsJpeg
          ? appSettings.exportJpegQuality
          : undefined,
        cascadeTag: appSettings.addCascadeTag,
        onProgress: setExportProgress,
      });
      await osuSendMap(archive, setFilename(songMeta));
      checkExportedSet(archive, { meta: songMeta, timingPoints, difficulties }, "osu!");
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
    authUserRef,
    setImportError,
    setImportNotice,
    audioFiles,
    difficulties,
    bgFiles,
    videoFiles,
    sampleFiles,
    meta,
    timingPoints,
    appSettings.exportPngBackgroundsAsJpeg,
    appSettings.exportJpegQuality,
    appSettings.addCascadeTag,
    ensureOsuFolder,
    checkExportedSet,
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
      const { buildOsz } = await import("../lib/oszExport");
      const archive = await buildOsz({
        meta: songMeta,
        difficulties,
        timingPoints,
        audioFiles,
        bgFiles,
        videoFiles,
        sampleFiles,
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
      checkExportedSet(archive, { meta: songMeta, timingPoints, difficulties }, "osu!");
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
    authUserRef,
    setImportError,
    setImportNotice,
    audioFiles,
    difficulties,
    bgFiles,
    videoFiles,
    sampleFiles,
    meta,
    timingPoints,
    appSettings.exportPngBackgroundsAsJpeg,
    appSettings.exportJpegQuality,
    appSettings.addCascadeTag,
    ensureOsuFolder,
    checkExportedSet,
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
  }, [ensureOsuFolder, hasProjectContent, importMapFile, t, authUserRef, setImportError, setImportNotice, setPendingImport]);

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
  }, [exportCheck, difficulties, meta, audioFiles, bgFiles, markStructural, canEditRef, setDifficulties, setExportCheck]);

  return {
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
  };
}
