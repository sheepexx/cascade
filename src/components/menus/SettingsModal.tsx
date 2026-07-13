import type { BackgroundScope, Difficulty, LoadedFile, SmMeta, SongMeta } from "../../types";
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
  video: LoadedFile | null;
  videoOffsetMs: number;
  onVideoFile: (f: File) => void;
  onClearVideo: () => void;
  onVideoOffsetMs: (ms: number) => void;
  onImportOsz: (f: File) => void;
  onImportSm?: (f: File) => void;
  onImportSmPack?: () => void;
  /** Currently active difficulty — used to detect SM maps and read smMeta. */
  activeDiff?: Difficulty;
  /** Called with the updated smMeta whenever an SM field changes. */
  onSmMeta?: (sm: SmMeta) => void;
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
  video,
  videoOffsetMs,
  onVideoFile,
  onClearVideo,
  onVideoOffsetMs,
  onImportOsz,
  onImportSm,
  onImportSmPack,
  activeDiff,
  onSmMeta,
}: Props) {
  const set = <K extends keyof SongMeta>(key: K, value: SongMeta[K]) =>
    onMeta({ ...meta, [key]: value });

  const isSm = activeDiff?.sourceFormat === "sm";
  const sm: SmMeta = activeDiff?.smMeta ?? {};

  const setSm = <K extends keyof SmMeta>(key: K, value: SmMeta[K]) =>
    onSmMeta?.({ ...sm, [key]: value });

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
          {onImportSm && (
            <FileButton
              label="Import .sm map…"
              accept=".sm"
              onFile={onImportSm}
            />
          )}
          {onImportSmPack && (
            <button
              type="button"
              onClick={onImportSmPack}
              className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-3 py-2 text-sm font-medium text-slate-200 shadow-sm backdrop-blur-sm transition hover:bg-ink-500/85"
            >
              Import SM pack…
            </button>
          )}
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

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Background Video
            </h3>
            <span
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
              title="The video file is kept on this device and bundled into exported .osz files, but it is not uploaded with cloud saves or live collab sessions."
            >
              no cloud support
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <FileButton
              label={video ? "Replace video…" : "Upload video (optional)"}
              accept="video/*,.mp4,.webm,.avi,.flv,.mov,.wmv,.m4v"
              onFile={onVideoFile}
            />
            {video ? (
              <>
                <div className="flex items-center gap-2">
                  <video
                    src={video.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-12 w-20 rounded object-cover"
                  />
                  <div className="flex min-w-0 flex-col">
                    <span
                      className="truncate text-xs text-slate-400"
                      title={video.name}
                    >
                      {video.name}
                    </span>
                    <button
                      onClick={onClearVideo}
                      className="self-start text-xs text-accent hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Starts at</span>
                  <TextInput
                    type="number"
                    value={videoOffsetMs}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value));
                      onVideoOffsetMs(Number.isFinite(v) ? v : 0);
                    }}
                    className="w-24 px-2 py-1 text-xs"
                  />
                  <span>ms into the song</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Plays muted behind the playfield, in place of the background
                  image. Applies to the whole set. osu! plays .mp4/.avi/.flv;
                  use H.264 .mp4 for the widest support.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">
                Optional. The video plays muted behind the playfield while the
                song plays, like ranked osu! maps with a video.
              </p>
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

        {/* ── StepMania-specific metadata — only shown for SM maps ── */}
        {isSm && onSmMeta && (
          <section className="flex flex-col gap-3 rounded-xl border border-pink-500/20 bg-pink-500/5 p-4">
            <div className="flex items-center gap-2">
              <img
                src="/etterna-logo.png"
                alt="Etterna"
                className="h-4 w-4 object-contain opacity-80"
              />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-pink-300">
                StepMania / Etterna Fields
              </h3>
            </div>
            <p className="text-[11px] text-slate-400">
              These are written directly to the{" "}
              <code className="rounded bg-ink-700 px-1 text-pink-300">.sm</code>{" "}
              header on export. Leave blank to use defaults.
            </p>

            <Field label="Subtitle (#SUBTITLE)">
              <TextInput
                value={sm.subtitle ?? ""}
                onChange={(e) => setSm("subtitle", e.target.value || undefined)}
                placeholder="e.g. (TV Size)"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Title Translit (#TITLETRANSLIT)">
                <TextInput
                  value={sm.titleTranslit ?? ""}
                  onChange={(e) =>
                    setSm("titleTranslit", e.target.value || undefined)
                  }
                  placeholder="Romanised title"
                />
              </Field>
              <Field label="Subtitle Translit (#SUBTITLETRANSLIT)">
                <TextInput
                  value={sm.subtitleTranslit ?? ""}
                  onChange={(e) =>
                    setSm("subtitleTranslit", e.target.value || undefined)
                  }
                  placeholder="Romanised subtitle"
                />
              </Field>
            </div>

            <Field label="Artist Translit (#ARTISTTRANSLIT)">
              <TextInput
                value={sm.artistTranslit ?? ""}
                onChange={(e) =>
                  setSm("artistTranslit", e.target.value || undefined)
                }
                placeholder="Romanised artist name"
              />
            </Field>

            <Field label="Genre (#GENRE)">
              <TextInput
                value={sm.genre ?? ""}
                onChange={(e) => setSm("genre", e.target.value || undefined)}
                placeholder="e.g. J-Pop, Electronic"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Display BPM (#DISPLAYBPM)">
                <TextInput
                  value={sm.displayBpm ?? ""}
                  onChange={(e) =>
                    setSm("displayBpm", e.target.value || undefined)
                  }
                  placeholder="e.g. 120 or 80:200"
                />
              </Field>
              <Field label="Sample Length (#SAMPLELENGTH) (s)">
                <TextInput
                  value={
                    sm.sampleLength !== undefined ? String(sm.sampleLength) : ""
                  }
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setSm("sampleLength", Number.isFinite(v) ? v : undefined);
                  }}
                  placeholder="seconds, e.g. 10"
                />
              </Field>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">
                Selectable (#SELECTABLE)
              </span>
              <div className="inline-flex overflow-hidden rounded-lg border border-ink-500/60">
                {(["YES", "NO"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSm("selectable", v)}
                    className={`px-4 py-1.5 text-xs transition ${
                      (sm.selectable ?? "YES") === v
                        ? "bg-pink-500/70 text-white"
                        : "bg-ink-700 text-slate-300 hover:bg-ink-600"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
