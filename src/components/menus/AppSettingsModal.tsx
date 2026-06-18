import type { LoadedSkin } from "../../types";
import { Modal } from "../ui/Modal";
import { Button, FileButton } from "../ui/Controls";

type Props = {
  open: boolean;
  onClose: () => void;
  skin: LoadedSkin | null;
  /** Key count of the difficulty currently being edited. */
  activeKeyCount: number;
  onSkinFile: (file: File) => void;
  onClearSkin: () => void;
  error: string | null;
};

/**
 * Editor preferences. Currently: upload a personal osu! skin (`.osk`) and use
 * it to render the playfield (lane colours + note sprites).
 */
export function AppSettingsModal({
  open,
  onClose,
  skin,
  activeKeyCount,
  onSkinFile,
  onClearSkin,
  error,
}: Props) {
  const keymodes = skin ? Object.keys(skin.keymodes).map(Number).sort((a, b) => a - b) : [];
  const activeSupported = !!skin?.keymodes[activeKeyCount];

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Skin
          </h3>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            Upload an osu!{" "}
            <code className="text-slate-400">.osk</code> skin to map with your
            own look. The editor reads <code className="text-slate-400">skin.ini</code>{" "}
            and applies each keymode's lane colours and note images to the
            playfield. Anything the skin doesn't define falls back to the
            default style.
          </p>

          <div className="flex flex-col gap-3">
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
                      by {skin.author}
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
        </section>
      </div>
    </Modal>
  );
}
