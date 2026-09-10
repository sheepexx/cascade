import { useState } from "react";
import type { BackgroundScope, Difficulty, LoadedFile, SmMeta, SongMeta } from "../../types";
import type { BatchRequest } from "../../lib/batchApply";
import { Modal } from "../ui/Modal";
import { Field, FileButton, SegmentedControl, TextInput } from "../ui/Controls";
import { BatchApplyPanel } from "./BatchApplyPanel";
import { useT } from "../../lib/i18n";

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
  onImportOsuDiff?: (f: File) => void;
  onImportSm?: (f: File) => void;
  onImportSmPack?: () => void;
  activeDiff?: Difficulty;
  onSmMeta?: (sm: SmMeta) => void;
  onBeatmapId?: (id: number | undefined) => void;
  difficulties?: Difficulty[];
  onBatchApply?: (request: BatchRequest) => void;
  readOnly?: boolean;
  live?: boolean;
};

type Tab = "song" | "batch";

/** Blank clears the ID back to the format default; -1 is a valid entry. */
function parseId(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const v = Math.round(Number(raw));
  return Number.isFinite(v) ? v : undefined;
}

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
  onImportOsuDiff,
  onImportSm,
  onImportSmPack,
  activeDiff,
  onSmMeta,
  onBeatmapId,
  difficulties,
  onBatchApply,
  readOnly,
  live,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("song");
  const batch =
    activeDiff && onBatchApply && difficulties
      ? { source: activeDiff, difficulties, onApply: onBatchApply }
      : null;
  const showBatch = batch !== null && tab === "batch";
  const set = <K extends keyof SongMeta>(key: K, value: SongMeta[K]) =>
    onMeta({ ...meta, [key]: value });

  const isSm = activeDiff?.sourceFormat === "sm";
  const sm: SmMeta = activeDiff?.smMeta ?? {};

  const unsubmitted =
    (activeDiff?.beatmapId ?? 0) <= 0 && (meta.beatmapSetId ?? -1) <= 0;
  const markUnsubmitted = () => {
    set("beatmapSetId", -1);
    onBeatmapId?.(-1);
  };

  const setSm = <K extends keyof SmMeta>(key: K, value: SmMeta[K]) =>
    onSmMeta?.({ ...sm, [key]: value });

  return (
    <Modal open={open} onClose={onClose} title={t("mapSettings.title")} width="max-w-xl">
      <div className="flex flex-col gap-6">
        {batch && (
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "song", label: t("mapSettings.tabSong") },
              { value: "batch", label: t("mapSettings.tabBatch") },
            ]}
          />
        )}
        {showBatch && (
          <BatchApplyPanel
            key={batch.source.id}
            source={batch.source}
            difficulties={batch.difficulties}
            onApply={batch.onApply}
            readOnly={Boolean(readOnly)}
            live={live}
          />
        )}
        <div className={showBatch ? "hidden" : "flex flex-col gap-6"}>
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("mapSettings.import")}
          </h3>
          <FileButton
            label={t("mapSettings.importOsz")}
            accept=".osz,.zip,application/zip"
            onFile={onImportOsz}
          />
          {onImportSm && (
            <FileButton
              label={t("mapSettings.importSm")}
              accept=".sm,.ssc"
              onFile={onImportSm}
            />
          )}
          {onImportSmPack && (
            <button
              type="button"
              onClick={onImportSmPack}
              className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-ink-600/75 px-3 py-2 text-sm font-medium text-slate-200 shadow-sm backdrop-blur-sm transition hover:bg-ink-500/85"
            >
              {t("mapSettings.importSmPack")}
            </button>
          )}
          <p className="mt-1.5 text-[11px] text-slate-500">
            {t("mapSettings.importHint")}
          </p>
          {onImportOsuDiff && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <FileButton
                label={t("mapSettings.importOsuDiff")}
                accept=".osu"
                onFile={onImportOsuDiff}
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                {t("mapSettings.importOsuDiffHint")}
              </p>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("mapSettings.audio")}
          </h3>
          <div className="flex flex-col gap-2">
            <FileButton
              label={
                audio ? t("mapSettings.replaceAudio") : t("mapSettings.uploadAudio")
              }
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
            {t("mapSettings.background")}
          </h3>
          <div className="flex flex-col gap-2">
            <FileButton
              label={
                background
                  ? t("mapSettings.replaceImage")
                  : t("mapSettings.uploadImage")
              }
              accept="image/*"
              onFile={onBackgroundFile}
            />
            {background && (
              <>
                <div className="flex items-center gap-2">
                  <img
                    src={background.url}
                    alt={t("mapSettings.backgroundPreview")}
                    className="h-12 w-20 rounded object-cover"
                  />
                  <button
                    onClick={onClearBackground}
                    className="text-xs text-accent hover:underline"
                  >
                    {t("common.remove")}
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <span>{t("mapSettings.appliesTo")}</span>
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
                        {s === "mapset"
                          ? t("mapSettings.wholeSet")
                          : t("mapSettings.thisDiff")}
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
              {t("mapSettings.backgroundVideo")}
            </h3>
            <span
              className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
              title={t("mapSettings.noCloudTitle")}
            >
              {t("mapSettings.noCloud")}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <FileButton
              label={
                video ? t("mapSettings.replaceVideo") : t("mapSettings.uploadVideo")
              }
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
                      {t("common.remove")}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{t("mapSettings.startsAt")}</span>
                  <TextInput
                    type="number"
                    value={videoOffsetMs}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value));
                      onVideoOffsetMs(Number.isFinite(v) ? v : 0);
                    }}
                    className="w-24 px-2 py-1 text-xs"
                  />
                  <span>{t("mapSettings.msIntoSong")}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {t("mapSettings.videoHint")}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">
                {t("mapSettings.videoEmptyHint")}
              </p>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t("mapSettings.metadata")}
          </h3>
          <Field label={t("mapSettings.fieldTitle")}>
            <TextInput
              value={meta.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field label={t("mapSettings.fieldArtist")}>
            <TextInput
              value={meta.artist}
              onChange={(e) => set("artist", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("mapSettings.fieldTitleUnicode")}>
              <TextInput
                value={meta.titleUnicode ?? ""}
                onChange={(e) =>
                  set("titleUnicode", e.target.value || undefined)
                }
              />
            </Field>
            <Field label={t("mapSettings.fieldArtistUnicode")}>
              <TextInput
                value={meta.artistUnicode ?? ""}
                onChange={(e) =>
                  set("artistUnicode", e.target.value || undefined)
                }
              />
            </Field>
          </div>
          <Field label={t("mapSettings.fieldCreator")}>
            <TextInput
              value={meta.creator}
              onChange={(e) => set("creator", e.target.value)}
            />
          </Field>
          <Field label={t("mapSettings.fieldTags")}>
            <TextInput
              value={meta.tags ?? ""}
              onChange={(e) => set("tags", e.target.value)}
              placeholder={t("mapSettings.tagsPlaceholder")}
            />
          </Field>
          <Field label={t("mapSettings.fieldSource")}>
            <TextInput
              value={meta.source ?? ""}
              onChange={(e) => set("source", e.target.value || undefined)}
            />
          </Field>
          <p className="text-[11px] text-slate-500">
            {t("mapSettings.tagsHint")}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("mapSettings.beatmapId")}>
              <TextInput
                type="number"
                step={1}
                value={activeDiff?.beatmapId ?? ""}
                onChange={(e) => onBeatmapId?.(parseId(e.target.value))}
                placeholder="0"
                disabled={!onBeatmapId}
              />
            </Field>
            <Field label={t("mapSettings.beatmapSetId")}>
              <TextInput
                type="number"
                step={1}
                value={meta.beatmapSetId ?? ""}
                onChange={(e) => set("beatmapSetId", parseId(e.target.value))}
                placeholder="-1"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={markUnsubmitted}
            disabled={unsubmitted}
            className="self-start rounded-lg border border-white/10 bg-ink-600/75 px-3 py-2 text-sm font-medium text-slate-200 shadow-sm backdrop-blur-sm transition hover:bg-ink-500/85 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-ink-600/75"
          >
            {unsubmitted
              ? t("mapSettings.alreadyUnsubmitted")
              : t("mapSettings.markUnsubmitted")}
          </button>
          <p className="text-[11px] text-slate-500">
            {t("mapSettings.idsHint")}
          </p>
        </section>

        {isSm && onSmMeta && (
          <section className="flex flex-col gap-3 rounded-xl border border-pink-500/20 bg-pink-500/5 p-4">
            <div className="flex items-center gap-2">
              <img
                src="/etterna-logo.png"
                alt="Etterna"
                className="h-4 w-4 object-contain opacity-80"
              />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-pink-300">
                {t("mapSettings.smFields")}
              </h3>
            </div>
            <p className="text-[11px] text-slate-400">
              {t("mapSettings.smFieldsHint")}
            </p>

            <Field label={t("mapSettings.smSubtitle")}>
              <TextInput
                value={sm.subtitle ?? ""}
                onChange={(e) => setSm("subtitle", e.target.value || undefined)}
                placeholder={t("mapSettings.smSubtitlePlaceholder")}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("mapSettings.smTitleTranslit")}>
                <TextInput
                  value={sm.titleTranslit ?? ""}
                  onChange={(e) =>
                    setSm("titleTranslit", e.target.value || undefined)
                  }
                  placeholder={t("mapSettings.smRomanisedTitle")}
                />
              </Field>
              <Field label={t("mapSettings.smSubtitleTranslit")}>
                <TextInput
                  value={sm.subtitleTranslit ?? ""}
                  onChange={(e) =>
                    setSm("subtitleTranslit", e.target.value || undefined)
                  }
                  placeholder={t("mapSettings.smRomanisedSubtitle")}
                />
              </Field>
            </div>

            <Field label={t("mapSettings.smArtistTranslit")}>
              <TextInput
                value={sm.artistTranslit ?? ""}
                onChange={(e) =>
                  setSm("artistTranslit", e.target.value || undefined)
                }
                placeholder={t("mapSettings.smRomanisedArtist")}
              />
            </Field>

            <Field label={t("mapSettings.smGenre")}>
              <TextInput
                value={sm.genre ?? ""}
                onChange={(e) => setSm("genre", e.target.value || undefined)}
                placeholder={t("mapSettings.smGenrePlaceholder")}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("mapSettings.smDisplayBpm")}>
                <TextInput
                  value={sm.displayBpm ?? ""}
                  onChange={(e) =>
                    setSm("displayBpm", e.target.value || undefined)
                  }
                  placeholder={t("mapSettings.smDisplayBpmPlaceholder")}
                />
              </Field>
              <Field label={t("mapSettings.smSampleLength")}>
                <TextInput
                  value={
                    sm.sampleLength !== undefined ? String(sm.sampleLength) : ""
                  }
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setSm("sampleLength", Number.isFinite(v) ? v : undefined);
                  }}
                  placeholder={t("mapSettings.smSampleLengthPlaceholder")}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">
                {t("mapSettings.smSelectable")}
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
      </div>
    </Modal>
  );
}
