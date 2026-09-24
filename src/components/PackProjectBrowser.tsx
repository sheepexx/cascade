import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Controls";
import { useAuth } from "../lib/auth";
import {
  listLocalProjects,
  loadProject,
  type LocalProjectSummary,
} from "../lib/persistence";
import {
  listMyProjectsRich,
  loadProjectCloud,
  signedThumbUrls,
  type CloudProjectRich,
} from "../lib/cloud";
import { buildOsz } from "../lib/oszExport";
import { sanitizePackFilename } from "../lib/packCreator";
import { normalizeTimingPoints, type LoadedFile } from "../types";
import { SampleMapsIcon } from "./ui/StartIcons";
import { AsyncImage, SkeletonCards } from "./ui/Skeleton";
import { useT } from "../lib/i18n";
import { t as tr } from "../lib/i18n/core";

type SelectionKey = string;

function toRegistry(
  files: { name: string; blob: Blob }[] | undefined,
): Record<string, LoadedFile> {
  const out: Record<string, LoadedFile> = {};
  for (const f of files ?? []) out[f.name] = { name: f.name, url: "", blob: f.blob };
  return out;
}

async function localProjectToFile(id: string, cascadeTag: boolean): Promise<File> {
  const saved = await loadProject(id);
  if (!saved) throw new Error(tr("packBrowser.localFailed"));
  const audioFiles = toRegistry(saved.audioFiles);
  if (!Object.keys(audioFiles).length && saved.audio)
    audioFiles[saved.audio.name] = {
      name: saved.audio.name,
      url: "",
      blob: saved.audio.blob,
    };
  const bgFiles = toRegistry(saved.backgroundFiles);
  if (!Object.keys(bgFiles).length && saved.background)
    bgFiles[saved.background.name] = {
      name: saved.background.name,
      url: "",
      blob: saved.background.blob,
    };
  const blob = await buildOsz({
    meta: saved.meta,
    difficulties: saved.difficulties.map((d) => ({
      ...d,
      timingPoints: normalizeTimingPoints(d.timingPoints ?? []),
    })),
    timingPoints: normalizeTimingPoints(saved.timingPoints),
    audioFiles,
    bgFiles,
    videoFiles: toRegistry(saved.videoFiles),
    cascadeTag,
  });
  return new File(
    [blob],
    `${sanitizePackFilename(saved.meta.title || tr("packBrowser.localProject"))}.osz`,
  );
}

async function cloudProjectToFile(id: string, cascadeTag: boolean): Promise<File> {
  const proj = await loadProjectCloud(id);
  const blob = await buildOsz({
    meta: proj.data.meta,
    difficulties: proj.data.difficulties.map((d) => ({
      ...d,
      timingPoints: normalizeTimingPoints(d.timingPoints ?? []),
    })),
    timingPoints: normalizeTimingPoints(proj.data.timingPoints),
    audioFiles: toRegistry(proj.audio),
    bgFiles: toRegistry(proj.bg),
    cascadeTag,
  });
  return new File(
    [blob],
    `${sanitizePackFilename(proj.data.meta.title || tr("packBrowser.cloudProject"))}.osz`,
  );
}

