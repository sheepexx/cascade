import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PACK_METADATA,
  DEFAULT_PACK_SETTINGS,
  PLACEHOLDER_VERSION,
  VARIOUS_ARTISTS,
  type PackArtistMode,
  type PackCreatorFieldMode,
  type PackItem,
  type PackMetadata,
  type PackCreatorSettings,
  type PackValidationResult,
} from "../types/packCreator";
import {
  artistFieldFor,
  buildPack,
  generatePackDifficultyName,
  importOszForPack,
  packOszFilename,
  sanitizePackFilename,
  validatePack,
} from "../lib/packCreator";
import { triggerDownload } from "../lib/osuExport";
import {
  packSongToOszFile,
  scanPackFromDrop,
  scanPackFromZip,
} from "../lib/smPackImport";
import { MAX_KEYS, MIN_KEYS } from "../types";
import { Button, Field, TextInput, Toggle } from "./ui/Controls";
import { PackCreatorItem } from "./PackCreatorItem";
import { PackCreatorValidation } from "./PackCreatorValidation";
import { PackProjectBrowser } from "./PackProjectBrowser";
import { FolderIcon, PackageIcon } from "./ui/StartIcons";
import { MarqueeText } from "./ui/MarqueeText";
import { playUiSound } from "../lib/uiSounds";
import { useAuth } from "../lib/auth";
import { logAnalyticsEvent } from "../lib/analytics";

const selectClass =
  "w-full rounded-lg bg-ink-700/65 border border-white/10 px-3 py-2 text-sm text-slate-100 " +
  "outline-none shadow-inner shadow-black/10 backdrop-blur-sm transition focus:border-accent/70";

const EXIT_MS = 220;

function StepHeader({ n, label }: { n: number; label: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5 px-0.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent-soft">
        {n}
      </span>
      <h3 className="text-sm font-semibold text-slate-100">{label}</h3>
    </div>
  );
}

