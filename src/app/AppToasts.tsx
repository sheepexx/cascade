import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { RecoveryPrompt } from "../components/RecoveryPrompt";
import { SampleMapsIcon } from "../components/ui/StartIcons";
import { Toast } from "../components/ui/Toast";
import { activityLog, type ActivityInput } from "../lib/activityLog";
import type { DesktopUpdate } from "../lib/desktopUpdate";
import { useT } from "../lib/i18n";
import type { ProgressReport } from "../lib/progress";
import type { RecoveryHead } from "../lib/recovery";
import type { RoundTripIssue } from "../lib/roundTrip";
import { formatIssues } from "../lib/roundTrip";
import type { LoadedFile } from "../types";
import type { SetImportError } from "../lib/importErrors";

/**
 * Records a notice in the activity log when it first shows (or changes) and
 * returns a callback that marks it seen.
 */
function useActivityRecord(entry: ActivityInput | null): () => void {
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const idRef = useRef<string | null>(null);
  const key = entry ? `${entry.tone}\n${entry.title}\n${entry.body ?? ""}` : null;
  useEffect(() => {
    const current = entryRef.current;
    idRef.current = current ? activityLog().add(current) : null;
  }, [key]);
  return useCallback(() => {
    if (idRef.current) activityLog().markRead(idRef.current);
  }, []);
}

/**
 * The stack of notices at the bottom of the window: unsaved work to restore,
 * save and export progress and failures, import results, the export check,
 * the reminder to add a song, and app updates. Failures and export checks are
 * also kept in the inbox's activity list, unread until the toast is closed or
 * acted on, so one that timed out unseen can still be found.
 */