export function PackProjectBrowser({
  open,
  onClose,
  onAdd,
  cascadeTag = true,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (files: File[]) => Promise<void> | void;
  cascadeTag?: boolean;
}) {
  const t = useT();
  const { user, login } = useAuth();
  const [localProjects, setLocalProjects] = useState<LocalProjectSummary[] | null>(null);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRich[] | null>(null);
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});
  const [cloudThumbs, setCloudThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setError(null);
      return;
    }
    let cancelled = false;
    setLocalProjects(null);
    listLocalProjects()
      .then((rows) => {
        if (!cancelled) setLocalProjects(rows);
      })
      .catch(() => {
        if (!cancelled) setLocalProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!localProjects) return;
    const made: Record<string, string> = {};
    for (const p of localProjects)
      if (p.backgroundBlob) made[p.id] = URL.createObjectURL(p.backgroundBlob);
    setLocalThumbs(made);
    return () => Object.values(made).forEach((u) => URL.revokeObjectURL(u));
  }, [localProjects]);

  useEffect(() => {
    if (!open || !user) {
      setCloudProjects(null);
      setCloudThumbs({});
      return;
    }
    let cancelled = false;
    listMyProjectsRich()
      .then(async (rows) => {
        if (cancelled) return;
        setCloudProjects(rows);
        try {
          const urls = await signedThumbUrls(
            rows.map((r) => r.bg_path).filter((p): p is string => !!p),
          );
          if (!cancelled) setCloudThumbs(urls);
        } catch {
        }
      })
      .catch(() => {
        if (!cancelled) setCloudProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const toggle = (key: SelectionKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addSelected = async () => {
    setAdding(true);
    setError(null);
    try {
      const files: File[] = [];
      for (const key of selected) {
        const [scope, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        files.push(
          scope === "local"
            ? await localProjectToFile(id, cascadeTag)
            : await cloudProjectToFile(id, cascadeTag),
        );
      }
      await onAdd(files);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("packBrowser.addFailed"),
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("pack.browse")}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={adding}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="accent"
            onClick={() => void addSelected()}
            disabled={adding || selected.size === 0}
          >
            {adding
              ? t("packBrowser.adding")
              : selected.size
                ? t("packBrowser.addCount", { count: selected.size })
                : t("packBrowser.add")}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-xs text-slate-500">
        {t("packBrowser.hint")}
      </p>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

      <BrowserSection title={t("packBrowser.local")} hint={t("packBrowser.localHint")}>
        {localProjects === null ? (
          <SkeletonCards count={3} label={t("packBrowser.loadingLocal")} />
        ) : localProjects.length === 0 ? (
          <p className="text-sm text-slate-500">{t("packBrowser.noLocal")}</p>
        ) : (
          <div className="skeleton-swap-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {localProjects.map((p) => (
              <SelectableCard
                key={p.id}
                selected={selected.has(`local:${p.id}`)}
                title={p.title || t("common.untitled")}
                subtitle={[p.artist, p.creator].filter(Boolean).join(" · ")}
                note={t("packBrowser.diffs", { count: p.difficultyCount })}
                thumbUrl={localThumbs[p.id]}
                thumbPending={!!p.backgroundBlob && !localThumbs[p.id]}
                disabled={adding}
                onToggle={() => toggle(`local:${p.id}`)}
              />
            ))}
          </div>
        )}
      </BrowserSection>

      <BrowserSection title={t("packBrowser.cloud")} hint={t("packBrowser.cloudHint")}>
        {!user ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 px-4 py-3">
            <span className="text-sm text-slate-400">
              {t("packBrowser.loginHint")}
            </span>
            <Button variant="accent" onClick={login} className="whitespace-nowrap">
              {t("startModal.loginWithOsu")}
            </Button>
          </div>
        ) : cloudProjects === null ? (
          <SkeletonCards count={3} label={t("packBrowser.loadingCloud")} />
        ) : cloudProjects.length === 0 ? (
          <p className="text-sm text-slate-500">{t("packBrowser.noCloud")}</p>
        ) : (
          <div className="skeleton-swap-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cloudProjects.map((p) => (
              <SelectableCard
                key={p.id}
                selected={selected.has(`cloud:${p.id}`)}
                title={p.title || t("common.untitled")}
                subtitle={[p.artist, p.creator].filter(Boolean).join(" · ")}
                note={t("packBrowser.savedOn", { date: new Date(p.updated_at).toLocaleDateString() })}
                thumbUrl={p.bg_path ? cloudThumbs[p.bg_path] : undefined}
                thumbPending={!!p.bg_path && !cloudThumbs[p.bg_path]}
                disabled={adding}
                onToggle={() => toggle(`cloud:${p.id}`)}
              />
            ))}
          </div>
        )}
      </BrowserSection>
    </Modal>
  );
}

function BrowserSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-2 [&+&]:mt-6">
      <div className="mb-3 flex items-baseline gap-2 border-b border-white/10 pb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          {title}
        </h3>
        {hint && <span className="ml-auto text-[11px] text-slate-500">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function SelectableCard({
  selected,
  title,
  subtitle,
  note,
  thumbUrl,
  thumbPending,
  disabled,
  onToggle,
}: {
  selected: boolean;
  title: string;
  subtitle?: string;
  note?: string;
  thumbUrl?: string;
  thumbPending?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-emerald-400/80 bg-emerald-400/10"
          : "border-ink-500/60 bg-ink-700/40 hover:border-accent/70 hover:bg-ink-700"
      }`}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-600">
        <AsyncImage
          src={thumbUrl}
          pending={thumbPending}
          className="h-full w-full object-cover"
          fallback={
            <div className="grid h-full w-full place-items-center text-slate-600">
              <SampleMapsIcon className="h-8 w-8" />
            </div>
          }
        />
        {selected && (
          <span className="absolute right-2 top-2 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
            {t("packBrowser.selected")} ✓
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
        {subtitle && (
          <div className="truncate text-xs text-slate-400">{subtitle}</div>
        )}
        {note && <div className="truncate text-[11px] text-slate-500">{note}</div>}
      </div>
    </button>
  );
}
