import { useState, type ReactNode } from "react";
import type { BackgroundScope, Difficulty, LoadedFile, SmMeta, SongMeta } from "../../types";
import type { BatchRequest } from "../../lib/batchApply";
import { Modal } from "../ui/Modal";
import {
  Button,
  Field,
  FileButton,
  SegmentedControl,
  TextInput,
} from "../ui/Controls";
import { MusicNoteIcon } from "../ui/Icons";
import { BatchApplyPanel } from "./BatchApplyPanel";
import { useT, type Translate } from "../../lib/i18n";

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

type Tab = "metadata" | "media" | "import" | "batch";

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
  const [tab, setTab] = useState<Tab>("metadata");
  const batch =
    activeDiff && onBatchApply && difficulties
      ? { source: activeDiff, difficulties, onApply: onBatchApply }
      : null;
  const shownTab: Tab = tab === "batch" && !batch ? "metadata" : tab;
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

  const tabs: { value: Tab; label: string }[] = [
    { value: "metadata", label: t("mapSettings.metadata") },
    { value: "media", label: t("mapSettings.tabMedia") },
    { value: "import", label: t("mapSettings.import") },
    ...(batch
      ? [{ value: "batch" as const, label: t("mapSettings.tabBatch") }]
      : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("mapSettings.title")}
      width="max-w-2xl"
      height="h-[min(50rem,84vh)]"
    >
      {/* One height for every tab (set on the Modal above), so switching
          tabs never moves the tab bar out from under the pointer. */}
      <div className="flex flex-col gap-4">
        <MapHero
          meta={meta}
          background={background}
          onBackgroundFile={onBackgroundFile}
          t={t}
        />

        <SegmentedControl value={shownTab} onChange={setTab} options={tabs} />

        {shownTab === "batch" && batch && (
          <BatchApplyPanel
            key={batch.source.id}
            source={batch.source}
            difficulties={batch.difficulties}
            onApply={batch.onApply}
            readOnly={Boolean(readOnly)}
            live={live}
          />
        )}

        {shownTab === "metadata" && (
          <div className="flex flex-col gap-3">
            <Group title={t("mapSettings.tabSong")}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("mapSettings.fieldTitle")}>
                  <TextInput
                    value={meta.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </Field>
                <Field label={t("mapSettings.fieldTitleUnicode")}>
                  <TextInput
                    value={meta.titleUnicode ?? ""}
                    onChange={(e) =>
                      set("titleUnicode", e.target.value || undefined)
                    }
                  />
                </Field>
                <Field label={t("mapSettings.fieldArtist")}>
                  <TextInput
                    value={meta.artist}
                    onChange={(e) => set("artist", e.target.value)}
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
            </Group>

            <Group title={t("mapSettings.groupMapping")}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("mapSettings.fieldCreator")}>
                  <TextInput
                    value={meta.creator}
                    onChange={(e) => set("creator", e.target.value)}
                  />
                </Field>
                <Field label={t("mapSettings.fieldSource")}>
                  <TextInput
                    value={meta.source ?? ""}
                    onChange={(e) => set("source", e.target.value || undefined)}
                  />
                </Field>
              </div>
              <Field
                label={t("mapSettings.fieldTags")}
                hint={t("mapSettings.tagsHint")}
              >
                <TextInput
                  value={meta.tags ?? ""}
                  onChange={(e) => set("tags", e.target.value)}
                  placeholder={t("mapSettings.tagsPlaceholder")}
                />
              </Field>
            </Group>

            <Group title={t("mapSettings.groupOnline")}>
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
                    onChange={(e) =>
                      set("beatmapSetId", parseId(e.target.value))
                    }
                    placeholder="-1"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  onClick={markUnsubmitted}
                  disabled={unsubmitted}
                >
                  {unsubmitted
                    ? t("mapSettings.alreadyUnsubmitted")
                    : t("mapSettings.markUnsubmitted")}
                </Button>
                <p className="min-w-0 flex-1 text-[11px] text-slate-500">
                  {t("mapSettings.idsHint")}
                </p>
              </div>
            </Group>

            {isSm && onSmMeta && (
              <section className="flex flex-col gap-3 rounded-xl border border-pink-500/20 bg-pink-500/5 p-4">
                <div className="flex items-center gap-2">
                  <img
                    src="/etterna-logo.png"
                    alt="Etterna"
                    className="h-4 w-4 object-contain opacity-80"
                  />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-pink-300">
                    {t("mapSettings.smFields")}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400">
                  {t("mapSettings.smFieldsHint")}
                </p>

                <Field label={t("mapSettings.smSubtitle")}>
                  <TextInput
                    value={sm.subtitle ?? ""}
                    onChange={(e) =>
                      setSm("subtitle", e.target.value || undefined)
                    }
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
                        sm.sampleLength !== undefined
                          ? String(sm.sampleLength)
                          : ""
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setSm(
                          "sampleLength",
                          Number.isFinite(v) ? v : undefined,
                        );
                      }}
                      placeholder={t("mapSettings.smSampleLengthPlaceholder")}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {t("mapSettings.smSelectable")}
                  </span>
                  <SegmentedControl
                    value={sm.selectable ?? "YES"}
                    onChange={(v) => setSm("selectable", v)}
                    options={[
                      { value: "YES", label: "YES" },
                      { value: "NO", label: "NO" },
                    ]}
                    className="w-40"
                  />
                </div>
              </section>
            )}
          </div>
        )}

        {shownTab === "media" && (
          <div className="flex flex-col gap-3">
            <AssetTile
              icon={<MusicNoteIcon className="h-6 w-6" />}
              title={t("mapSettings.audio")}
              fileName={audio?.name}
              emptyText={t("mapSettings.noFileYet")}
              action={
                <FileButton
                  label={
                    audio
                      ? t("mapSettings.replaceAudio")
                      : t("mapSettings.uploadAudio")
                  }
                  accept="audio/mpeg,audio/ogg,.mp3,.ogg"
                  onFile={onAudioFile}
                />
              }
            />

            <AssetTile
              icon={<ImageGlyph />}
              preview={
                background ? (
                  <img
                    src={background.url}
                    alt={t("mapSettings.backgroundPreview")}
                    className="h-full w-full object-cover"
                  />
                ) : undefined
              }
              title={t("mapSettings.background")}
              fileName={background?.name}
              emptyText={t("mapSettings.noFileYet")}
              onRemove={background ? onClearBackground : undefined}
              removeLabel={t("common.remove")}
              action={
                <FileButton
                  label={
                    background
                      ? t("mapSettings.replaceImage")
                      : t("mapSettings.uploadImage")
                  }
                  accept="image/*"
                  onFile={onBackgroundFile}
                />
              }
            >
              {background && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span>{t("mapSettings.appliesTo")}</span>
                  <SegmentedControl
                    value={bgScope}
                    onChange={onBgScope}
                    options={[
                      { value: "mapset", label: t("mapSettings.wholeSet") },
                      { value: "difficulty", label: t("mapSettings.thisDiff") },
                    ]}
                    className="w-64"
                  />
                </div>
              )}
            </AssetTile>

            <AssetTile
              icon={<VideoGlyph />}
              preview={
                video ? (
                  <video
                    src={video.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : undefined
              }
              title={t("mapSettings.backgroundVideo")}
              badge={
                <span
                  className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                  title={t("mapSettings.noCloudTitle")}
                >
                  {t("mapSettings.noCloud")}
                </span>
              }
              fileName={video?.name}
              emptyText={t("mapSettings.noFileYet")}
              onRemove={video ? onClearVideo : undefined}
              removeLabel={t("common.remove")}
              action={
                <FileButton
                  label={
                    video
                      ? t("mapSettings.replaceVideo")
                      : t("mapSettings.uploadVideo")
                  }
                  accept="video/*,.mp4,.webm,.avi,.flv,.mov,.wmv,.m4v"
                  onFile={onVideoFile}
                />
              }
            >
              {video ? (
                <>
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
            </AssetTile>
          </div>
        )}

        {shownTab === "import" && (
          <div className="flex flex-col gap-3">
            <Group title={t("mapSettings.import")}>
              <div className="flex flex-wrap gap-2">
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
                  <Button variant="primary" onClick={onImportSmPack}>
                    {t("mapSettings.importSmPack")}
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {t("mapSettings.importHint")}
              </p>
            </Group>
            {onImportOsuDiff && (
              <Group>
                <div>
                  <FileButton
                    label={t("mapSettings.importOsuDiff")}
                    accept=".osu"
                    onFile={onImportOsuDiff}
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  {t("mapSettings.importOsuDiffHint")}
                </p>
              </Group>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The set as it will show in a song list: its background (or a soft glow
 *  without one) under the title, artist and creator, live as they're typed. */
function MapHero({
  meta,
  background,
  onBackgroundFile,
  t,
}: {
  meta: SongMeta;
  background: LoadedFile | null;
  onBackgroundFile: (f: File) => void;
  t: Translate;
}) {
  const title = meta.title.trim() || t("mapSettings.untitled");
  return (
    <div className="relative h-40 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-ink-700">
      {background ? (
        <img
          src={background.url}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(110%_130%_at_0%_0%,rgba(232,104,104,0.34),transparent_58%),radial-gradient(110%_130%_at_100%_100%,rgba(91,192,255,0.2),transparent_58%)]"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/55 to-ink-900/0"
      />
      <div className="absolute inset-x-4 bottom-3.5 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          {meta.artist.trim() && (
            <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-accent-soft">
              {meta.artist}
            </p>
          )}
          <p
            className="truncate text-xl font-bold leading-tight text-white"
            title={title}
          >
            {title}
          </p>
          {meta.creator.trim() && (
            <p className="mt-0.5 truncate text-xs text-slate-300">
              {t("mapSettings.mappedBy", { creator: meta.creator })}
            </p>
          )}
        </div>
        <label className="shrink-0 cursor-pointer rounded-lg border border-white/15 bg-ink-900/60 px-2.5 py-1.5 text-xs font-medium text-slate-100 backdrop-blur-md transition duration-[var(--motion-quick)] hover:bg-ink-800/85 focus-within:ring-2 focus-within:ring-accent/60 active:scale-[0.98]">
          {background
            ? t("mapSettings.replaceImage")
            : t("mapSettings.uploadImage")}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onBackgroundFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-ink-700/30 p-4">
      {title && (
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

/** One media file: a preview (or icon), its name and its actions, with any
 *  settings for it underneath. */
function AssetTile({
  icon,
  preview,
  title,
  badge,
  fileName,
  emptyText,
  action,
  onRemove,
  removeLabel,
  children,
}: {
  icon: ReactNode;
  preview?: ReactNode;
  title: string;
  badge?: ReactNode;
  fileName?: string;
  emptyText: string;
  action: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-ink-700/30 p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-ink-900/60 text-slate-500">
          {preview ?? icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {badge}
          </div>
          <p
            className={`truncate text-xs ${
              fileName ? "text-slate-300" : "text-slate-500"
            }`}
            title={fileName}
          >
            {fileName ?? emptyText}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onRemove && (
            <Button onClick={onRemove} className="px-2.5 py-1.5 text-xs">
              {removeLabel}
            </Button>
          )}
          {action}
        </div>
      </div>
      {children && (
        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}

function ImageGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M21 16l-5-5-9 9" />
    </svg>
  );
}

function VideoGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6"
    >
      <rect x="3" y="5" width="13" height="14" rx="3" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
}
