import type { BackgroundScope, LoadedFile, SongMeta } from "../../types";
import { Modal } from "../ui/Modal";
import { Field, FileButton, TextInput } from "../ui/Controls";

type Props = {
  open: boolean;
  onClose: () => void;
  meta: SongMeta;
  onMeta: (m: SongMeta) => void;
  audio: LoadedFile | null;
  background: LoadedFile | null;
  bgScope: BackgroundScope;
  onBgScope: (scope: BackgroundScope) => void;
  onAudioFile: (f: File) => void;
  onBackgroundFile: (f: File) => void;
  onClearBackground: () => void;
  onImportOsz: (f: File) => void;
};

/** Audio / background files + song metadata. (No timing, no difficulty.) */
export function SettingsModal({
  open,
  onClose,
  meta,
  onMeta,
  audio,
  background,
  bgScope,
  onBgScope,
  onAudioFile,
  onBackgroundFile,
  onClearBackground,
  onImportOsz,
}: Props) {
  const set = <K extends keyof SongMeta>(key: K, value: SongMeta[K]) =>
    onMeta({ ...meta, [key]: value });

  return (
    <Modal open={open} onClose={onClose} title="Map Settings">
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Import
          </h3>
          <FileButton
            label="Import .osz map…"
            accept=".osz,.zip,application/zip"
            onFile={onImportOsz}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            Replaces the current project with all mania difficulties in the
            archive.
          </p>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Audio
          </h3>
          <div className="flex flex-col gap-2">
            <FileButton
              label={audio ? "Replace audio…" : "Upload .mp3 / .ogg"}
              accept="audio/mpeg,audio/ogg,.mp3,.ogg"
              onFile={onAudioFile}
            />
            {audio && (
              <p className="truncate text-xs text-slate-400" title={audio.name}>
                {audio.name}
              </p>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Background
          </h3>
          <div className="flex flex-col gap-2">
            <FileButton
              label={background ? "Replace image…" : "Upload image (optional)"}
              accept="image/*"
              onFile={onBackgroundFile}
            />
            {background && (
              <>
                <div className="flex items-center gap-2">
                  <img
                    src={background.url}
                    alt="background preview"
                    className="h-12 w-20 rounded object-cover"
                  />
                  <button
                    onClick={onClearBackground}
                    className="text-xs text-accent hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <span>Applies to</span>
                  <div className="inline-flex overflow-hidden rounded-lg border border-ink-500/60">
                    {(["mapset", "difficulty"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => onBgScope(s)}
                        className={`px-2.5 py-1 transition ${
                          bgScope === s
                            ? "bg-accent text-white"
                            : "bg-ink-700 text-slate-300 hover:bg-ink-600"
                        }`}
                      >
                        {s === "mapset" ? "Whole set" : "This diff"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Metadata
          </h3>
          <Field label="Title">
            <TextInput
              value={meta.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label="Artist">
            <TextInput
              value={meta.artist}
              onChange={(e) => set("artist", e.target.value)}
            />
          </Field>
          <Field label="Creator">
            <TextInput
              value={meta.creator}
              onChange={(e) => set("creator", e.target.value)}
            />
          </Field>
          <Field label="Tags">
            <TextInput
              value={meta.tags ?? ""}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="space-separated, e.g. stream jumpstream tech"
            />
          </Field>
          <p className="text-[11px] text-slate-500">
            Tags help players find your map in searches. Difficulty name &amp;
            key count are set per difficulty in the Difficulty menu.
          </p>
        </section>
      </div>
    </Modal>
  );
}
