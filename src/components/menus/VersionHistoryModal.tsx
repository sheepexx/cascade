import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { useT } from "../../lib/i18n";
import {
  projectHistory,
  revealProject,
  type VaultEntry,
} from "../../lib/projectVault";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The storage key the project is mirrored under, not the raw local id. */
  storageKey: string;
  onRestore: (stamp: string) => Promise<void>;
};

/**
 * Rolls a project back to one of the autosaves kept on disk. The desktop app
 * snapshots the chart on every save, so an edit that was autosaved over is still
 * recoverable — which IndexedDB alone, holding one revision per project, cannot
 * offer.
 */
export function VersionHistoryModal({ open, onClose, storageKey, onRestore }: Props) {
  const t = useT();
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setEntries(null);
    setError(null);
    setBusy(null);
    void projectHistory(storageKey).then((found) => {
      if (live) setEntries(found);
    });
    return () => {
      live = false;
    };
  }, [open, storageKey]);

  const restore = async (stamp: string) => {
    setBusy(stamp);
    setError(null);
    try {
      await onRestore(stamp);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("history.restoreFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      title={t("history.title")}
      onClose={onClose}
      width="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-slate-400">
          {t("history.hint")}
        </p>

        {entries === null ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {t("common.loading")}
          </p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {t("history.empty")}
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
            {entries.map((entry) => (
              <li
                key={entry.stamp}
                className="flex items-center gap-3 rounded-md border border-ink-700 bg-ink-800/60 px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-200">
                    {new Date(entry.savedAt).toLocaleString()}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatBytes(entry.bytes)}
                  </span>
                </span>
                <Button
                  onClick={() => void restore(entry.stamp)}
                  disabled={busy !== null}
                >
                  {busy === entry.stamp
                    ? t("history.restoring")
                    : t("history.restore")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-between gap-2 pt-1">
          <Button onClick={() => void revealProject(storageKey)}>
            {t("history.openFolder")}
          </Button>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
