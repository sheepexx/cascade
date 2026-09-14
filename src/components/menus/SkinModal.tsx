import { useEffect, useState } from "react";
import type { HitsoundSkinSource, LoadedSkin } from "../../types";
import type { SavedSkinBlob } from "../../lib/persistence";
import type { CloudSkin } from "../../lib/accountCloud";
import { formatBytes } from "../../lib/progress";
import { Modal } from "../ui/Modal";
import { Button, FileButton } from "../ui/Controls";
import { isDesktopApp } from "../../lib/pwa";
import { osuListSkins, osuReadSkin } from "../../lib/osuDesktop";
import { InfoTip } from "../ui/Tooltip";
import { PRESET_SKINS } from "../../lib/presetSkins";

const AUTHOR_PROFILES: Record<string, string> = {
  kxxn: "https://osu.ppy.sh/users/26595459",
  retsukiya: "https://osu.ppy.sh/users/1326008",
};

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
  onApplyPreset: (
    url: string,
    fileName: string,
    target: "visual" | "hitsound",
  ) => Promise<void> | void;
  onApplySavedSkin: (
    skin: SavedSkinBlob,
    target: "visual" | "hitsound",
  ) => Promise<void> | void;
  onSkinFile: (file: File, target: "visual" | "hitsound") => void;
  onUploadCloudSkin: (slot: 1 | 2, file: File) => Promise<void>;
  onDownloadCloudSkin: (skin: CloudSkin) => Promise<void>;
  onDeleteCloudSkin: (skin: CloudSkin) => Promise<void>;
  onClearSkin: () => void;
  onUseDefaultHitsounds: () => void;
  onUseVisualHitsounds: () => void;
  error: string | null;
};

