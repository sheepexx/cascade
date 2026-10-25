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
import { prepareExport, saveExport } from "../lib/exportDestination";
import {
  packSongToOszFile,
  scanPackFromDrop,
  scanPackFromZip,
} from "../lib/smPackImport";
import { MAX_KEYS, MIN_KEYS } from "../types";
import { Button, Field, TextInput, Toggle } from "./ui/Controls";
import { buttonClass } from "./ui/buttonStyles";
import { Dropdown } from "./ui/Dropdown";
import { ChevronDownIcon, CloseIcon, ErrorIcon, WarningIcon } from "./ui/Icons";
import { PackCreatorItem } from "./PackCreatorItem";
import { PackCreatorValidation } from "./PackCreatorValidation";
import { PackProjectBrowser } from "./PackProjectBrowser";
import { FolderIcon, PackageIcon } from "./ui/StartIcons";
import { MarqueeText } from "./ui/MarqueeText";
import { playUiSound } from "../lib/uiSounds";
import { useAuth } from "../lib/auth";
import { logAnalyticsEvent } from "../lib/analytics";
import type { ProgressReport } from "../lib/progress";
import { MOTION } from "../lib/motion";
import { MENU_ACCENTS } from "../lib/menuTheme";
import { useT } from "../lib/i18n";
import { usePhoneViewport } from "../hooks/usePhoneViewport";

const EXIT_MS = MOTION.exit;

/** A column's title in the tool: what this area is for. */
function AreaHeader({
  label,
  right,
}: {
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-4">
      <h3 className="font-display text-[0.875rem] font-semibold text-slate-100">{label}</h3>
      {right}
    </div>
  );
}

/** A group of fields inside a column, divided from the next by a hairline. */
function Group({
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
    <section className="border-t border-white/[0.06] px-4 py-4 first:border-t-0">
      <div className="mb-3 flex min-h-[1.25rem] items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-300">{title}</h4>
        {badge}
        {right && <span className="ml-auto flex items-center">{right}</span>}
      </div>
      {children}
    </section>
  );
}

/** A caution under a field, for a choice that may make a pack unrankable. */
function Caution({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 text-xs leading-relaxed text-amber-200/90">
      <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
      <span>{children}</span>
    </p>
  );
}

