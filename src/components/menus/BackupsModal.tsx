import { useCallback, useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { useLocale } from "../../lib/i18n";
import {
  formatRecoveryTime,
  recoveryRecorder,
  type BackupReason,
  type BackupRecord,
  type BackupSummary,
  type RecoveryHead,
} from "../../lib/recovery";
import type { MessageKey } from "../../lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The open project, whose backups are listed first. */
  projectId: string;
  projectOpen: boolean;
  canEdit: boolean;
  onBackupNow: () => Promise<boolean>;
  onRestoreBackup: (record: BackupRecord) => Promise<void>;
  onRestoreUnsaved: (projectId: string) => Promise<void>;
};

const REASON_KEYS: Record<BackupReason, MessageKey> = {
  interval: "backups.reason.interval",
  manual: "backups.reason.manual",
  replaced: "backups.reason.replaced",
  "before-restore": "backups.reason.beforeRestore",
  "before-delete": "backups.reason.beforeDelete",
  "before-external-edit": "backups.reason.beforeExternalEdit",
};

type Listing = {
  unsaved: RecoveryHead[];
  here: BackupSummary[];
  elsewhere: BackupSummary[];
};

/**
 * Everything the recovery store holds: maps with work that was never saved,
 * then this map's backups, then other maps'. Restoring a backup of the open
 * map is an edit Ctrl+Z can undo; anything else opens as its own project.
 */
export function BackupsModal({
  open,
  onClose,
  projectId,
  projectOpen,
  canEdit,
  onBackupNow,
  onRestoreBackup,
  onRestoreUnsaved,
}: Props) {
  const { t, locale } = useLocale();
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const refresh = useCallback(async () => {
    const recorder = recoveryRecorder();
    if (!recorder) {
      setListing({ unsaved: [], here: [], elsewhere: [] });
      return;
    }
    const [unsaved, backups] = await Promise.all([
      recorder.unsaved().catch(() => []),
      recorder.backups().catch(() => []),
    ]);
    setListing({
      unsaved: unsaved.filter((head) => head.projectId !== projectId),
      here: backups.filter((b) => b.projectId === projectId),
      elsewhere: backups.filter((b) => b.projectId !== projectId),
    });
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setListing(null);
    setError(null);
    setBusy(null);
    void refresh();
  }, [open, refresh]);

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("recovery.restoreFailed"));
    } finally {
      setBusy(null);
    }
  };

  const restore = (summary: BackupSummary) =>
    run(summary.key, async () => {
      const record = await recoveryRecorder()?.loadBackup(summary.key);
      if (!record) throw new Error(t("recovery.restoreFailed"));
      await onRestoreBackup(record);
    });

  const backupNow = () =>
    run("backup-now", async () => {
      await onBackupNow();
      await refresh();
    });

  const remove = (summary: BackupSummary) =>
    run(`delete:${summary.key}`, async () => {
      await recoveryRecorder()?.deleteBackup(summary.key);
      await refresh();
    });

  const forget = (head: RecoveryHead) =>
    run(`forget:${head.projectId}`, async () => {
      await recoveryRecorder()?.forget(head.projectId);
      await refresh();
    });

  const name = (title: string) => title.trim() || t("app.unnamed");
  const counts = (notes: number, difficulties: number) =>
    `${t("backups.notes", { count: notes })} · ${t("backups.difficulties", { count: difficulties })}`;

  const row = (summary: BackupSummary, showTitle: boolean) => (
    <li
      key={summary.key}
      className="flex items-center gap-3 rounded-md border border-ink-700 bg-ink-800/60 px-3 py-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-200">
          {showTitle ? `${name(summary.title)} · ` : ""}
          {formatRecoveryTime(summary.createdAt, locale)}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {t(REASON_KEYS[summary.reason] ?? "backups.reason.manual")} ·{" "}
          {counts(summary.noteCount, summary.difficultyCount)}
        </span>
      </span>
      <button
        type="button"
        onClick={() => void remove(summary)}
        disabled={busy !== null}
        title={t("backups.delete")}
        aria-label={t("backups.delete")}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-base text-slate-500 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-40"
      >
        ×
      </button>
      <Button
        onClick={() => void restore(summary)}
        disabled={busy !== null || (summary.projectId === projectId && !canEdit)}
      >
        {busy === summary.key ? t("history.restoring") : t("history.restore")}
      </Button>
    </li>
  );

  return (
    <Modal open={open} title={t("backups.title")} onClose={onClose} width="max-w-lg">
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-relaxed text-slate-400">{t("backups.hint")}</p>

        {listing === null ? (
          <p className="py-6 text-center text-sm text-slate-500">{t("common.loading")}</p>
        ) : (
          <>
            {listing.unsaved.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-300/80">
                  {t("backups.unsavedTitle")}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {listing.unsaved.map((head) => (
                    <li
                      key={head.projectId}
                      className="flex items-center gap-3 rounded-md border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-200">
                          {name(head.title)}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {t("backups.lastEdited", {
                            time: formatRecoveryTime(head.updatedAt, locale),
                          })}{" "}
                          · {counts(head.noteCount, head.difficultyIds.length)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void forget(head)}
                        disabled={busy !== null}
                        title={t("backups.delete")}
                        aria-label={t("backups.delete")}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-base text-slate-500 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-40"
                      >
                        ×
                      </button>
                      <Button
                        variant="accent"
                        onClick={() =>
                          void run(`unsaved:${head.projectId}`, () =>
                            onRestoreUnsaved(head.projectId),
                          )
                        }
                        disabled={busy !== null}
                      >
                        {busy === `unsaved:${head.projectId}`
                          ? t("history.restoring")
                          : t("backups.open")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {projectOpen && (
              <section className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {t("backups.thisMap")}
                  </h3>
                  <Button onClick={() => void backupNow()} disabled={busy !== null}>
                    {t("backups.backupNow")}
                  </Button>
                </div>
                {listing.here.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-500">
                    {t("backups.empty")}
                  </p>
                ) : (
                  <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                    {listing.here.map((b) => row(b, false))}
                  </ul>
                )}
              </section>
            )}

            {listing.elsewhere.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowOthers((v) => !v)}
                  aria-expanded={showOthers}
                  className="flex items-center gap-1.5 self-start text-xs font-semibold uppercase tracking-widest text-slate-500 transition hover:text-slate-300"
                >
                  <span
                    aria-hidden
                    className={`inline-block transition-transform ${showOthers ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                  {t("backups.otherMaps", { count: listing.elsewhere.length })}
                </button>
                {showOthers && (
                  <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                    {listing.elsewhere.map((b) => row(b, true))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end pt-1">
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      </div>
    </Modal>
  );
}