export function SkinModal({
  open,
  onClose,
  skin,
  hitsoundSource,
  hitsoundSkin,
  savedSkins,
  cloudSkins,
  cloudAvailable,
  cloudLoading,
  activeKeyCount,
  onApplyPreset,
  onApplySavedSkin,
  onSkinFile,
  onUploadCloudSkin,
  onDownloadCloudSkin,
  onDeleteCloudSkin,
  onClearSkin,
  onUseDefaultHitsounds,
  onUseVisualHitsounds,
  error,
}: Props) {
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState<string | null>(null);

  const keymodes = skin
    ? Object.keys(skin.keymodes)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
  const activeSupported = !!skin?.keymodes[activeKeyCount];

  const hitCount = (s: LoadedSkin | null) => Object.keys(s?.hitsounds ?? {}).length;
  const activeHitsoundName =
    hitsoundSource === "default"
      ? "Default"
      : hitsoundSource === "visual"
        ? skin
          ? skin.name
          : "Default"
        : hitsoundSkin?.name ?? "None selected";

  const apply = async (
    preset: (typeof PRESET_SKINS)[number],
    target: "visual" | "hitsound",
  ) => {
    setLoadingName(`${target}:${preset.fileName}`);
    try {
      await onApplyPreset(preset.url, preset.fileName, target);
    } finally {
      setLoadingName(null);
    }
  };

  const applySaved = async (
    saved: SavedSkinBlob,
    target: "visual" | "hitsound",
  ) => {
    setLoadingName(`${target}:${saved.name}`);
    try {
      await onApplySavedSkin(saved, target);
    } finally {
      setLoadingName(null);
    }
  };

  const uploadCloud = async (slot: 1 | 2, file: File) => {
    setCloudBusy(`upload:${slot}`);
    try {
      await onUploadCloudSkin(slot, file);
    } catch {
    } finally {
      setCloudBusy(null);
    }
  };

  const downloadCloud = async (cloudSkin: CloudSkin) => {
    setCloudBusy(`download:${cloudSkin.slot}`);
    try {
      await onDownloadCloudSkin(cloudSkin);
    } catch {
    } finally {
      setCloudBusy(null);
    }
  };

  const deleteCloud = async (cloudSkin: CloudSkin) => {
    setCloudBusy(`delete:${cloudSkin.slot}`);
    try {
      await onDeleteCloudSkin(cloudSkin);
    } catch {
    } finally {
      setCloudBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Skins">
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preset skins
          </h3>
          <div className="flex flex-col gap-2">
            <button
              onClick={onClearSkin}
              disabled={loadingName !== null}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                !skin
                  ? "border-accent bg-accent/10 text-slate-100"
                  : "border-ink-600 bg-ink-700/40 text-slate-200 hover:bg-ink-600/60"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">
                  Normal{" "}
                  <span className="text-slate-500">- default look</span>
                </span>
                <span
                  className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300"
                  title="Notes light up blue on the beat during kiai sections"
                >
                  Kiai Support
                </span>
                <span
                  className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
                  title="Shows applied hitsounds (W/F/C letters) on notes in hitsound mode (H)"
                >
                  Hitsound Support
                </span>
              </span>
              <span className="ml-2 shrink-0 text-[11px] text-slate-400">
                {!skin ? "Active" : "Use"}
              </span>
            </button>

            {PRESET_SKINS.map((preset) => {
              const isActive = skin?.fileName === preset.fileName;
              const isLoading = loadingName === `visual:${preset.fileName}`;
              return (
                <button
                  key={preset.fileName}
                  onClick={() => void apply(preset, "visual")}
                  disabled={loadingName !== null}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isActive
                      ? "border-accent bg-accent/10 text-slate-100"
                      : "border-ink-600 bg-ink-700/40 text-slate-200 hover:bg-ink-600/60"
                  }`}
                >
                  <span className="truncate">{preset.name}</span>
                  <span className="ml-2 shrink-0 text-[11px] text-slate-400">
                    {isLoading ? "Loading…" : isActive ? "Active" : "Apply"}
                  </span>
                </button>
              );
            })}
          </div>
          {PRESET_SKINS.length === 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              Drop an <code className="text-slate-400">.osk</code> into the
              project's <code className="text-slate-400">/skin/</code> folder to
              add more presets.
            </p>
          )}
        </section>

        <section>
          <h3 className="flex items-center gap-1.5 mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Custom skin
            <InfoTip className="normal-case tracking-normal" content="Upload your own osu! .osk skin. The editor reads skin.ini and applies each keymode's lane colours and note images to the playfield. Anything the skin doesn't define falls back to the default style." />
          </h3>
          <div className="flex items-center gap-2">
            <FileButton
              label={skin ? "Replace skin…" : "Upload .osk skin"}
              accept=".osk,.zip,application/zip"
              onFile={(file) => onSkinFile(file, "visual")}
            />
            {skin && (
              <Button onClick={onClearSkin} title="Remove the current skin">
                Remove
              </Button>
            )}
          </div>
        </section>

        <OsuSkinsSection onUse={(file) => onSkinFile(file, "visual")} />

        <section>
          <h3 className="flex items-center gap-1.5 mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Account skins
            <InfoTip className="normal-case tracking-normal" content="Store up to two skins in your account. Other devices only load the names and file sizes until you press the cloud download button." />
          </h3>
          {!cloudAvailable ? (
            <p className="rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2 text-xs text-slate-400">
              Sign in to save skins to your account.
            </p>
          ) : cloudLoading ? (
            <p className="rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2 text-xs text-slate-400">
              Loading cloud skin slots…
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {([1, 2] as const).map((slot) => {
                const cloudSkin = cloudSkins.find((item) => item.slot === slot);
                const busy = cloudBusy?.endsWith(`:${slot}`) === true;
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
                        {cloudSkin?.filename ?? "Empty"}
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
                          onClick={() => void downloadCloud(cloudSkin)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-600/75 text-sky-300 transition hover:bg-ink-500/85 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Download ${cloudSkin.filename} from cloud`}
                          title="Download and apply this skin"
                        >
                          {cloudBusy === `download:${slot}` ? (
                            <span className="text-[10px]">…</span>
                          ) : (
                            <CloudDownloadIcon />
                          )}
                        </button>
                      )}
                      <label
                        className={`inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-2.5 text-xs font-medium text-slate-200 transition hover:bg-ink-500/85 ${
                          cloudBusy !== null
                            ? "pointer-events-none opacity-40"
                            : ""
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
                          className="hidden"
                          disabled={cloudBusy !== null}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadCloud(slot, file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {cloudSkin && (
                        <button
                          type="button"
                          disabled={cloudBusy !== null}
                          onClick={() => void deleteCloud(cloudSkin)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-ink-600/75 text-rose-300 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Delete ${cloudSkin.filename} from cloud`}
                          title="Delete this cloud skin"
                        >
                          {cloudBusy === `delete:${slot}` ? (
                            <span className="text-[10px]">…</span>
                          ) : (
                            <TrashIcon />
                          )}
                        </button>
                      )}
                      {!cloudSkin && busy && (
                        <span className="text-[10px] text-slate-500">…</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {savedSkins.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Saved imports
            </h3>
            <div className="flex flex-col gap-2">
              {savedSkins.map((saved) => {
                const visualActive = skin?.fileName === saved.name;
                const soundActive =
                  hitsoundSource === "selected" &&
                  hitsoundSkin?.fileName === saved.name;
                return (
                  <div
                    key={saved.name}
                    className="flex items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2 text-sm text-slate-200"
                  >
                    <span className="min-w-0 truncate">{saved.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button
                        className="px-2 py-1 text-xs"
                        disabled={loadingName !== null}
                        onClick={() => void applySaved(saved, "visual")}
                      >
                        {loadingName === `visual:${saved.name}`
                          ? "Loading..."
                          : visualActive
                            ? "Look active"
                            : "Use look"}
                      </Button>
                      <Button
                        className="px-2 py-1 text-xs"
                        disabled={loadingName !== null}
                        onClick={() => void applySaved(saved, "hitsound")}
                      >
                        {loadingName === `hitsound:${saved.name}`
                          ? "Loading..."
                          : soundActive
                            ? "Sound active"
                            : "Use sound"}
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Hitsound source
          </h3>
          <div className="mb-3 rounded-lg border border-ink-600 bg-ink-700/40 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-slate-100">
                {activeHitsoundName}
              </span>
              <span className="shrink-0 text-[11px] text-slate-500">
                {hitsoundSource === "default"
                  ? "Bundled samples"
                  : hitsoundSource === "visual"
                    ? `${hitCount(skin)} skin samples`
                    : `${hitCount(hitsoundSkin)} skin samples`}
              </span>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              variant={hitsoundSource === "visual" ? "accent" : "primary"}
              onClick={onUseVisualHitsounds}
            >
              Follow visual skin
            </Button>
            <Button
              variant={hitsoundSource === "default" ? "accent" : "primary"}
              onClick={onUseDefaultHitsounds}
            >
              Default sounds
            </Button>
            <FileButton
              label="Upload sound skin"
              accept=".osk,.zip,application/zip"
              onFile={(file) => onSkinFile(file, "hitsound")}
            />
          </div>

          {PRESET_SKINS.length > 0 && (
            <div className="flex flex-col gap-2">
              {PRESET_SKINS.map((preset) => {
                const isActive =
                  hitsoundSource === "selected" &&
                  hitsoundSkin?.fileName === preset.fileName;
                const isLoading = loadingName === `hitsound:${preset.fileName}`;
                return (
                  <button
                    key={`sound:${preset.fileName}`}
                    onClick={() => void apply(preset, "hitsound")}
                    disabled={loadingName !== null}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive
                        ? "border-accent bg-accent/10 text-slate-100"
                        : "border-ink-600 bg-ink-700/40 text-slate-200 hover:bg-ink-600/60"
                    }`}
                  >
                    <span className="truncate">{preset.name}</span>
                    <span className="ml-2 shrink-0 text-[11px] text-slate-400">
                      {isLoading ? "Loading..." : isActive ? "Active" : "Use sound"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {error && (
          <p className="rounded-md border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        {skin && (
          <div className="rounded-lg border border-ink-600 bg-ink-700/40 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="truncate text-sm font-medium text-slate-100"
                title={skin.name}
              >
                {skin.name}
              </span>
              {skin.author && (
                <span className="shrink-0 text-[11px] text-slate-500">
                  by{" "}
                  {AUTHOR_PROFILES[skin.author.toLowerCase()] ? (
                    <a
                      href={AUTHOR_PROFILES[skin.author.toLowerCase()]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      {skin.author}
                    </a>
                  ) : (
                    skin.author
                  )}
                </span>
              )}
            </div>

            {keymodes.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Keymodes:</span>
                {keymodes.map((k) => (
                  <span
                    key={k}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      k === activeKeyCount
                        ? "bg-accent text-white"
                        : "bg-ink-600 text-slate-300"
                    }`}
                  >
                    {k}K
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">
                No mania keymodes found in this skin&apos;s{" "}
                <code className="text-slate-400">skin.ini</code>.
              </p>
            )}

            {keymodes.length > 0 && !activeSupported && (
              <p className="mt-2 text-[11px] text-amber-300/80">
                This skin has no {activeKeyCount}K layout, so the current
                difficulty uses the default style.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
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

function OsuSkinsSection({ onUse }: { onUse: (file: File) => void }) {
  const [skins, setSkins] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let live = true;
    osuListSkins()
      .then((names) => {
        if (live) setSkins(names);
      })
      .catch(() => {
        if (live) setSkins([]);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!skins || skins.length === 0) return null;

  const use = (name: string) => {
    setBusy(name);
    setError(null);
    osuReadSkin(name)
      .then(onUse)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not read that skin."),
      )
      .finally(() => setBusy(null));
  };

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Skins in osu!
      </h3>
      {error && <p className="mb-2 text-[11px] text-rose-400">{error}</p>}
      <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {skins.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between gap-3 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2"
          >
            <span className="truncate text-xs text-slate-200" title={name}>
              {name}
            </span>
            <Button onClick={() => use(name)} disabled={busy !== null}>
              {busy === name ? "Loading…" : "Use"}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