function Panel({
  title,
  badge,
  right,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/70 p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          {title}
        </h3>
        {badge}
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

export function PackCreator({
  open,
  onClose,
  jpegQuality,
}: {
  open: boolean;
  onClose: () => void;
  jpegQuality?: number;
}) {
  const { user } = useAuth();
  const [metadata, setMetadata] = useState<PackMetadata>(DEFAULT_PACK_METADATA);
  const [settings, setSettings] = useState<PackCreatorSettings>(
    DEFAULT_PACK_SETTINGS,
  );
  const [tagsText, setTagsText] = useState("");
  const [items, setItems] = useState<PackItem[]>([]);
  const [excluded, setExcluded] = useState<PackItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importProblems, setImportProblems] = useState<string[]>([]);
  const [validation, setValidation] = useState<PackValidationResult | null>(
    null,
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const dragDepthRef = useRef(0);

  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!open || !user?.username) return;
    setMetadata((m) => (m.creator.trim() ? m : { ...m, creator: user.username }));
  }, [open, user]);

  useEffect(() => {
    if (!open || browseOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, browseOpen, onClose]);

  const importInputs = useCallback(
    async (inputs: { file: File; sourceLabel?: string }[]) => {
      if (!inputs.length) return;
      setImporting(true);
      const problems: string[] = [];
      try {
        for (const { file, sourceLabel } of inputs) {
          const label = sourceLabel ?? file.name;
          try {
            const res = await importOszForPack(file, sourceLabel);
            problems.push(...res.problems);
            if (res.nonManiaItems.length)
              problems.push(
                `${label}: ${res.nonManiaItems.length} non-mania difficult${
                  res.nonManiaItems.length === 1 ? "y" : "ies"
                } skipped (include below if wanted).`,
              );
            setItems((prev) => [...prev, ...res.items]);
            setExcluded((prev) => [...prev, ...res.nonManiaItems]);
            if (res.items.length) {
              setSelectedId((cur) => cur ?? res.items[0].id);
              setSettings((s) =>
                s.placeholderAudioItemId
                  ? s
                  : { ...s, placeholderAudioItemId: res.items[0].id },
              );
            }
          } catch (err) {
            problems.push(
              err instanceof Error ? err.message : `Failed to import ${label}.`,
            );
          }
        }
      } finally {
        setImporting(false);
        setImportProblems((prev) => [...prev, ...problems]);
        setValidation(null);
      }
    },
    [],
  );

  const importFiles = useCallback(
    (files: File[]) =>
      importInputs(
        files
          .filter((f) => /\.(osz|zip)$/i.test(f.name))
          .map((file) => ({ file })),
      ),
    [importInputs],
  );

  const updateItem = useCallback((id: string, patch: Partial<PackItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        next.finalDifficultyName = generatePackDifficultyName(next);
        return next;
      }),
    );
    setValidation(null);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setSettings((s) =>
      s.placeholderAudioItemId === id ? { ...s, placeholderAudioItemId: null } : s,
    );
    setValidation(null);
  }, []);

  const includeExcluded = useCallback((id: string) => {
    setExcluded((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item) setItems((cur) => [...cur, item]);
      return prev.filter((it) => it.id !== id);
    });
    setValidation(null);
  }, []);

  const runValidation = useCallback(() => {
    const result = validatePack({ metadata, items, settings });
    setValidation(result);
    return result;
  }, [metadata, items, settings]);

  const exportPack = useCallback(async () => {
    const result = runValidation();
    if (result.errors.length > 0) return;
    setExporting(true);
    try {
      const { blob, filename } = await buildPack({
        metadata,
        items,
        settings,
        jpegQuality,
      });
      triggerDownload(blob, filename);
      playUiSound("mapExportDone");
      void logAnalyticsEvent("pack_export", user?.id).catch(() => {});
    } catch (err) {
      setValidation({
        errors: [
          err instanceof Error ? `Export failed: ${err.message}` : "Export failed.",
        ],
        warnings: [],
      });
    } finally {
      setExporting(false);
    }
  }, [runValidation, metadata, items, settings, jpegQuality]);

  const selected = items.find((it) => it.id === selectedId) ?? null;
  const placeholderItem =
    items.find((it) => it.id === settings.placeholderAudioItemId) ?? null;

  const placeholderFilename = useMemo(() => {
    const artist = placeholderItem
      ? artistFieldFor(metadata, placeholderItem)
      : VARIOUS_ARTISTS;
    return `${sanitizePackFilename(artist)} - ${sanitizePackFilename(
      metadata.title || "Pack Title",
    )} (${sanitizePackFilename(
      metadata.creator || "Creator",
    )}) [${sanitizePackFilename(PLACEHOLDER_VERSION)}].osu`;
  }, [metadata, placeholderItem]);

  const importDropped = useCallback(
    async (entries: FileSystemEntry[], files: File[]) => {
      const hasFolder = entries.some((en) => en.isDirectory);
      const hasZip = files.some((f) => /\.zip$/i.test(f.name));
      if (!hasFolder && !hasZip) {
        void importFiles(files);
        return;
      }
      setImporting(true);
      try {
        const inputs: { file: File; sourceLabel?: string }[] = [];
        if (hasFolder) {
          for (const song of await scanPackFromDrop(entries)) {
            inputs.push({
              file: await packSongToOszFile(song),
              sourceLabel: song.info.sourceSmName,
            });
          }
        }
        for (const file of files) {
          if (/\.zip$/i.test(file.name)) {
            const songs = await scanPackFromZip(file);
            if (songs.length) {
              for (const song of songs) {
                inputs.push({
                  file: await packSongToOszFile(song),
                  sourceLabel: song.info.sourceSmName,
                });
              }
              continue;
            }
          }
          if (/\.(osz|zip)$/i.test(file.name)) inputs.push({ file });
        }
        if (inputs.length) await importInputs(inputs);
        else
          setImportProblems((prev) => [
            ...prev,
            "No osu! or StepMania/Etterna maps found in the drop.",
          ]);
      } catch (err) {
        setImportProblems((prev) => [
          ...prev,
          err instanceof Error ? err.message : "Failed to read the drop.",
        ]);
      } finally {
        setImporting(false);
      }
    },
    [importFiles, importInputs],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    const entries = e.dataTransfer.items?.length
      ? Array.from(e.dataTransfer.items)
          .map((item) => item.webkitGetAsEntry())
          .filter((entry): entry is FileSystemEntry => !!entry)
      : [];
    void importDropped(entries, Array.from(e.dataTransfer.files));
  };

  if (!mounted) return null;

  const advancedActive =
    metadata.artistMode !== "various" ||
    settings.creatorFieldMode !== "pack-append-mapper";

  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col bg-ink-900 ${
        closing ? "pointer-events-none modal-backdrop-out" : "modal-backdrop-in"
      }`}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
      }}
      onDrop={onDrop}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          closing ? "modal-panel-out" : "modal-panel-in"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-white/10 bg-ink-800/80 px-4 py-2.5">
          <Button variant="ghost" onClick={onClose} className="shrink-0">
            ← Back
          </Button>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-100">
              Pack Creator
            </h2>
            <p className="truncate text-[11px] text-slate-500">
              Combine multiple mania maps into one .osz pack
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4">
          <section className="flex min-h-0 w-[330px] shrink-0 flex-col">
            <StepHeader n={1} label="Add maps" />
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 pr-1">
            <div className="grid grid-cols-2 gap-2">
              <label
                onClick={(e) => {
                  if (!(e.target instanceof HTMLInputElement))
                    playUiSound("click");
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition ${
                  dragActive
                    ? "border-accent/80 bg-accent/10"
                    : "border-ink-500/70 bg-ink-800/60 hover:border-accent/50"
                }`}
              >
                <PackageIcon className="h-5 w-5 text-slate-300" />
                <span className="text-xs font-semibold text-slate-100">
                  {importing ? "Importing…" : "Import .osz"}
                </span>
                <span className="text-[10px] text-slate-500">
                  or drop files anywhere
                </span>
                <input
                  type="file"
                  accept=".osz,.zip,application/zip"
                  multiple
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => {
                    void importFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setBrowseOpen(true)}
                disabled={importing}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-ink-500/70 bg-ink-800/60 px-3 py-4 text-center transition hover:border-accent/50 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FolderIcon className="h-5 w-5 text-slate-300" />
                <span className="text-xs font-semibold text-slate-100">
                  Browse Projects
                </span>
                <span className="text-[10px] text-slate-500">
                  local &amp; cloud saves
                </span>
              </button>
            </div>

            {importProblems.length > 0 && (
              <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-2.5">
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-amber-100/90">
                  {importProblems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setImportProblems([])}
                  className="mt-1 text-[11px] text-amber-300 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            <Panel
              title="Imported maps"
              badge={
                <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-ink-600 px-1.5 text-[10px] font-semibold text-slate-300">
                  {items.length}
                </span>
              }
            >
              {items.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nothing here yet. Import .osz files or browse your projects
                  above; every difficulty becomes one entry in the pack.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {items.map((item) => (
                    <li key={item.id}>
                      <div
                        className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                          item.id === selectedId
                            ? "border-accent/70 bg-accent/10"
                            : "border-white/10 bg-ink-700/40 hover:bg-ink-700"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <MarqueeText
                            text={
                              generatePackDifficultyName(item) ||
                              item.originalTitle ||
                              item.originalOsuFilename
                            }
                            className="text-xs font-semibold text-slate-100"
                          />
                          <span className="block truncate text-[11px] text-slate-500">
                            {item.originalArtist} · {item.originalCreator} ·{" "}
                            {item.parsedOsu.keyCount}K
                            {item.nonMania ? " · not mania" : ""}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Remove from pack"
                          onClick={() => removeItem(item.id)}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-300 opacity-40 transition hover:bg-rose-600/80 hover:text-white group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {excluded.length > 0 && (
              <Panel title="Skipped (not mania)">
                <ul className="flex flex-col gap-1.5">
                  {excluded.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-slate-200">
                          {item.originalTitle} [{item.originalVersion}]
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          mode {item.parsedOsu.mode} · {item.sourceFileName}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => includeExcluded(item.id)}
                        className="shrink-0 rounded-md border border-amber-400/40 px-2 py-1 text-[11px] font-medium text-amber-200 transition hover:bg-amber-400/15"
                      >
                        Include anyway
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            </div>
          </section>

          <section className="flex min-h-0 w-[330px] shrink-0 flex-col">
            <StepHeader n={2} label="Set up the pack" />
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 pr-1">
            <Panel title="Basics">
              <div className="flex flex-col gap-3">
                <Field label="Pack title">
                  <TextInput
                    value={metadata.title}
                    onChange={(e) => {
                      setMetadata((m) => ({ ...m, title: e.target.value }));
                      setValidation(null);
                    }}
                    placeholder="e.g. Jumpstream Collection"
                  />
                </Field>
                <Field label="Pack creator">
                  <TextInput
                    value={metadata.creator}
                    onChange={(e) => {
                      setMetadata((m) => ({ ...m, creator: e.target.value }));
                      setValidation(null);
                    }}
                    placeholder="your name"
                  />
                </Field>
                <Field label="Tags" hint="space-separated; added to every difficulty">
                  <TextInput
                    value={tagsText}
                    onChange={(e) => {
                      setTagsText(e.target.value);
                      setMetadata((m) => ({
                        ...m,
                        tags: e.target.value.split(/\s+/).filter(Boolean),
                      }));
                    }}
                    placeholder="e.g. pack jumpstream dump"
                  />
                </Field>
                <p className="text-[11px] text-slate-500">
                  Every difficulty exports with this shared title and creator.
                  Artist defaults to{" "}
                  <span className="text-slate-300">Various Artists</span>.
                </p>
              </div>
            </Panel>

            <Panel
              title="Advanced"
              badge={
                advancedActive ? (
                  <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-soft">
                    modified
                  </span>
                ) : undefined
              }
              right={
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-[11px] text-slate-400 transition hover:text-slate-200"
                >
                  {showAdvanced ? "Hide ▲" : "Show ▼"}
                </button>
              }
            >
              {!showAdvanced ? (
                <p className="text-xs text-slate-500">
                  Artist and Creator field modes, unicode title, source.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <Field
                    label="Artist field mode"
                    hint="How the exported Artist field is filled."
                  >
                    <select
                      className={selectClass}
                      value={metadata.artistMode}
                      onChange={(e) => {
                        setMetadata((m) => ({
                          ...m,
                          artistMode: e.target.value as PackArtistMode,
                        }));
                        setValidation(null);
                      }}
                    >
                      <option value="various">
                        Various Artists for all difficulties (recommended)
                      </option>
                      <option value="original-per-map">
                        Keep original artist per map
                      </option>
                      <option value="custom-shared">Custom shared artist</option>
                    </select>
                  </Field>
                  {metadata.artistMode === "custom-shared" && (
                    <Field label="Custom shared artist">
                      <TextInput
                        value={metadata.customSharedArtist ?? ""}
                        onChange={(e) =>
                          setMetadata((m) => ({
                            ...m,
                            customSharedArtist: e.target.value || undefined,
                          }))
                        }
                      />
                    </Field>
                  )}
                  {metadata.artistMode !== "various" && (
                    <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                      Changing artist metadata may make the pack less consistent
                      or unsuitable for upload.
                    </p>
                  )}

                  <Field
                    label="Creator field mode"
                    hint="How the exported Creator field is filled."
                  >
                    <select
                      className={selectClass}
                      value={settings.creatorFieldMode}
                      onChange={(e) => {
                        setSettings((s) => ({
                          ...s,
                          creatorFieldMode: e.target
                            .value as PackCreatorFieldMode,
                        }));
                        setValidation(null);
                      }}
                    >
                      <option value="pack-append-mapper">
                        Pack creator + mapper in difficulty name (recommended)
                      </option>
                      <option value="pack">
                        Pack creator for all difficulties
                      </option>
                      <option value="original">
                        Original mapper per difficulty
                      </option>
                    </select>
                  </Field>
                  {settings.creatorFieldMode === "original" && (
                    <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                      Using the original mapper in the Creator field may make the
                      pack unsuitable for official upload/submission.
                    </p>
                  )}

                  <Field label="Pack title unicode (optional)">
                    <TextInput
                      value={metadata.titleUnicode ?? ""}
                      onChange={(e) =>
                        setMetadata((m) => ({
                          ...m,
                          titleUnicode: e.target.value || undefined,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Source (optional)">
                    <TextInput
                      value={metadata.source ?? ""}
                      onChange={(e) =>
                        setMetadata((m) => ({
                          ...m,
                          source: e.target.value || undefined,
                        }))
                      }
                    />
                  </Field>
                  <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
                    Append original artist / mapper / tags to Tags
                    <Toggle
                      size="sm"
                      checked={settings.keepOriginalTags}
                      onChange={(v) =>
                        setSettings((s) => ({ ...s, keepOriginalTags: v }))
                      }
                    />
                  </label>
                </div>
              )}
            </Panel>

            <Panel
              title="Thumbnail difficulty"
              badge={
                <code className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                  &lt;Delete
                </code>
              }
              right={
                <Toggle
                  size="sm"
                  checked={settings.placeholderEnabled}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, placeholderEnabled: v }))
                  }
                  aria-label="Add a <Delete placeholder difficulty"
                />
              }
            >
              {settings.placeholderEnabled ? (
                <div className="flex flex-col gap-2.5">
                  <Field label="Audio source">
                    <select
                      className={selectClass}
                      value={settings.placeholderAudioItemId ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          placeholderAudioItemId: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">(select a song)</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.songDisplayName || it.originalTitle} ·{" "}
                          {it.originalAudioFilename}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Key count (${MIN_KEYS}-${MAX_KEYS})`}>
                    <TextInput
                      type="number"
                      min={MIN_KEYS}
                      max={MAX_KEYS}
                      value={settings.placeholderKeyCount}
                      onChange={(e) => {
                        const v = Math.round(Number(e.target.value));
                        setSettings((s) => ({
                          ...s,
                          placeholderKeyCount: Number.isFinite(v) ? v : 4,
                        }));
                        setValidation(null);
                      }}
                      className="w-24"
                    />
                  </Field>
                  <p className="break-all text-[11px] text-slate-500">
                    {placeholderFilename}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    This creates a minimal &lt;Delete difficulty with two notes. It
                    is intended as a local pack helper.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Off. Enable to add a minimal placeholder difficulty (two
                  notes) that acts as the pack's thumbnail entry.
                </p>
              )}
            </Panel>
            </div>
          </section>

          <section className="flex min-h-0 min-w-[340px] flex-1 flex-col">
            <StepHeader n={3} label="Review & export" />
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 pr-1">
            <Panel title="Selected map">
              {selected ? (
                <PackCreatorItem
                  item={selected}
                  onChange={(patch) => updateItem(selected.id, patch)}
                  onRemove={() => removeItem(selected.id)}
                />
              ) : (
                <p className="text-xs text-slate-500">
                  {items.length === 0
                    ? "Add some maps in step 1, then review each one here."
                    : "Select a map in step 1 to review its difficulty naming."}
                </p>
              )}
            </Panel>

            <Panel title="Validation">
              <PackCreatorValidation result={validation} />
            </Panel>
            </div>

            <div className="mt-3 shrink-0 rounded-xl border border-white/10 bg-ink-800 p-3.5">
              <div className="mb-2.5 flex items-baseline justify-between gap-3 text-xs">
                <span className="shrink-0 font-medium text-slate-300">
                  {items.length} map{items.length === 1 ? "" : "s"}
                  {settings.placeholderEnabled && items.length > 0
                    ? " + thumbnail"
                    : ""}
                </span>
                <span
                  className="truncate text-slate-500"
                  title={packOszFilename(metadata)}
                >
                  {items.length > 0 ? packOszFilename(metadata) : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={runValidation}
                  disabled={importing || items.length === 0}
                >
                  Validate
                </Button>
                <Button
                  variant="accent"
                  className="flex-1"
                  onClick={() => void exportPack()}
                  disabled={exporting || importing || items.length === 0}
                >
                  {exporting ? "Exporting…" : "Export .osz"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <PackProjectBrowser
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onAdd={(files) => importFiles(files)}
      />
    </div>
  );
}
