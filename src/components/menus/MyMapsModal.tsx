import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { HoldConfirmDialog } from "../ui/HoldConfirmDialog";
import { SkeletonRows } from "../ui/Skeleton";
import { useAuth } from "../../lib/auth";
import {
  listProjectsCloud,
  deleteProjectCloud,
  type CloudProjectSummary,
} from "../../lib/cloud";
import { MENU_ACCENTS } from "../../lib/menuTheme";
import { useT } from "../../lib/i18n";

export function MyMapsModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const [maps, setMaps] = useState<CloudProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmId(null);
      return;
    }
    let cancelled = false;
    setMaps(null);
    setError(null);
    listProjectsCloud()
      .then((rows) => {
        if (!cancelled) setMaps(rows);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : t("myMaps.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteProjectCloud(id);
      setMaps((prev) => prev?.filter((m) => m.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("myMaps.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
    <Modal open={open} title={t("menu.myMaps")} onClose={onClose} width="max-w-2xl" accent={MENU_ACCENTS.myMaps}>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!maps && !error && (
        <SkeletonRows count={3} lines={3} label={t("myMaps.loading")} />
      )}
      {maps && maps.length === 0 && (
        <p className="text-sm text-slate-400">
          {t("myMaps.empty")}
        </p>
      )}
      {maps && maps.length > 0 && (
        <ul className="skeleton-swap-in flex flex-col gap-2">
          {maps.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-500/60 bg-ink-700/40 p-3"
            >
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-100">
                    {m.title || t("common.untitled")}
                  </span>
                  {user && m.owner !== user.id && (
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {t("myMaps.shared")}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-400">
                  {m.artist}
                  {m.creator ? ` · ${t("myMaps.mappedBy", { name: m.creator })}` : ""}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {t("packBrowser.savedOn", { date: new Date(m.updated_at).toLocaleString() })}
                </div>
              </div>
              {/* Kept together so the pair wraps below the details on a phone
                  instead of squeezing the title down to a few characters. */}
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="accent"
                  onClick={() => onSelect(m.id)}
                  disabled={busyId !== null}
                >
                  {t("common.open")}
                </Button>
                {user && m.owner === user.id && (
                  <Button
                    onClick={() => setConfirmId(m.id)}
                    disabled={busyId !== null}
                    title={t("myMaps.deleteHint")}
                  >
                    {busyId === m.id ? "…" : t("common.delete")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>

    <HoldConfirmDialog
      open={confirmId !== null}
      title={t("myMaps.deleteTitle")}
      message={t("myMaps.deleteBody")}
      busy={busyId !== null}
      onConfirm={() => {
        const id = confirmId;
        setConfirmId(null);
        if (id) void handleDelete(id);
      }}
      onCancel={() => setConfirmId(null)}
    />
    </>
  );
}
