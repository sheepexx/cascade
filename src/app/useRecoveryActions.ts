import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Translate } from "../lib/i18n";
import type { SavedProject } from "../lib/persistence";
import { PROJECT_VERSION, loadProject, saveProject } from "../lib/persistence";
import { restoreSnapshot } from "../lib/projectVault";
import type {
  BackupReason,
  BackupRecord,
  RecoveryChart,
  RecoveryHead,
  RecoveryMedia,
} from "../lib/recovery";
import { recoveryRecorder, sameChartContent } from "../lib/recovery";
import type {
  AppSettings,
  BackgroundScope,
  Difficulty,
  SongMeta,
  TimingPoint,
  ViewState,
} from "../types";
import { makeDifficulty, normalizeTimingPoints } from "../types";
import type { ModalId } from "./appTypes";
import type { SetImportError } from "../lib/importErrors";
import { describeImportFailure } from "../lib/importErrors";

/**
 * Restoring earlier work: snapshots and backups into the open map, unsaved work
 * as its own project, and the start-up offer to bring back what a crash or a
 * closed tab left behind.
 */
export function useRecoveryActions({
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
}: {
  appSettingsRef: MutableRefObject<AppSettings>;
  applySavedProject: (saved: SavedProject, localProjectId: string) => void;
  backupRecovery: (reason: BackupReason) => Promise<boolean>;
  canEditRef: MutableRefObject<boolean>;
  localProjectIdRef: MutableRefObject<string>;
  markRecoverySaved: (forProject: string, token: number) => void;
  markStructural: () => void;
  noteRecoveryEdit: (forProject?: string) => void;
  projectStartedRef: MutableRefObject<boolean>;
  projectVaultKey: string;
  recoverySaveToken: () => number;
  setActiveId: Dispatch<SetStateAction<string>>;
  setBgScope: Dispatch<SetStateAction<BackgroundScope>>;
  setDifficulties: Dispatch<SetStateAction<Difficulty[]>>;
  setImportError: SetImportError;
  setImportNotice: Dispatch<SetStateAction<string | null>>;
  setMeta: Dispatch<SetStateAction<SongMeta>>;
  setModal: Dispatch<SetStateAction<ModalId>>;
  setTimingPoints: Dispatch<SetStateAction<TimingPoint[]>>;
  t: Translate;
  viewRef: MutableRefObject<ViewState>;
}) {
  /**
   * Puts an earlier chart back into the open project as one ordinary edit:
   * the media that is loaded stays, a live session syncs it, and Ctrl+Z takes
   * it back. A backup of what was there comes first.
   */
  const restoreChartInPlace = useCallback(
    async (chart: Pick<RecoveryChart, "meta" | "timingPoints" | "difficulties"> &
      Partial<Pick<RecoveryChart, "activeId" | "bgScope">>) => {
      if (!canEditRef.current) throw new Error(t("app.noEditAccess"));
      await backupRecovery("before-restore");
      const diffs = (chart.difficulties.length ? chart.difficulties : [makeDifficulty()]).map(
        (d) => ({ ...d, timingPoints: normalizeTimingPoints(d.timingPoints) }),
      );
      markStructural();
      setMeta(chart.meta);
      setTimingPoints(normalizeTimingPoints(chart.timingPoints));
      setDifficulties(diffs);
      setActiveId((current) =>
        diffs.some((d) => d.id === current)
          ? current
          : diffs.find((d) => d.id === chart.activeId)?.id ?? diffs[0].id,
      );
      if (chart.bgScope) setBgScope(chart.bgScope);
    },
    [backupRecovery, markStructural, t, canEditRef, setActiveId, setBgScope, setDifficulties, setMeta, setTimingPoints],
  );

  const handleRestoreSnapshot = useCallback(
    async (stamp: string) => {
      const snapshot = await restoreSnapshot(projectVaultKey, stamp);
      await restoreChartInPlace(snapshot);
    },
    [projectVaultKey, restoreChartInPlace],
  );

  /**
   * Opens recovered work as its own project. It is saved to the local
   * projects straight away, so it is safe the moment it is back.
   */
  const openRecoveredProject = useCallback(
    async (projectId: string, chart: RecoveryChart, media: RecoveryMedia | null) => {
      let files = media;
      if (!files) {
        const saved = await loadProject(projectId).catch(() => null);
        files = saved
          ? {
              audioFiles: saved.audioFiles ?? (saved.audio ? [saved.audio] : []),
              backgroundFiles:
                saved.backgroundFiles ?? (saved.background ? [saved.background] : []),
              videoFiles: saved.videoFiles ?? [],
              sampleFiles: saved.sampleFiles ?? [],
            }
          : null;
      }
      const project: SavedProject = {
        version: PROJECT_VERSION,
        localId: projectId,
        savedAt: Date.now(),
        meta: chart.meta,
        timingPoints: chart.timingPoints,
        difficulties: chart.difficulties,
        activeId: chart.activeId,
        view: viewRef.current,
        appSettings: appSettingsRef.current,
        bgScope: chart.bgScope,
        audioFiles: files?.audioFiles ?? [],
        backgroundFiles: files?.backgroundFiles ?? [],
        videoFiles: files?.videoFiles ?? [],
        sampleFiles: files?.sampleFiles ?? [],
        background: null,
        skin: null,
      };
      const token = recoverySaveToken();
      const saved = await saveProject(project, projectId).then(
        () => true,
        () => false,
      );
      applySavedProject(project, projectId);
      setModal(null);
      if (saved) markRecoverySaved(projectId, token);
      else noteRecoveryEdit(projectId);
      const title = chart.meta.title.trim() || t("app.unnamed");
      setImportNotice(
        !files || !files.audioFiles.length
          ? t("recovery.restoredNoMedia", { title })
          : t("recovery.restored", { title }),
      );
    },
    [
      setImportNotice,
      setModal,
      viewRef,
      appSettingsRef,
      applySavedProject,
      markRecoverySaved,
      noteRecoveryEdit,
      recoverySaveToken,
      t,
    ],
  );

  const restoreUnsavedWork = useCallback(
    async (projectId: string) => {
      const recorder = recoveryRecorder();
      const found = await recorder?.load(projectId);
      if (!found) throw new Error(t("recovery.restoreFailed"));
      await openRecoveredProject(projectId, found.chart, found.media);
    },
    [openRecoveredProject, t],
  );

  const restoreBackup = useCallback(
    async (record: BackupRecord) => {
      if (record.projectId === localProjectIdRef.current && projectStartedRef.current) {
        await restoreChartInPlace(record.chart);
        setModal(null);
        setImportNotice(t("backups.restoredHere"));
        return;
      }
      const recorder = recoveryRecorder();
      const live = await recorder?.load(record.projectId).catch(() => null);
      await openRecoveredProject(record.projectId, record.chart, live?.media ?? null);
    },
    [openRecoveredProject, restoreChartInPlace, t, localProjectIdRef, projectStartedRef, setImportNotice, setModal],
  );

  const [recoveryOffer, setRecoveryOffer] = useState<RecoveryHead | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  // Looks for work a crash or a closed tab left behind, once the start-up rush
  // is over. Work that matches a saved copy is quietly marked saved instead.
  useEffect(() => {
    const recorder = recoveryRecorder();
    if (!recorder) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const heads = await recorder.recoverable().catch(() => []);
        for (const head of heads.slice(0, 3)) {
          if (cancelled) return;
          const [found, saved] = await Promise.all([
            recorder.load(head.projectId).catch(() => null),
            loadProject(head.projectId).catch(() => null),
          ]);
          if (!found) continue;
          if (saved && sameChartContent(saved, found.chart)) {
            await recorder.markSaved(head.projectId, saved.savedAt).catch(() => {});
            continue;
          }
          if (!cancelled && head.projectId !== localProjectIdRef.current) {
            setRecoveryOffer(head);
          }
          return;
        }
      })();
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [localProjectIdRef]);

  const acceptRecoveryOffer = useCallback(async () => {
    const offer = recoveryOffer;
    if (!offer) return;
    setRecoveryBusy(true);
    try {
      await restoreUnsavedWork(offer.projectId);
      setRecoveryOffer(null);
    } catch (error) {
      const problem = describeImportFailure(error, t("recovery.restoreFailed"), t);
      setImportError(problem.message, problem.details);
    } finally {
      setRecoveryBusy(false);
    }
  }, [recoveryOffer, restoreUnsavedWork, t, setImportError]);

  const dismissRecoveryOffer = useCallback(() => {
    const offer = recoveryOffer;
    setRecoveryOffer(null);
    if (offer) void recoveryRecorder()?.close(offer.projectId).catch(() => {});
  }, [recoveryOffer]);

  return {
    acceptRecoveryOffer,
    dismissRecoveryOffer,
    handleRestoreSnapshot,
    recoveryBusy,
    recoveryOffer,
    restoreBackup,
    restoreUnsavedWork,
  };
}
