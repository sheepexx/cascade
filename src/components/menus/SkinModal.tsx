import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { HitsoundSkinSource, LoadedSkin } from "../../types";
import type { SavedSkinBlob } from "../../lib/persistence";
import type { CloudSkin } from "../../lib/accountCloud";
import { formatBytes } from "../../lib/progress";
import { MENU_ACCENTS } from "../../lib/menuTheme";
import { Modal } from "../ui/Modal";
import { Button, FileButton, SegmentedControl, TextInput, Toggle } from "../ui/Controls";
import { InfoTip } from "../ui/Tooltip";
import { isDesktopApp } from "../../lib/pwa";
import { osuListSkins, osuReadSkin } from "../../lib/osuDesktop";
import { PRESET_SKINS } from "../../lib/presetSkins";

const AUTHOR_PROFILES: Record<string, string> = {
  kxxn: "https://osu.ppy.sh/users/26595459",
  retsukiya: "https://osu.ppy.sh/users/1326008",
};

/** The bundled sample sets, for the count shown against "Default sounds". */
const DEFAULT_SAMPLE_COUNT = 12;

type SkinTab = "look" | "hitsounds" | "library";

const TABS: { value: SkinTab; label: string }[] = [
  { value: "look", label: "Look" },
  { value: "hitsounds", label: "Hitsounds" },
  { value: "library", label: "Library" },
];

type Target = "visual" | "hitsound";

type Props = {
  open: boolean;
  onClose: () => void;
  skin: LoadedSkin | null;
  hitsoundSource: HitsoundSkinSource;
  hitsoundSkin: LoadedSkin | null;
  savedSkins: SavedSkinBlob[];
  cloudSkins: CloudSkin[];
  cloudAvailable: boolean;
  cloudLoading: boolean;
  activeKeyCount: number;
  /** A read-only editor showing the current map, supplied by App. */
  preview?: ReactNode;
  onApplyPreset: (
    url: string,
    fileName: string,
    target: Target,
  ) => Promise<void> | void;
  onApplySavedSkin: (
    skin: SavedSkinBlob,
    target: Target,
  ) => Promise<void> | void;
  onSkinFile: (file: File, target: Target) => Promise<void> | void;
  onDeleteSavedSkin: (skin: SavedSkinBlob) => Promise<void> | void;
  onUploadCloudSkin: (slot: 1 | 2, file: File) => Promise<void>;
  onDownloadCloudSkin: (skin: CloudSkin) => Promise<void>;
  onDeleteCloudSkin: (skin: CloudSkin) => Promise<void>;
  onClearSkin: () => void;
  onUseDefaultHitsounds: () => void;
  onUseVisualHitsounds: () => void;
  onUseSelectedHitsounds: () => void;
  /** App-level, shared with the editor and the playtest HUD editor. */
  hitLight: boolean;
  onHitLight: (value: boolean) => void;
  error: string | null;
};

