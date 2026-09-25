import { useCallback, useEffect, useMemo, useState } from "react";
import type { Difficulty, LoadedFile, SongMeta, TimingPoint } from "../../types";
import { Modal } from "../ui/Modal";
import { Dropdown } from "../ui/Dropdown";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { useMsdRatings } from "../../lib/msd/useMsd";
import { computeStarRating } from "../../lib/starRating";
import { triggerDownload } from "../../lib/osuExport";
import {
  BUILT_IN_MAP_CARD_PRESETS,
  DEFAULT_MAP_CARD_CONFIG,
  buildMapCardData,
  loadLastMapCardConfig,
  mapCardConfigsEqual,
  mapCardFilename,
  mapCardKey,
  mapCardMsdStatus,
  saveLastMapCardConfig,
  type MapCardConfig,
  type MapCardPresetOption,
} from "../../lib/mapCard";
import {
  imageAccent,
  mapCardAccent,
  prepareMapCardFonts,
  renderMapCardPng,
} from "../../lib/mapCardRender";
import { useLoadedImage } from "../../hooks/useLoadedImage";
import { siteAsset } from "../../lib/siteAssets";
import { useHostedMapCard } from "../../hooks/useHostedMapCard";
import { useMapCardPresets } from "../../hooks/useMapCardPresets";
import { MapCardPreview } from "../mapCard/MapCardPreview";
import { MapCardHosting } from "../mapCard/MapCardHosting";
import { MapCardPresetPicker } from "../mapCard/MapCardPresetPicker";
import { MapCardBackgroundControls } from "../mapCard/MapCardBackgroundControls";
import { MapCardStyleControls } from "../mapCard/MapCardStyleControls";
import { MapCardStatToggles } from "../mapCard/MapCardStatToggles";
import { MapCardExport } from "../mapCard/MapCardExport";
import { Notice, PanelSection } from "../mapCard/controls";

type Props = {
  open: boolean;
  onClose: () => void;
  meta: SongMeta;
  difficulties: Difficulty[];
  activeId: string;
  sharedTimingPoints: TimingPoint[];
  bgFiles: Record<string, LoadedFile>;
  projectId: string;
  start: MapCardPresetOption | null;
};

type Status = { tone: "success" | "error"; text: string };

const NO_DIFFICULTIES: Difficulty[] = [];

function builtInMatch(config: MapCardConfig): string | null {
  return (
    BUILT_IN_MAP_CARD_PRESETS.find((preset) => mapCardConfigsEqual(preset.config, config))
      ?.id ?? null
  );
}

