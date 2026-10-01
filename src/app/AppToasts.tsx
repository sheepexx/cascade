import type { Dispatch, SetStateAction } from "react";
import { RecoveryPrompt } from "../components/RecoveryPrompt";
import { SampleMapsIcon } from "../components/ui/StartIcons";
import { TimedNotification } from "../components/ui/TimedNotification";
import type { DesktopUpdate } from "../lib/desktopUpdate";
import { useT } from "../lib/i18n";
import type { ProgressReport } from "../lib/progress";
import type { RecoveryHead } from "../lib/recovery";
import type { RoundTripIssue } from "../lib/roundTrip";
import { formatIssues } from "../lib/roundTrip";
import type { LoadedFile } from "../types";

/**
 * The stack of notices at the bottom of the window: unsaved work to restore,
 * save and export progress and failures, import results, the export check,
 * the reminder to add a song, and app updates.
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
  importNotice,
  needsSongHint,
  pwaUpdateReady,
  recoveryBusy,
  recoveryOffer,
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
  importNotice: string | null;
  needsSongHint: boolean;
  pwaUpdateReady: boolean;
  recoveryBusy: boolean;
  recoveryOffer: RecoveryHead | null;
  saveErrorDetail: string | null;
  saveStatus: "saving" | "saved" | "error" | null;
  setCloudError: Dispatch<SetStateAction<string | null>>;
  setCloudSaveStatus: Dispatch<SetStateAction<"saving" | "saved" | "error" | null>>;
  setDesktopUpdate: Dispatch<SetStateAction<DesktopUpdate | null>>;
  setExportIssues: Dispatch<SetStateAction<{ target: string; issues: RoundTripIssue[]; } | null>>;
  setImportError: Dispatch<SetStateAction<string | null>>;
  setImportNotice: Dispatch<SetStateAction<string | null>>;
  setNeedsSongHint: Dispatch<SetStateAction<boolean>>;
  setSaveStatus: Dispatch<SetStateAction<"saving" | "saved" | "error" | null>>;
  updating: boolean;
}) {
  const t = useT();
  return (
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
  );
}