export function SkinModal({
  open,
  onClose,
  hitLight,
  onHitLight,
  skin,
  hitsoundSource,
  hitsoundSkin,
  savedSkins,
  cloudSkins,
  cloudAvailable,
  cloudLoading,
  activeKeyCount,
  preview,
  onApplyPreset,
  onApplySavedSkin,
  onSkinFile,
  onDeleteSavedSkin,
  onUploadCloudSkin,
  onDownloadCloudSkin,
  onDeleteCloudSkin,
  onClearSkin,
  onUseDefaultHitsounds,
  onUseVisualHitsounds,
  onUseSelectedHitsounds,
  error,
}: Props) {
  const [tab, setTab] = useState<SkinTab>("look");
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState<string | null>(null);
  const [libraryBusy, setLibraryBusy] = useState<string | null>(null);

  // Declared keymodes are the layouts the skin's author drew; the rest come
  // from its shared art. Both are previewable, but only the declared ones are
  // worth calling out, or every skin would list 1K through 18K.
  const keymodes = useMemo(() => {
    const all = Object.values(skin?.keymodes ?? {}).sort(
      (a, b) => a.keys - b.keys,
    );
    const declared = all.filter((mode) => mode.declared);
    return (declared.length > 0 ? declared : all).map((mode) => mode.keys);
  }, [skin]);
  const busy = loadingName !== null || libraryBusy !== null;

  const apply = async (
    preset: (typeof PRESET_SKINS)[number],
    target: Target,
  ) => {
    setLoadingName(`${target}:${preset.fileName}`);
    try {
      await onApplyPreset(preset.url, preset.fileName, target);
    } finally {
      setLoadingName(null);
    }
  };

  const applySaved = async (saved: SavedSkinBlob, target: Target) => {
    setLoadingName(`${target}:${saved.name}`);
    try {
      await onApplySavedSkin(saved, target);
    } finally {
      setLoadingName(null);
    }
  };

  const importFile = async (file: File, target: Target) => {
    setLoadingName(`${target}:file`);
    try {
      await onSkinFile(file, target);
    } finally {
      setLoadingName(null);
    }
  };

  const removeSaved = async (saved: SavedSkinBlob) => {
    setLibraryBusy(`delete:${saved.name}`);
    try {
      await onDeleteSavedSkin(saved);
    } catch {
      // App owns the visible error message.
    } finally {
      setLibraryBusy(null);
    }
  };

  const uploadCloud = async (slot: 1 | 2, file: File) => {
    setCloudBusy(`upload:${slot}`);
    try {
      await onUploadCloudSkin(slot, file);
    } catch {
      // App owns the visible error message.
    } finally {
      setCloudBusy(null);
    }
  };

  const downloadCloud = async (cloudSkin: CloudSkin) => {
    setCloudBusy(`download:${cloudSkin.slot}`);
    try {
      await onDownloadCloudSkin(cloudSkin);
    } catch {
      // App owns the visible error message.
    } finally {
      setCloudBusy(null);
    }
  };

  const deleteCloud = async (cloudSkin: CloudSkin) => {
    setCloudBusy(`delete:${cloudSkin.slot}`);
    try {
      await onDeleteCloudSkin(cloudSkin);
    } catch {
      // App owns the visible error message.
    } finally {
      setCloudBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Skins"
      width="max-w-3xl"
      height="h-[84vh]"
      accent={MENU_ACCENTS.skin}
      headerExtra={
        <span className="truncate text-xs text-slate-400" title={skin?.name}>
          {skin?.name ?? "Default look"}
        </span>
      }
    >
      {/* One height for every tab (set on the Modal above), so switching tabs
          never moves the tab bar out from under the pointer. */}
      <div className="flex flex-col gap-5">
        <SkinPreview
          skin={skin}
          activeKeyCount={activeKeyCount}
          keymodes={keymodes}
          preview={preview}
        />

        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={TABS}
          accent={MENU_ACCENTS.skin}
        />

        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200"
          >
            {error}
          </p>
        )}

        {tab === "look" && (
          <LookTab
            skin={skin}
            busy={busy}
            hitLight={hitLight}
            onHitLight={onHitLight}
            loadingName={loadingName}
            savedSkins={savedSkins}
            onClearSkin={onClearSkin}
            onApplyPreset={(preset) => void apply(preset, "visual")}
            onApplySaved={(saved) => void applySaved(saved, "visual")}
            onImport={(file) => importFile(file, "visual")}
          />
        )}

        {tab === "hitsounds" && (
          <HitsoundTab
            skin={skin}
            source={hitsoundSource}
            selectedSkin={hitsoundSkin}
            busy={busy}
            loadingName={loadingName}
            savedSkins={savedSkins}
            onUseVisual={onUseVisualHitsounds}
            onUseDefault={onUseDefaultHitsounds}
            onUseSelected={onUseSelectedHitsounds}
            onApplyPreset={(preset) => void apply(preset, "hitsound")}
            onApplySaved={(saved) => void applySaved(saved, "hitsound")}
            onImport={(file) => importFile(file, "hitsound")}
          />
        )}

        {tab === "library" && (
          <LibraryTab
            savedSkins={savedSkins}
            visualSkin={skin}
            hitsoundSource={hitsoundSource}
            hitsoundSkin={hitsoundSkin}
            busy={busy}
            libraryBusy={libraryBusy}
            cloudSkins={cloudSkins}
            cloudAvailable={cloudAvailable}
            cloudLoading={cloudLoading}
            cloudBusy={cloudBusy}
            onApplySaved={(saved, target) => void applySaved(saved, target)}
            onRemoveSaved={(saved) => void removeSaved(saved)}
            onUploadCloud={(slot, file) => void uploadCloud(slot, file)}
            onDownloadCloud={(value) => void downloadCloud(value)}
            onDeleteCloud={(value) => void deleteCloud(value)}
          />
        )}
      </div>
    </Modal>
  );
}

