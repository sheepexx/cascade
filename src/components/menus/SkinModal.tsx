import { useState } from "react";
import type { LoadedSkin } from "../../types";
import { Modal } from "../ui/Modal";
import { Button, FileButton } from "../ui/Controls";

/**
 * Preset skins are the `.osk` archives kept in the project's `/skin/` folder.
 * Vite resolves each one to a served URL at build time, so dropping a new
 * `.osk` in that folder makes it appear here automatically.
 */
const PRESET_MODULES = import.meta.glob("/skin/*.osk", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const PRESET_SKINS = Object.entries(PRESET_MODULES)
  .map(([path, url]) => {
    const fileName = path.split("/").pop() ?? path;
    return { fileName, name: fileName.replace(/\.osk$/i, ""), url };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** osu! profile links for known skin authors, keyed by lower-cased name. */
const AUTHOR_PROFILES: Record<string, string> = {
  kxxn: "https://osu.ppy.sh/users/26595459",
  retsukiya: "https://osu.ppy.sh/users/1326008",
};

type Props = {
  open: boolean;
  onClose: () => void;
  skin: LoadedSkin | null;
  /** Key count of the difficulty currently being edited. */
  activeKeyCount: number;
  onApplyPreset: (url: string, fileName: string) => Promise<void> | void;
  onSkinFile: (file: File) => void;
  onClearSkin: () => void;
  error: string | null;
};

/**
 * Pick the playfield skin: apply one of the bundled preset skins or upload a
 * personal osu! `.osk`. The chosen skin's lane colours and note sprites are
 * used to render the playfield.
 */
export function SkinModal({
  open,
  onClose,
  skin,
  activeKeyCount,
  onApplyPreset,
  onSkinFile,
  onClearSkin,
  error,
}: Props) {
  const [loadingName, setLoadingName] = useState<string | null>(null);

  const keymodes = skin
    ? Object.keys(skin.keymodes)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
  const activeSupported = !!skin?.keymodes[activeKeyCount];

  const apply = async (preset: (typeof PRESET_SKINS)[number]) => {
    setLoadingName(preset.fileName);
    try {
      await onApplyPreset(preset.url, preset.fileName);
    } finally {
      setLoadingName(null);
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
            {/* The built-in default look, selected when no skin is loaded. */}
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
                  <span className="text-slate-500">— default look</span>
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
              const isLoading = loadingName === preset.fileName;
              return (
                <button
                  key={preset.fileName}
                  onClick={() => void apply(preset)}
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Custom skin
          </h3>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            Upload your own osu!{" "}
            <code className="text-slate-400">.osk</code> skin. The editor reads{" "}
            <code className="text-slate-400">skin.ini</code> and applies each
            keymode's lane colours and note images to the playfield. Anything
            the skin doesn't define falls back to the default style.
          </p>
          <div className="flex items-center gap-2">
            <FileButton
              label={skin ? "Replace skin…" : "Upload .osk skin"}
              accept=".osk,.zip,application/zip"
              onFile={onSkinFile}
            />
            {skin && (
              <Button onClick={onClearSkin} title="Remove the current skin">
                Remove
              </Button>
            )}
          </div>
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
