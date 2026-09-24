import { SegmentedControl } from "../ui/Controls";
import {
  MAP_CARD_BLUR_MAX,
  MAP_CARD_OVERLAY_MAX,
  type MapCardBackground,
  type MapCardConfig,
} from "../../lib/mapCard";
import { useT } from "../../lib/i18n";
import type { LoadedImageState } from "../../hooks/useLoadedImage";
import { CardSection, Notice, SliderField, Spinner } from "./controls";

export function MapCardBackgroundControls({
  config,
  background,
  onChange,
}: {
  config: MapCardConfig;
  background: LoadedImageState["status"];
  onChange: (patch: Partial<MapCardConfig>) => void;
}) {
  const t = useT();
  const usesImage = config.backgroundMode !== "none";
  const imageReady = background === "ready";
  const modes: { value: MapCardBackground; label: string }[] = [
    { value: "banner", label: t("mapCard.bgBanner") },
    { value: "full", label: t("mapCard.bgFull") },
    { value: "none", label: t("mapCard.bgNone") },
  ];

  return (
    <CardSection
      title={t("mapCard.background")}
      aside={
        usesImage && background === "loading" ? (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Spinner className="h-3 w-3" />
            {t("mapCard.loadingImage")}
          </span>
        ) : null
      }
    >
      <SegmentedControl
        options={modes}
        value={config.backgroundMode}
        onChange={(backgroundMode) => onChange({ backgroundMode })}
      />
      {usesImage && background === "none" && (
        <Notice tone="warn">{t("mapCard.noBackground")}</Notice>
      )}
      {usesImage && background === "error" && (
        <Notice tone="warn">{t("mapCard.backgroundFailed")}</Notice>
      )}
      {usesImage && (
        <>
          <SliderField
            label={t("mapCard.blur")}
            value={config.blur}
            min={0}
            max={MAP_CARD_BLUR_MAX}
            step={1}
            disabled={!imageReady}
            format={(value) => (value === 0 ? t("mapCard.blurOff") : `${value}px`)}
            onChange={(blur) => onChange({ blur })}
          />
          <SliderField
            label={t("mapCard.darkness")}
            value={config.overlayOpacity}
            min={0}
            max={MAP_CARD_OVERLAY_MAX}
            step={0.05}
            disabled={!imageReady}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(overlayOpacity) => onChange({ overlayOpacity })}
          />
        </>
      )}
    </CardSection>
  );
}