function backgroundFileFor(
  difficulty: Difficulty,
  difficulties: Difficulty[],
  bgFiles: Record<string, LoadedFile>,
): LoadedFile | null {
  const own = difficulty.backgroundFilename
    ? bgFiles[difficulty.backgroundFilename]
    : undefined;
  if (own) return own;
  for (const other of difficulties) {
    const file = other.backgroundFilename ? bgFiles[other.backgroundFilename] : undefined;
    if (file) return file;
  }
  return null;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function MapCardModal({
  open,
  onClose,
  meta,
  difficulties,
  activeId,
  sharedTimingPoints,
  bgFiles,
  projectId,
  start,
}: Props) {
  const { user, loading: authLoading, login } = useAuth();
  const t = useT();
  const [difficultyId, setDifficultyId] = useState(activeId);
  const [config, setConfig] = useState<MapCardConfig>(
    () => start?.config ?? loadLastMapCardConfig() ?? DEFAULT_MAP_CARD_CONFIG,
  );
  const [presetId, setPresetId] = useState<string | null>(
    () => start?.id ?? builtInMatch(config),
  );
  const [fontsRevision, setFontsRevision] = useState(0);
  const [action, setAction] = useState<"download" | "copy" | "upload" | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [uploadedSignature, setUploadedSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDifficultyId(activeId);
    setStatus(null);
    if (start) {
      setConfig(start.config);
      setPresetId(start.id);
    }
  }, [open, activeId, start]);

  useEffect(() => {
    saveLastMapCardConfig(config);
  }, [config]);

  useEffect(() => {
    if (!status || status.tone === "error") return;
    const timer = window.setTimeout(() => setStatus(null), 4000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const difficulty =
    difficulties.find((d) => d.id === difficultyId) ??
    difficulties.find((d) => d.id === activeId) ??
    difficulties[0];
  const timingPoints = difficulty.timingPoints.length
    ? difficulty.timingPoints
    : sharedTimingPoints;

  const msdInput = useMemo(() => [difficulty], [difficulty]);
  const msdRatings = useMsdRatings(open ? msdInput : NO_DIFFICULTIES);
  const rating = msdRatings[difficulty.id];
  const msdStatus = mapCardMsdStatus(difficulty, rating);

  const data = useMemo(
    () =>
      buildMapCardData({
        meta,
        difficulty,
        timingPoints,
        msd: msdStatus === "ready" ? rating ?? null : null,
      }),
    [meta, difficulty, timingPoints, msdStatus, rating],
  );

  const bgFile = backgroundFileFor(difficulty, difficulties, bgFiles);
  const background = useLoadedImage(open ? bgFile?.url ?? null : null);
  const logo = useLoadedImage(open ? siteAsset("logo.png?v=3") : null);
  const images = useMemo(
    () => ({ background: background.image, logo: logo.image }),
    [background.image, logo.image],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void prepareMapCardFonts(
      `${data.title} ${data.artist} ${data.creator} ${data.difficultyName}`,
    ).then(() => {
      if (!cancelled) setFontsRevision((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [open, data.title, data.artist, data.creator, data.difficultyName]);

  const mapKey = useMemo(
    () => mapCardKey({ projectId, difficulty: { id: difficulty.id, beatmapId: difficulty.beatmapId } }),
    [projectId, difficulty.id, difficulty.beatmapId],
  );
  const userId = user?.id ?? null;
  const hosted = useHostedMapCard(userId, mapKey, open);
  const presets = useMapCardPresets(userId, open);

  const signature = useMemo(
    () => JSON.stringify({ mapKey, config, data, bg: bgFile?.name ?? null }),
    [mapKey, config, data, bgFile?.name],
  );

  const difficultyOptions = useMemo(
    () =>
      difficulties
        .map((d) => ({ d, star: computeStarRating(d.notes, d.keyCount) }))
        .sort((a, b) => a.star - b.star)
        .map(({ d, star }) => ({
          value: d.id,
          label: d.name || t("diffSidebar.unnamed"),
          hint: `${d.keyCount}K · ★ ${star.toFixed(2)}`,
        })),
    [difficulties, t],
  );

  const patch = useCallback(
    (next: Partial<MapCardConfig>) => setConfig((prev) => ({ ...prev, ...next })),
    [],
  );

  const waitingForMsd = config.visibleStats.msd && msdStatus === "loading";
  // Auto takes its colour from the background even when the card hides it.
  const waitingForImage =
    (config.backgroundMode !== "none" || config.accent === "auto") &&
    background.status === "loading";
  const ready = !waitingForMsd && !waitingForImage;
  const busy = action !== null || hosted.status === "uploading";

  const render = useCallback(
    () => renderMapCardPng(data, config, images),
    [data, config, images],
  );

  const download = async () => {
    setAction("download");
    setStatus(null);
    try {
      const { blob } = await render();
      triggerDownload(blob, mapCardFilename(meta, difficulty));
      setStatus({ tone: "success", text: t("mapCard.saved") });
    } catch (error) {
      setStatus({ tone: "error", text: errorText(error, t("mapCard.pngFailed")) });
    } finally {
      setAction(null);
    }
  };

  const copyImage = async () => {
    setAction("copy");
    setStatus(null);
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("unsupported");
      }
      const png = render().then((result) => result.blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setStatus({ tone: "success", text: t("mapCard.copied") });
    } catch {
      setStatus({ tone: "error", text: t("mapCard.copyUnsupported") });
    } finally {
      setAction(null);
    }
  };

  const upload = async () => {
    setAction("upload");
    setStatus(null);
    try {
      const { blob } = await render();
      if (await hosted.upload(blob)) setUploadedSignature(signature);
    } catch (error) {
      setStatus({ tone: "error", text: errorText(error, t("mapCard.pngFailed")) });
    } finally {
      setAction(null);
    }
  };

  const stale =
    !!hosted.card && uploadedSignature !== null && uploadedSignature !== signature;

  const skillsetsShown = config.visibleStats.msd && msdStatus === "ready";
  const accent = mapCardAccent(config, data, images);
  const autoAccent = useMemo(
    () => (background.image ? imageAccent(background.image) : null),
    [background.image],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("mapCard.title")}
      width="max-w-6xl"
      center={false}
    >
      <div className="flex flex-col gap-5 uimd:flex-row uimd:items-start">
        <div className="flex min-w-0 flex-col gap-3 uimd:sticky uimd:top-0 uimd:order-2 uimd:flex-1">
          <MapCardPreview
            data={data}
            config={config}
            images={images}
            revision={fontsRevision}
            accent={accent}
            label={t("mapCard.previewLabel", {
              title: data.title,
              difficulty: data.difficultyName,
            })}
          />

          {difficulty.notes.length === 0 && (
            <Notice tone="warn">{t("mapCard.noNotes")}</Notice>
          )}
          {config.visibleStats.msd && msdStatus === "unsupported" && (
            <Notice>
              {t("mapCard.msdUnsupported", { keys: difficulty.keyCount })}
            </Notice>
          )}
          {config.visibleStats.msd && msdStatus === "empty" && difficulty.notes.length > 0 && (
            <Notice>{t("mapCard.msdEmpty")}</Notice>
          )}
          {config.visibleStats.msd && msdStatus === "failed" && (
            <Notice tone="warn">{t("mapCard.msdFailed")}</Notice>
          )}

          <MapCardExport
            ready={ready}
            busy={busy}
            action={action}
            status={status}
            waiting={
              waitingForMsd
                ? t("mapCard.calculatingMsd")
                : waitingForImage
                  ? t("mapCard.loadingBackground")
                  : null
            }
            onCopy={() => void copyImage()}
            onDownload={() => void download()}
          >
            <MapCardHosting
              hosted={hosted}
              signedIn={!!user}
              authLoading={authLoading}
              ready={ready && action === null}
              stale={stale}
              onLogin={login}
              onUpload={() => void upload()}
            />
          </MapCardExport>
        </div>

        <div className="flex flex-col divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-ink-700/25 uimd:order-1 uimd:w-80 uimd:shrink-0">
          {difficulties.length > 1 && (
            <PanelSection title={t("mapCard.difficulty")}>
              <Dropdown
                value={difficulty.id}
                options={difficultyOptions}
                onChange={setDifficultyId}
                aria-label={t("mapCard.difficulty")}
              />
            </PanelSection>
          )}
          <MapCardPresetPicker
            config={config}
            selectedId={presetId}
            presets={presets}
            signedIn={!!user}
            onLogin={login}
            onSelect={(preset) => {
              if (preset) setConfig(preset.config);
              setPresetId(preset?.id ?? null);
            }}
          />
          <MapCardBackgroundControls
            config={config}
            background={background.status}
            imageUrl={background.status === "ready" ? bgFile?.url ?? null : null}
            accent={accent}
            onChange={patch}
          />
          <MapCardStyleControls
            config={config}
            skillsetsShown={skillsetsShown}
            autoAccent={autoAccent}
            onChange={patch}
          />
          <MapCardStatToggles config={config} onChange={patch} />
        </div>
      </div>
    </Modal>
  );
}