export function AppToasts({
  acceptRecoveryOffer,
  applyDesktopUpdate,
  applyPendingUpdate,
  audioFile,
  cloudError,
  cloudSaveStatus,
  desktopUpdate,
  dismissRecoveryOffer,
  exportIssues,
  exportProgress,
  exporting,
  importError,
  importErrorDetails,
  importNotice,
  needsSongHint,
  pwaUpdateReady,
  recoveryBusy,
  recoveryOffer,
  retryCloudSave,
  retrySave,
  saveErrorDetail,
  saveStatus,
  setCloudError,
  setCloudSaveStatus,
  setDesktopUpdate,
  setExportIssues,
  setImportError,
  setImportNotice,
  setNeedsSongHint,
  setSaveStatus,
  updating,
}: {
  acceptRecoveryOffer: () => Promise<void>;
  applyDesktopUpdate: () => void;
  applyPendingUpdate: () => void;
  audioFile: LoadedFile | null;
  cloudError: string | null;
  cloudSaveStatus: "saving" | "saved" | "error" | null;
  desktopUpdate: DesktopUpdate | null;
  dismissRecoveryOffer: () => void;
  exportIssues: { target: string; issues: RoundTripIssue[]; } | null;
  exportProgress: ProgressReport | null;
  exporting: boolean;
  importError: string | null;
  importErrorDetails: string | null;
  importNotice: string | null;
  needsSongHint: boolean;
  pwaUpdateReady: boolean;
  recoveryBusy: boolean;
  recoveryOffer: RecoveryHead | null;
  retryCloudSave: () => void;
  retrySave: () => void;
  saveErrorDetail: string | null;
  saveStatus: "saving" | "saved" | "error" | null;
  setCloudError: Dispatch<SetStateAction<string | null>>;
  setCloudSaveStatus: Dispatch<SetStateAction<"saving" | "saved" | "error" | null>>;
  setDesktopUpdate: Dispatch<SetStateAction<DesktopUpdate | null>>;
  setExportIssues: Dispatch<SetStateAction<{ target: string; issues: RoundTripIssue[]; } | null>>;
  setImportError: SetImportError;
  setImportNotice: Dispatch<SetStateAction<string | null>>;
  setNeedsSongHint: Dispatch<SetStateAction<boolean>>;
  setSaveStatus: Dispatch<SetStateAction<"saving" | "saved" | "error" | null>>;
  updating: boolean;
}) {
  const t = useT();
  const cloudSaveFailed = cloudSaveStatus === "error";
  const issueSummary = exportIssues
    ? `${exportIssues.issues[0].path}: ${exportIssues.issues[0].message}${
        exportIssues.issues.length > 1
          ? ` ${t("exportVerify.more", { count: exportIssues.issues.length - 1 })}`
          : ""
      }`
    : null;
  const issueDetails = exportIssues
    ? formatIssues(
        exportIssues.issues,
        `Cascade ${__APP_VERSION__} export check (${exportIssues.target})`,
      )
    : null;

  const seenSaveError = useActivityRecord(
    saveStatus === "error"
      ? { tone: "error", title: t("file.saveFailed"), body: saveErrorDetail ?? undefined }
      : null,
  );
  const seenCloudSaveError = useActivityRecord(
    cloudSaveFailed
      ? { tone: "error", title: t("app.saveToAccountFailed"), body: cloudError ?? undefined }
      : null,
  );
  const seenCloudError = useActivityRecord(
    cloudError && !cloudSaveFailed ? { tone: "error", title: cloudError } : null,
  );
  const seenImportError = useActivityRecord(
    importError
      ? { tone: "error", title: importError, details: importErrorDetails ?? undefined }
      : null,
  );
  const seenExportIssues = useActivityRecord(
    exportIssues
      ? {
          tone: "warning",
          title: t("exportVerify.title", { target: exportIssues.target }),
          body: issueSummary ?? undefined,
          details: issueDetails ?? undefined,
        }
      : null,
  );

  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-[65] flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2">
      <RecoveryPrompt
        offer={recoveryOffer}
        busy={recoveryBusy}
        onRestore={() => void acceptRecoveryOffer()}
        onDismiss={dismissRecoveryOffer}
      />
      {saveStatus === "error" && (
        <Toast
          tone="error"
          title={t("file.saveFailed")}
          message={saveErrorDetail}
          resetKey={`${saveStatus}:${saveErrorDetail ?? ""}`}
          actions={[{ label: t("toast.retry"), onClick: retrySave, primary: true }]}
          onClose={seenSaveError}
          onDismiss={() => setSaveStatus(null)}
        />
      )}

      <Toast
        open={!!desktopUpdate}
        tone="info"
        message={t("update.available", { version: desktopUpdate?.version ?? "" })}
        durationMs={null}
        resetKey="desktop-update"
        actions={[
          {
            label: updating ? t("update.installing") : t("update.install"),
            onClick: applyDesktopUpdate,
            primary: true,
            disabled: updating,
            keepOpen: true,
          },
        ]}
        onDismiss={() => setDesktopUpdate(null)}
      />

      <Toast
        open={pwaUpdateReady}
        tone="info"
        message={t("app.newVersion")}
        durationMs={null}
        resetKey="pwa-update"
        actions={[
          { label: t("app.reload"), onClick: applyPendingUpdate, primary: true, keepOpen: true },
        ]}
      />

      <Toast
        open={needsSongHint && !audioFile}
        tone="info"
        icon={
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
            <SampleMapsIcon className="h-4 w-4" />
          </span>
        }
        message={t("menu.needSong")}
        durationMs={8000}
        resetKey="needs-song"
        onDismiss={() => setNeedsSongHint(false)}
      />

      <Toast
        open={cloudSaveStatus === "saving" || exporting}
        tone="progress"
        resetKey={cloudSaveStatus === "saving" ? "cloud-save" : "export"}
        message={cloudSaveStatus === "saving" ? t("app.savingToAccount") : undefined}
      >
        {cloudSaveStatus !== "saving" && (
          // Fixed width: the phase labels vary wildly in length ("Compressing
          // the .osz" vs "Encoding audio - very long filename.mp3") and a
          // shrink-to-fit toast would resize on every report.
          <span className="flex w-[17rem] flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3">
              <span>{t("app.exportingMap")}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-300/40">
                {exportProgress ? `${Math.round(exportProgress.ratio * 100)}%` : ""}
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
                style={{ width: `${Math.round((exportProgress?.ratio ?? 0) * 100)}%` }}
              />
            </span>
            {/* Reserve the line so the toast keeps its height between phases. */}
            <span className="block h-4 truncate text-[11px] leading-4 text-slate-300/40">
              {exportProgress?.label ?? ""}
            </span>
          </span>
        )}
      </Toast>

      {cloudSaveStatus === "saved" && (
        <Toast
          tone="success"
          message={t("app.savedToAccount")}
          durationMs={3000}
          resetKey="cloud-saved"
          onDismiss={() => setCloudSaveStatus(null)}
        />
      )}

      {cloudSaveFailed && (
        <Toast
          tone="error"
          title={t("app.saveToAccountFailed")}
          message={cloudError}
          resetKey={`cloud-error:${cloudError ?? ""}`}
          actions={[{ label: t("toast.retry"), onClick: retryCloudSave, primary: true }]}
          onClose={seenCloudSaveError}
          onDismiss={() => {
            setCloudError(null);
            setCloudSaveStatus(null);
          }}
        />
      )}

      <Toast
        open={!!cloudError && !cloudSaveFailed}
        tone="error"
        message={cloudError}
        resetKey={cloudError}
        onClose={seenCloudError}
        onDismiss={() => setCloudError(null)}
      />

      <Toast
        open={!!importError}
        tone="error"
        message={importError}
        details={importErrorDetails}
        resetKey={importError}
        onClose={seenImportError}
        onDismiss={() => setImportError(null)}
      />

      <Toast
        open={!!exportIssues}
        tone="warning"
        title={exportIssues ? t("exportVerify.title", { target: exportIssues.target }) : null}
        message={issueSummary}
        details={issueDetails}
        resetKey={exportIssues ? `${exportIssues.target}:${exportIssues.issues.length}` : null}
        onClose={seenExportIssues}
        onDismiss={() => setExportIssues(null)}
      >
        <p className="mt-1.5 text-xs text-slate-400">{t("exportVerify.body")}</p>
      </Toast>

      <Toast
        open={!!importNotice}
        tone="success"
        message={importNotice}
        durationMs={4000}
        resetKey={importNotice}
        onDismiss={() => setImportNotice(null)}
      />
    </div>
  );
}
