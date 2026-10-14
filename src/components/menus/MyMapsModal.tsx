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
        <ul className="skeleton-swap-in -mx-2 flex flex-col divide-y divide-white/[0.05]">
          {maps.map((m) => (
            <li
              key={m.id}
              className="group flex flex-wrap items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[0.035]"
            >
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex items-center gap-2">
                  <span className="truncate font-display text-[0.875rem] font-semibold text-slate-100">
                    {m.title || t("common.untitled")}
                  </span>
                  {user && m.owner !== user.id && (
                    <span className="rounded-sm bg-accent/15 px-1 text-[10px] font-semibold text-accent-soft">
                      {t("myMaps.shared")}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-400">
                  {m.artist}
                  {m.creator ? ` · ${t("myMaps.mappedBy", { name: m.creator })}` : ""}
                </div>
                <div className="mt-0.5 text-2xs text-slate-500">
                  {t("packBrowser.savedOn", { date: new Date(m.updated_at).toLocaleString() })}
                </div>
              </div>
              {/* Kept together so the pair wraps below the details on a phone
                  instead of squeezing the title down to a few characters. */}
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onSelect(m.id)}
                  disabled={busyId !== null}
                >
                  {t("common.open")}
                </Button>
                {user && m.owner === user.id && (
                  <Button
                    size="sm"
                    className="hover:!bg-rose-500/15 hover:!text-rose-300"
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