function SectionHeading({
  children,
  tip,
  action,
}: {
  children: ReactNode;
  tip?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {children}
        {tip && <InfoTip className="normal-case tracking-normal" content={tip} />}
      </h3>
      {action}
    </div>
  );
}

/**
 * The skin as it will actually look: a read-only copy of the editor, given by
 * App, drawing the current difficulty with the current skin. Nothing here
 * re-implements the playfield, so the dialog can never disagree with it.
 */
function SkinPreview({
  skin,
  activeKeyCount,
  keymodes,
  preview,
}: {
  skin: LoadedSkin | null;
  activeKeyCount: number;
  keymodes: number[];
  preview?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-ink-600 bg-ink-700/40">
      <div className="flex items-baseline justify-between gap-2 px-3 py-2">
        <span
          className="truncate text-sm font-medium text-slate-100"
          title={skin?.name}
        >
          {skin?.name ?? "Normal"}
        </span>
        <span className="shrink-0 text-[11px] text-slate-500">
          {skin?.author ? <Author skin={skin} /> : "Default look"}
        </span>
      </div>

      <div className="relative h-72 overflow-hidden border-y border-white/5 bg-ink-900/60">
        {preview ? (
          // Read-only, but the canvas still takes the pointer; the dialog owns
          // every interaction here.
          <div className="pointer-events-none h-full w-full">{preview}</div>
        ) : (
          <p className="grid h-full place-items-center px-4 text-center text-xs text-slate-500">
            Open a map to preview a skin on the playfield.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        {keymodes.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Keymodes:</span>
            {keymodes.map((value) => (
              <span
                key={value}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  value === activeKeyCount
                    ? "bg-accent text-white"
                    : "bg-ink-600 text-slate-300"
                }`}
              >
                {value}K
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-slate-500">
            {skin
              ? "No mania pieces in this skin — the default look is used."
              : `Showing ${activeKeyCount}K`}
          </span>
        )}
        {skin && <PreviewNote skin={skin} activeKeyCount={activeKeyCount} />}
      </div>
    </section>
  );
}
/**
 * Why the playfield may not look the way the skin does in osu!. Plenty of
 * skins draw their notes with osu!'s built-in images and put their character
 * into the stage frame instead, so applying them changes less than expected —
 * saying so beats leaving it a mystery.
 */
function PreviewNote({
  skin,
  activeKeyCount,
}: {
  skin: LoadedSkin;
  activeKeyCount: number;
}) {
  const mode = skin.keymodes[activeKeyCount];
  if (!mode) {
    return (
      <span className="text-[11px] text-amber-300/80">
        Nothing for {activeKeyCount}K — this difficulty uses the default look.
      </span>
    );
  }
  if (!mode.columns.some((column) => column.noteUrl)) {
    return (
      <span className="text-[11px] text-amber-300/80">
        This skin ships no {activeKeyCount}K note images — notes keep the
        default look.
      </span>
    );
  }
  if (!mode.declared) {
    return (
      <span className="text-[11px] text-slate-500">
        {activeKeyCount}K isn&apos;t in this skin&apos;s{" "}
        <code className="text-slate-400">skin.ini</code> — drawn from its shared
        note images, as osu! does.
      </span>
    );
  }
  return null;
}

function Author({ skin }: { skin: LoadedSkin }) {
  const profile = AUTHOR_PROFILES[skin.author.toLowerCase()];
  return (
    <>
      by{" "}
      {profile ? (
        <a
          href={profile}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          {skin.author}
        </a>
      ) : (
        skin.author
      )}
    </>
  );
}

function LookTab({
  skin,
  busy,
  loadingName,
  savedSkins,
  hitLight,
  onHitLight,
  onClearSkin,
  onApplyPreset,
  onApplySaved,
  onImport,
}: {
  skin: LoadedSkin | null;
  busy: boolean;
  loadingName: string | null;
  savedSkins: SavedSkinBlob[];
  hitLight: boolean;
  onHitLight: (value: boolean) => void;
  onClearSkin: () => void;
  onApplyPreset: (preset: (typeof PRESET_SKINS)[number]) => void;
  onApplySaved: (skin: SavedSkinBlob) => void;
  onImport: (file: File) => Promise<void> | void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading
          tip="Any osu! .osk works. The editor reads skin.ini for each keymode's lane colours and note images, and falls back to the skin's shared mania-note art for keymodes it does not list — the same way osu! does. Anything a skin leaves out keeps the default style."
          action={
            <FileButton
              label={
                loadingName === "visual:file" ? "Importing…" : "Import .osk…"
              }
              accept=".osk,.zip,application/zip"
              disabled={busy}
              onFile={onImport}
            />
          }
        >
          Choose a look
        </SectionHeading>
        <div className="flex flex-col gap-2">
          <SkinRow
            name="Normal"
            detail="Default look"
            active={!skin}
            disabled={busy}
            onClick={onClearSkin}
            badges={
              <>
                <Badge
                  className="bg-sky-500/20 text-sky-300"
                  title="Notes light up blue on the beat during kiai sections"
                >
                  Kiai Support
                </Badge>
                <Badge
                  className="bg-emerald-500/20 text-emerald-300"
                  title="Shows applied hitsounds (W/F/C letters) on notes in hitsound mode (H)"
                >
                  Hitsound Support
                </Badge>
              </>
            }
          />
          {PRESET_SKINS.map((preset) => (
            <SkinRow
              key={preset.fileName}
              name={preset.name}
              detail="Included"
              active={skin?.fileName === preset.fileName}
              loading={loadingName === `visual:${preset.fileName}`}
              disabled={busy}
              onClick={() => onApplyPreset(preset)}
            />
          ))}
          {savedSkins.map((saved) => (
            <SkinRow
              key={saved.name}
              name={stripSkinExtension(saved.name)}
              detail={`Imported · ${formatBytes(saved.blob.size)}`}
              active={skin?.fileName === saved.name}
              loading={loadingName === `visual:${saved.name}`}
              disabled={busy}
              onClick={() => onApplySaved(saved)}
            />
          ))}
        </div>
      </section>

      <OsuSkinsSection disabled={busy} onUse={onImport} />

      <section>
        <SectionHeading tip="The glow drawn under a column as a note is hit. Skins that draw their own hit lighting will want this off. It applies to the editor and to playtest.">
          Playfield
        </SectionHeading>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2.5">
          <span className="text-sm text-slate-200">Hit light</span>
          <Toggle checked={hitLight} onChange={onHitLight} aria-label="Hit light" />
        </label>
      </section>
    </div>
  );
}

function HitsoundTab({
  skin,
  source,
  selectedSkin,
  busy,
  loadingName,
  savedSkins,
  onUseVisual,
  onUseDefault,
  onUseSelected,
  onApplyPreset,
  onApplySaved,
  onImport,
}: {
  skin: LoadedSkin | null;
  source: HitsoundSkinSource;
  selectedSkin: LoadedSkin | null;
  busy: boolean;
  loadingName: string | null;
  savedSkins: SavedSkinBlob[];
  onUseVisual: () => void;
  onUseDefault: () => void;
  onUseSelected: () => void;
  onApplyPreset: (preset: (typeof PRESET_SKINS)[number]) => void;
  onApplySaved: (skin: SavedSkinBlob) => void;
  onImport: (file: File) => Promise<void> | void;
}) {
  const sampleCount = (value: LoadedSkin | null) =>
    Object.keys(value?.hitsounds ?? {}).length;
  const activeName =
    source === "default"
      ? "Default"
      : source === "visual"
        ? (skin?.name ?? "Default")
        : (selectedSkin?.name ?? "None selected");
  const activeSamples =
    source === "default"
      ? DEFAULT_SAMPLE_COUNT
      : sampleCount(source === "visual" ? skin : selectedSkin);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading tip="Which skin the editor plays hitsounds from. A skin with no samples of its own falls back to the bundled ones.">
          Hitsound source
        </SectionHeading>
        <div className="mb-3 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-slate-100">
              {activeName}
            </span>
            <span className="shrink-0 text-[11px] text-slate-500">
              {activeSamples} samples
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={source === "visual" ? "accent" : "primary"}
            onClick={onUseVisual}
          >
            Follow visual skin
          </Button>
          <Button
            variant={source === "default" ? "accent" : "primary"}
            onClick={onUseDefault}
          >
            Default sounds
          </Button>
          <Button
            variant={source === "selected" ? "accent" : "primary"}
            disabled={!selectedSkin}
            title={
              selectedSkin
                ? `Use the samples from ${selectedSkin.name}`
                : "Pick a sound skin below first"
            }
            onClick={onUseSelected}
          >
            Separate sound skin
          </Button>
        </div>
      </section>

      <section>
        <SectionHeading
          tip="Borrows only the samples from a skin, leaving the playfield as it is."
          action={
            <FileButton
              label={
                loadingName === "hitsound:file" ? "Importing…" : "Import .osk…"
              }
              accept=".osk,.zip,application/zip"
              disabled={busy}
              onFile={onImport}
            />
          }
        >
          Sound skin
        </SectionHeading>
        {PRESET_SKINS.length === 0 && savedSkins.length === 0 ? (
          <EmptyState>
            Import an .osk to use its samples without changing the look.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {PRESET_SKINS.map((preset) => (
              <SkinRow
                key={preset.fileName}
                name={preset.name}
                detail="Included"
                active={
                  source === "selected" &&
                  selectedSkin?.fileName === preset.fileName
                }
                loading={loadingName === `hitsound:${preset.fileName}`}
                disabled={busy}
                onClick={() => onApplyPreset(preset)}
              />
            ))}
            {savedSkins.map((saved) => (
              <SkinRow
                key={saved.name}
                name={stripSkinExtension(saved.name)}
                detail={`Imported · ${formatBytes(saved.blob.size)}`}
                active={
                  source === "selected" && selectedSkin?.fileName === saved.name
                }
                loading={loadingName === `hitsound:${saved.name}`}
                disabled={busy}
                onClick={() => onApplySaved(saved)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LibraryTab({
  savedSkins,
  visualSkin,
  hitsoundSource,
  hitsoundSkin,
  busy,
  libraryBusy,
  cloudSkins,
  cloudAvailable,
  cloudLoading,
  cloudBusy,
  onApplySaved,
  onRemoveSaved,
  onUploadCloud,
  onDownloadCloud,
  onDeleteCloud,
}: {
  savedSkins: SavedSkinBlob[];
  visualSkin: LoadedSkin | null;
  hitsoundSource: HitsoundSkinSource;
  hitsoundSkin: LoadedSkin | null;
  busy: boolean;
  libraryBusy: string | null;
  cloudSkins: CloudSkin[];
  cloudAvailable: boolean;
  cloudLoading: boolean;
  cloudBusy: string | null;
  onApplySaved: (skin: SavedSkinBlob, target: Target) => void;
  onRemoveSaved: (skin: SavedSkinBlob) => void;
  onUploadCloud: (slot: 1 | 2, file: File) => void;
  onDownloadCloud: (skin: CloudSkin) => void;
  onDeleteCloud: (skin: CloudSkin) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading tip="Every skin you import is kept on this device so you can switch back to it without the file.">
          Saved imports
        </SectionHeading>
        {savedSkins.length === 0 ? (
          <EmptyState>
            Imported skins appear here. Add one from the Look or Hitsounds tab.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {savedSkins.map((saved) => {
              const deleting = libraryBusy === `delete:${saved.name}`;
              const visualActive = visualSkin?.fileName === saved.name;
              const soundActive =
                hitsoundSource === "selected" &&
                hitsoundSkin?.fileName === saved.name;
              return (
                <div
                  key={saved.name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2"
                >
                  <div className="min-w-32 flex-1">
                    <p
                      className="truncate text-sm text-slate-200"
                      title={saved.name}
                    >
                      {stripSkinExtension(saved.name)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formatBytes(saved.blob.size)}
                      {saved.savedAt ? ` · ${formatSavedDate(saved.savedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      className="px-2 py-1 text-xs"
                      variant={visualActive ? "accent" : "primary"}
                      disabled={busy}
                      onClick={() => onApplySaved(saved, "visual")}
                    >
                      {visualActive ? "Look active" : "Use look"}
                    </Button>
                    <Button
                      className="px-2 py-1 text-xs"
                      variant={soundActive ? "accent" : "primary"}
                      disabled={busy}
                      onClick={() => onApplySaved(saved, "hitsound")}
                    >
                      {soundActive ? "Sound active" : "Use sound"}
                    </Button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemoveSaved(saved)}
                      aria-label={`Remove ${saved.name} from this device`}
                      title="Remove this saved import. The skin in use stays active."
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-600/75 text-rose-300 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deleting ? <BusyDots /> : <TrashIcon />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeading tip="Store up to two skins in your account. Other devices only load the names and file sizes until you press the cloud download button.">
          Account skins
        </SectionHeading>
        {!cloudAvailable ? (
          <EmptyState>Sign in to save skins to your account.</EmptyState>
        ) : cloudLoading ? (
          <EmptyState>Loading cloud skin slots…</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {([1, 2] as const).map((slot) => {
              const cloudSkin = cloudSkins.find((item) => item.slot === slot);
              const slotBusy = cloudBusy?.endsWith(`:${slot}`) === true;
              return (
                <div
                  key={slot}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Slot {slot}
                    </div>
                    <div
                      className="truncate text-sm text-slate-200"
                      title={cloudSkin?.filename}
                    >
                      {cloudSkin
                        ? stripSkinExtension(cloudSkin.filename)
                        : "Empty"}
                    </div>
                    {cloudSkin && (
                      <div className="text-[10px] text-slate-500">
                        Stored in cloud · {formatBytes(cloudSkin.bytes)}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {cloudSkin && (
                      <button
                        type="button"
                        disabled={cloudBusy !== null}
                        onClick={() => onDownloadCloud(cloudSkin)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-600/75 text-sky-300 transition hover:bg-ink-500/85 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Download ${cloudSkin.filename} from cloud`}
                        title="Download and apply this skin"
                      >
                        {cloudBusy === `download:${slot}` ? (
                          <BusyDots />
                        ) : (
                          <CloudDownloadIcon />
                        )}
                      </button>
                    )}
                    <label
                      className={`inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-2.5 text-xs font-medium text-slate-200 transition hover:bg-ink-500/85 ${
                        cloudBusy !== null ? "pointer-events-none opacity-40" : ""
                      }`}
                    >
                      {cloudBusy === `upload:${slot}`
                        ? "Uploading…"
                        : cloudSkin
                          ? "Replace"
                          : "Upload"}
                      <input
                        type="file"
                        accept=".osk,.zip,application/zip"
                        className="sr-only"
                        disabled={cloudBusy !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onUploadCloud(slot, file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {cloudSkin && (
                      <button
                        type="button"
                        disabled={cloudBusy !== null}
                        onClick={() => onDeleteCloud(cloudSkin)}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-600/75 text-rose-300 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Delete ${cloudSkin.filename} from cloud`}
                        title="Delete this cloud skin"
                      >
                        {cloudBusy === `delete:${slot}` ? (
                          <BusyDots />
                        ) : (
                          <TrashIcon />
                        )}
                      </button>
                    )}
                    {!cloudSkin && slotBusy && <BusyDots />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SkinRow({
  name,
  detail,
  active,
  loading = false,
  disabled = false,
  badges,
  onClick,
}: {
  name: string;
  detail: string;
  active: boolean;
  loading?: boolean;
  disabled?: boolean;
  badges?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-accent bg-accent/10 text-slate-100"
          : "border-ink-600 bg-ink-700/40 text-slate-200 hover:bg-ink-600/60"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">
          {name} <span className="text-slate-500">– {detail}</span>
        </span>
        {badges}
      </span>
      <span className="ml-2 shrink-0 text-[11px] text-slate-400">
        {loading ? "Loading…" : active ? "Active" : "Use"}
      </span>
    </button>
  );
}

function Badge({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className: string;
  title: string;
}) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}
      title={title}
    >
      {children}
    </span>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2 text-xs text-slate-400">
      {children}
    </p>
  );
}

function OsuSkinsSection({
  disabled,
  onUse,
}: {
  disabled: boolean;
  onUse: (file: File) => Promise<void> | void;
}) {
  const [skins, setSkins] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const desktop = isDesktopApp();

  useEffect(() => {
    if (!desktop) return;
    let live = true;
    osuListSkins()
      .then((names) => {
        if (live) setSkins(names);
      })
      .catch((value: unknown) => {
        if (!live) return;
        // Saying why beats an empty list: "osu! is not installed" and "your
        // Skins folder has nothing in it" need very different answers.
        setError(
          value instanceof Error
            ? value.message
            : "Cascade could not read your osu! Skins folder.",
        );
        setSkins([]);
      });
    return () => {
      live = false;
    };
  }, [desktop]);

  // Shown rather than hidden in the browser, so it is clear the feature exists
  // and where it lives, instead of the section silently not being there.
  if (!desktop) {
    return (
      <section>
        <SectionHeading tip="The desktop app can read your osu! Skins folder and equip a skin without you finding the .osk.">
          Skins in osu!
        </SectionHeading>
        <EmptyState>
          Only the Cascade desktop app can reach your osu! Skins folder. In the
          browser, import an <code className="text-slate-400">.osk</code>{" "}
          instead.
        </EmptyState>
      </section>
    );
  }

  const use = async (name: string) => {
    setBusy(name);
    setError(null);
    try {
      await onUse(await osuReadSkin(name));
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not read that skin.",
      );
    } finally {
      setBusy(null);
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? (skins ?? []).filter((name) => name.toLowerCase().includes(needle))
    : (skins ?? []);

  return (
    <section>
      <SectionHeading
        tip="Reads straight from your osu! Skins folder. Only the mania pieces and hitsounds are copied, so even a very large skin loads quickly."
        action={
          skins && skins.length > 8 ? (
            <TextInput
              type="search"
              value={query}
              placeholder="Search skins…"
              aria-label="Search your osu! skins"
              className="w-40 py-1 text-xs"
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : undefined
        }
      >
        Skins in osu!
      </SectionHeading>
      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}
      {skins === null ? (
        <EmptyState>Reading your osu! Skins folder…</EmptyState>
      ) : skins.length === 0 ? (
        <EmptyState>No installed skins were found.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState>No skin matches “{query.trim()}”.</EmptyState>
      ) : (
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
          {shown.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2"
            >
              <span className="truncate text-xs text-slate-200" title={name}>
                {name}
              </span>
              <Button
                className="px-2 py-1 text-xs"
                onClick={() => void use(name)}
                disabled={disabled || busy !== null}
              >
                {busy === name ? "Loading…" : "Use"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function stripSkinExtension(name: string): string {
  return name.replace(/\.(?:osk|zip)$/i, "");
}

function formatSavedDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(timestamp);
  } catch {
    return "saved locally";
  }
}

function BusyDots() {
  return <span className="animate-pulse text-[10px]">…</span>;
}

function CloudDownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 18h10a4 4 0 000-8h-.3A6 6 0 005.2 8.8 4.5 4.5 0 007 18z" />
      <path d="M12 11v7m-3-3 3 3 3-3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
    </svg>
  );
}