export function PackCreator({
  open,
  onClose,
  jpegQuality,
  cascadeTag = true,
}: {
  open: boolean;
  onClose: () => void;
  jpegQuality?: number;
  /** Adds "Cascade" to the tags of maps the pack builds or converts. */
  cascadeTag?: boolean;
}) {
  const t = useT();
  const phone = usePhoneViewport();
  const [phoneTab, setPhoneTab] = useState<"maps" | "map" | "settings">("maps");
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
  const [exportProgress, setExportProgress] = useState<ProgressReport | null>(
    null,
  );
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
                `${label}: ${t("pack.nonManiaSkipped", { count: res.nonManiaItems.length })}`,
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
              err instanceof Error ? err.message : t("import.failed", { name: label }),
            );
          }
        }
      } finally {
        setImporting(false);
        setImportProblems((prev) => [...prev, ...problems]);
        setValidation(null);
      }
    },
    [t],
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
    const target = prepareExport();
    setExporting(true);
    setExportProgress({ ratio: 0, label: t("pack.collecting") });
    try {
      const { blob, filename } = await buildPack({
        metadata,
        items,
        settings,
        jpegQuality,
        cascadeTag,
        onProgress: setExportProgress,
      });
      await saveExport(blob, filename, target);
      playUiSound("mapExportDone");
      void logAnalyticsEvent("pack_export", user?.id).catch(() => {});
    } catch (err) {
      setValidation({
        errors: [
          err instanceof Error ? t("pack.exportFailedDetail", { detail: err.message }) : t("pack.exportFailed"),
        ],
        warnings: [],
      });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [runValidation, metadata, items, settings, jpegQuality, cascadeTag, user?.id, t]);

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
              file: await packSongToOszFile(song, cascadeTag),
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
                  file: await packSongToOszFile(song, cascadeTag),
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
            t("pack.nothingInDrop"),
          ]);
      } catch (err) {
        setImportProblems((prev) => [
          ...prev,
          err instanceof Error ? err.message : t("pack.dropFailed"),
        ]);
      } finally {
        setImporting(false);
      }
    },
    [importFiles, importInputs, cascadeTag, t],
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

  const ratio = Math.round((exportProgress?.ratio ?? 0) * 100);
  const hasItems = items.length > 0;
  const status = !validation
    ? null
    : validation.errors.length > 0
      ? "errors"
      : validation.warnings.length > 0
        ? "warnings"
        : "ready";

  const importButton = (large: boolean) => (
    <label
      className={buttonClass(
        large ? "accent" : "primary",
        large ? "md" : "sm",
        `cursor-pointer ${importing ? "pointer-events-none opacity-50" : ""}`,
      )}
    >
      <PackageIcon className="h-4 w-4" />
      {importing ? t("pack.importing") : t("pack.importOsz")}
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
  );
  const browseButton = (large: boolean) => (
    <Button
      variant={large ? "primary" : "ghost"}
      size={large ? "md" : "sm"}
      onClick={() => setBrowseOpen(true)}
      disabled={importing}
      title={t("pack.browseHint")}
    >
      <FolderIcon className="h-4 w-4" />
      {t("pack.browse")}
    </Button>
  );

  return (
    <div
      data-phone-tab={phoneTab}
      className={`pack-creator fixed inset-0 z-40 flex flex-col bg-ink-900 ${
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
        <header className="relative flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.06] pl-2 pr-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
            ← {t("common.back")}
          </Button>
          <span className="h-4 w-px bg-white/[0.08]" />
          <span
            aria-hidden
            className="h-3.5 w-[3px] shrink-0 rounded-full"
            style={{ backgroundColor: MENU_ACCENTS.packCreator }}
          />
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h2 className="shrink-0 font-display text-[0.9375rem] font-semibold text-slate-50">
              Pack Creator
            </h2>
            <p className="hidden truncate text-xs text-slate-500 uimd:block">
              {t("pack.subtitle")}
            </p>
          </div>

          {/* Where the pack stands and what leaves Cascade: the count, the
              file it becomes and the two actions that check and build it. */}
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {hasItems && (
              <div className="hidden min-w-0 flex-col items-end leading-tight uilg:flex">
                <span className="text-xs font-medium tabular-nums text-slate-200">
                  {t("pack.mapCount", { count: items.length })}
                  {settings.placeholderEnabled ? ` + ${t("pack.thumbnailShort")}` : ""}
                </span>
                <span
                  className="max-w-[22rem] truncate font-mono text-2xs text-slate-500"
                  title={packOszFilename(metadata)}
                >
                  {packOszFilename(metadata)}
                </span>
              </div>
            )}
            {validation && (
              <span
                className="flex items-center gap-2.5 text-xs font-medium tabular-nums"
                title={[
                  validation.errors.length ? `${validation.errors.length} · ${t("packValidation.errors")}` : "",
                  validation.warnings.length ? `${validation.warnings.length} · ${t("aimodUi.warnings")}` : "",
                ]
                  .filter(Boolean)
                  .join("\n")}
              >
                {status === "ready" ? (
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {t("packValidation.ready")}
                  </span>
                ) : (
                  <>
                    {validation.errors.length > 0 && (
                      <span className="flex items-center gap-1 text-rose-300">
                        <ErrorIcon className="h-3.5 w-3.5" />
                        {validation.errors.length}
                      </span>
                    )}
                    {validation.warnings.length > 0 && (
                      <span className="flex items-center gap-1 text-amber-300">
                        <WarningIcon className="h-3.5 w-3.5" />
                        {validation.warnings.length}
                      </span>
                    )}
                  </>
                )}
              </span>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={runValidation}
              disabled={importing || !hasItems}
            >
              {t("pack.validate")}
            </Button>
            <Button
              variant="accent"
              size="sm"
              className="min-w-[7.5rem]"
              onClick={() => void exportPack()}
              disabled={exporting || importing || !hasItems}
            >
              {exporting ? (
                <span className="tabular-nums">
                  {t("pack.exporting")} {ratio}%
                </span>
              ) : (
                t("file.exportOsz")
              )}
            </Button>
          </div>
          {exporting && (
            <div
              className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/[0.06]"
              role="progressbar"
              aria-valuenow={ratio}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={exportProgress?.label ?? t("app.exporting")}
            >
              <div
                className="h-full bg-accent transition-[width] duration-200 ease-out"
                style={{ width: `${ratio}%` }}
              />
            </div>
          )}
        </header>
        {exporting && exportProgress?.label && (
          <p className="shrink-0 truncate border-b border-white/[0.06] px-4 py-1.5 text-2xs text-slate-500">
            {exportProgress.label}
          </p>
        )}

        {phone && <nav className="phone-pack-tabs flex shrink-0 gap-1 border-b border-white/[0.06] p-2" aria-label={t("menu.packCreator")}>
          {(["maps", "map", "settings"] as const).map(tab => <button type="button" key={tab} aria-pressed={phoneTab === tab} onClick={() => setPhoneTab(tab)} className={`min-w-0 flex-1 rounded-md px-2 text-sm ${phoneTab === tab ? "bg-white/[0.09] text-slate-50" : "text-slate-400"}`}>{t(`mobile.pack${tab === "maps" ? "Maps" : tab === "map" ? "Map" : "Settings"}`)}</button>)}
        </nav>}
        <div className="pack-workspace flex min-h-0 flex-1 overflow-x-auto">
          {/* Maps: what goes into the pack. Until there is anything to list,
              the work area's drop target does this job alone. */}
          {(hasItems || excluded.length > 0 || importProblems.length > 0) && (
          <section className="pack-maps flex min-h-0 w-72 shrink-0 flex-col border-r border-white/[0.06]">
            <AreaHeader
              label={t("pack.step1")}
              right={
                hasItems ? (
                  <span className="text-xs tabular-nums text-slate-500">{items.length}</span>
                ) : undefined
              }
            />
            {hasItems && (
              <div className="flex shrink-0 flex-wrap gap-1 px-3 pb-2">
                {importButton(false)}
                {browseButton(false)}
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
              {importProblems.length > 0 && (
                <div className="mx-3 mb-2 rounded-md bg-amber-400/[0.07] p-2.5 ring-1 ring-inset ring-amber-400/20">
                  <ul className="space-y-1 text-xs leading-snug text-amber-100/90">
                    {importProblems.map((p, i) => (
                      <li key={i} className="flex gap-1.5">
                        <WarningIcon className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setImportProblems([])}
                    className="mt-1.5 text-xs font-medium text-amber-300 hover:text-amber-200"
                  >
                    {t("pack.dismiss")}
                  </button>
                </div>
              )}

              {!hasItems ? (
                <p className="px-4 text-xs leading-relaxed text-slate-500">
                  {t("pack.importedEmpty")}
                </p>
              ) : (
                <ul className="flex flex-col gap-px px-1.5">
                  {items.map((item) => (
                    <li key={item.id}>
                      <div
                        data-active={item.id === selectedId}
                        className={`hit-line-left group flex items-center gap-1 rounded-md transition ${
                          item.id === selectedId ? "bg-white/[0.07]" : "hover:bg-white/[0.035]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => { setSelectedId(item.id); if (phone) setPhoneTab("map"); }}
                          className="min-w-0 flex-1 rounded-md py-1.5 pl-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
                        >
                          <MarqueeText
                            text={
                              generatePackDifficultyName(item) ||
                              item.originalTitle ||
                              item.originalOsuFilename
                            }
                            className={`text-sm font-medium ${
                              item.id === selectedId ? "text-slate-50" : "text-slate-200"
                            }`}
                          />
                          <span className="block truncate text-2xs text-slate-500">
                            {item.originalArtist} · {item.originalCreator} ·{" "}
                            {item.parsedOsu.keyCount}K
                            {item.nonMania ? ` · ${t("pack.notMania")}` : ""}
                          </span>
                        </button>
                        <button
                          type="button"
                          title={t("pack.removeFromPack")}
                          aria-label={t("pack.removeFromPack")}
                          onClick={() => removeItem(item.id)}
                          className="mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-slate-500 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <CloseIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {excluded.length > 0 && (
                <div className="mt-4 px-1.5">
                  <h4 className="mb-1 px-2.5 text-xs font-semibold text-slate-400">
                    {t("pack.skipped")}
                  </h4>
                  <ul className="flex flex-col gap-px">
                    {excluded.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-slate-300">
                            {item.originalTitle} [{item.originalVersion}]
                          </span>
                          <span className="block truncate text-2xs text-slate-500">
                            {t("pack.mode", { mode: item.parsedOsu.mode })} · {item.sourceFileName}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="h-6 shrink-0 text-2xs text-amber-200 hover:!bg-amber-400/10"
                          onClick={() => includeExcluded(item.id)}
                        >
                          {t("pack.includeAnyway")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
          )}

          {/* The work area. Empty, it is one large place to drop maps; with
              maps in, it reviews the selected one, and once validated the
              findings sit on top where they cannot be missed. */}
          <section className={`pack-map flex min-h-0 min-w-[22rem] flex-1 flex-col ${!hasItems ? "is-empty" : ""}`}>
            {!hasItems ? (
              <div className="grid flex-1 place-items-center p-8">
                <div
                  className={`flex w-full max-w-lg flex-col items-center rounded-2xl border border-dashed px-8 py-14 text-center transition ${
                    dragActive
                      ? "border-accent/70 bg-accent/[0.06]"
                      : "border-white/[0.12]"
                  }`}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/[0.07]">
                    <PackageIcon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold text-slate-50">
                    {t("pack.step1")}
                  </h3>
                  <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-400">
                    {t("pack.importedEmpty")}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {importButton(true)}
                    {browseButton(true)}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{t("pack.orDrop")}</p>
                </div>
              </div>
            ) : (
              <>
                <AreaHeader label={t("pack.step3")} />
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
                  <div className="max-w-2xl">
                    {validation && (
                      <div className="mb-6">
                        <PackCreatorValidation result={validation} />
                      </div>
                    )}
                    {selected ? (
                      <PackCreatorItem
                        item={selected}
                        onChange={(patch) => updateItem(selected.id, patch)}
                        onRemove={() => removeItem(selected.id)}
                      />
                    ) : (
                      <p className="text-sm text-slate-500">{t("pack.selectedHint")}</p>
                    )}
                    {!validation && (
                      <div className="mt-8 border-t border-white/[0.06] pt-4">
                        <PackCreatorValidation result={null} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* The pack itself: the metadata every difficulty shares. */}
          <aside className="pack-settings flex min-h-0 w-80 shrink-0 flex-col border-l border-white/[0.06] bg-black/10">
            <AreaHeader label={t("pack.step2")} />
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <Group title={t("pack.basics")}>
                <div className="flex flex-col gap-3">
                  <Field label={t("pack.title")}>
                    <TextInput
                      value={metadata.title}
                      onChange={(e) => {
                        setMetadata((m) => ({ ...m, title: e.target.value }));
                        setValidation(null);
                      }}
                      placeholder={t("pack.titlePlaceholder")}
                    />
                  </Field>
                  <Field label={t("pack.creator")}>
                    <TextInput
                      value={metadata.creator}
                      onChange={(e) => {
                        setMetadata((m) => ({ ...m, creator: e.target.value }));
                        setValidation(null);
                      }}
                      placeholder={t("pack.creatorPlaceholder")}
                    />
                  </Field>
                  <Field label={t("pack.tags")} hint={t("pack.tagsHint")}>
                    <TextInput
                      value={tagsText}
                      onChange={(e) => {
                        setTagsText(e.target.value);
                        setMetadata((m) => ({
                          ...m,
                          tags: e.target.value.split(/\s+/).filter(Boolean),
                        }));
                      }}
                      placeholder={t("pack.tagsPlaceholder")}
                    />
                  </Field>
                  <p className="text-xs leading-relaxed text-slate-500">
                    {t("pack.basicsHint")}{" "}
                    <span className="text-slate-300">Various Artists</span>{t("pack.basicsHintAfter")}
                  </p>
                </div>
              </Group>

              <Group
                title={t("pack.advanced")}
                badge={
                  advancedActive ? (
                    <span className="rounded-sm bg-accent/15 px-1 text-[10px] font-semibold text-accent-soft">
                      {t("pack.modified")}
                    </span>
                  ) : undefined
                }
                right={
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    aria-expanded={showAdvanced}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100"
                  >
                    {showAdvanced ? t("pack.hide") : t("pack.show")}
                    <ChevronDownIcon
                      className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                    />
                  </button>
                }
              >
                {!showAdvanced ? (
                  <p className="text-xs leading-relaxed text-slate-500">
                    {t("pack.advancedHint")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Field
                      label={t("pack.artistMode")}
                      hint={t("pack.artistModeHint")}
                    >
                      <Dropdown
                        className="w-full"
                        aria-label={t("pack.artistMode")}
                        value={metadata.artistMode}
                        options={[
                          { value: "various", label: t("pack.artistVarious") },
                          {
                            value: "original-per-map",
                            label: t("pack.artistOriginal"),
                          },
                          {
                            value: "custom-shared",
                            label: t("pack.artistCustom"),
                          },
                        ]}
                        onChange={(artistMode: PackArtistMode) => {
                          setMetadata((m) => ({ ...m, artistMode }));
                          setValidation(null);
                        }}
                      />
                    </Field>
                    {metadata.artistMode === "custom-shared" && (
                      <Field label={t("pack.artistCustom")}>
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
                      <Caution>{t("pack.artistWarning")}</Caution>
                    )}

                    <Field
                      label={t("pack.creatorMode")}
                      hint={t("pack.creatorModeHint")}
                    >
                      <Dropdown
                        className="w-full"
                        aria-label={t("pack.creatorMode")}
                        value={settings.creatorFieldMode}
                        options={[
                          {
                            value: "pack-append-mapper",
                            label: t("pack.creatorAppend"),
                          },
                          { value: "pack", label: t("pack.creatorPack") },
                          { value: "original", label: t("pack.creatorOriginal") },
                        ]}
                        onChange={(creatorFieldMode: PackCreatorFieldMode) => {
                          setSettings((s) => ({ ...s, creatorFieldMode }));
                          setValidation(null);
                        }}
                      />
                    </Field>
                    {settings.creatorFieldMode === "original" && (
                      <Caution>{t("pack.creatorWarning")}</Caution>
                    )}

                    <Field label={t("pack.titleUnicode")}>
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
                    <Field label={t("pack.source")}>
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
                      {t("pack.keepTags")}
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
              </Group>

              <Group
                title={t("pack.thumbnail")}
                badge={
                  <code className="rounded-sm bg-white/[0.06] px-1 font-mono text-[10px] text-slate-400">
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
                    aria-label={t("pack.thumbnailLabel")}
                  />
                }
              >
                {settings.placeholderEnabled ? (
                  <div className="flex flex-col gap-3">
                    <Field label={t("pack.audioSource")}>
                      <Dropdown
                        className="w-full"
                        aria-label={t("pack.audioSource")}
                        value={settings.placeholderAudioItemId ?? ""}
                        options={[
                          { value: "", label: t("pack.selectSong") },
                          ...items.map((it) => ({
                            value: it.id,
                            label: `${it.songDisplayName || it.originalTitle} · ${it.originalAudioFilename}`,
                          })),
                        ]}
                        onChange={(id) =>
                          setSettings((s) => ({
                            ...s,
                            placeholderAudioItemId: id || null,
                          }))
                        }
                      />
                    </Field>
                    <Field label={t("pack.keyCount", { min: MIN_KEYS, max: MAX_KEYS })}>
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
                        className="w-20"
                      />
                    </Field>
                    <p className="break-all font-mono text-2xs leading-relaxed text-slate-500">
                      {placeholderFilename}
                    </p>
                    <p className="text-xs leading-relaxed text-slate-500">
                      {t("pack.thumbnailOn")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-500">
                    {t("pack.thumbnailOff")}
                  </p>
                )}
              </Group>
            </div>
          </aside>
        </div>
      </div>

      <PackProjectBrowser
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onAdd={(files) => importFiles(files)}
        cascadeTag={cascadeTag}
      />
    </div>
  );
}
