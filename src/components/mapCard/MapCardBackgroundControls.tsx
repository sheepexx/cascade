import type { CSSProperties } from "react";
import {
  MAP_CARD_BLUR_MAX,
  MAP_CARD_OVERLAY_MAX,
  type MapCardBackground,
  type MapCardConfig,
} from "../../lib/mapCard";
import { useT } from "../../lib/i18n";
import type { LoadedImageState } from "../../hooks/useLoadedImage";
import { CheckIcon } from "../ui/Icons";
import { Notice, PanelSection, SliderField, Spinner } from "./controls";

const NO_PICTURE = "linear-gradient(135deg, #3b3450 0%, #232638 55%, #1b1d2a 100%)";

/** A tiny card sketched in the chosen mode, from the map's own background. */
function ModeThumb({
  mode,
  imageUrl,
  accent,
  blur,
  darkness,
}: {
  mode: MapCardBackground;
  imageUrl: string | null;
  accent: string;
  blur: number;
  darkness: number;
}) {
  const picture: CSSProperties = {
    backgroundImage: imageUrl ? `url("${imageUrl}")` : NO_PICTURE,
    backgroundSize: "cover",
    backgroundPosition: "center",
    // The thumbnail is about a sixth of the card's width.
    filter: blur > 0 ? `blur(${Math.max(0.5, blur / 6)}px)` : undefined,
  };
  return (
    <span
      aria-hidden
      className="relative block aspect-[16/11] w-full overflow-hidden rounded-[7px] bg-gradient-to-b from-[#1c1c26] to-[#111117]"
    >
      {mode === "banner" && (
        <>
          <span className="absolute inset-x-0 top-0 h-[52%] scale-110" style={picture} />
          <span
            className="absolute inset-x-0 top-0 h-[52%]"
            style={{
              background: `linear-gradient(to bottom, rgba(0,0,0,${darkness * 0.6}), #1a1a23)`,
            }}
          />
        </>
      )}
      {mode === "full" && (
        <>
          <span className="absolute inset-0 scale-110" style={picture} />
          <span
            className="absolute inset-0"
            style={{ background: `rgba(10,10,15,${0.25 + darkness * 0.6})` }}
          />
        </>
      )}
      <span className="absolute inset-x-[9%] bottom-[12%] flex flex-col gap-[3px]">
        <span className="h-[4px] w-3/5 rounded-full bg-white/80" />
        <span className="h-[3px] w-2/5 rounded-full bg-white/35" />
        <span className="mt-[3px] flex gap-[3px]">
          {[0.9, 0.65, 0.45].map((alpha) => (
            <span
              key={alpha}
              className="h-[5px] flex-1 rounded-[2px]"
              style={{ background: accent, opacity: alpha }}
            />
          ))}
        </span>
      </span>
    </span>
  );
}

export function MapCardBackgroundControls({
  config,
  background,
  imageUrl,
  accent,
  onChange,
}: {
  config: MapCardConfig;
  background: LoadedImageState["status"];
  imageUrl: string | null;
  accent: string;
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
    <PanelSection
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
      <div
        role="radiogroup"
        aria-label={t("mapCard.background")}
        className="grid grid-cols-3 gap-2"
      >
        {modes.map((mode) => {
          const selected = config.backgroundMode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ backgroundMode: mode.value })}
              className={`group flex flex-col gap-1.5 rounded-[10px] border p-1 text-left transition duration-[var(--motion-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97] ${
                selected
                  ? "border-accent/70 bg-accent/10 shadow-[0_0_0_1px_rgba(232,104,104,0.25),0_6px_18px_-8px_rgba(232,104,104,0.45)]"
                  : "border-white/[0.08] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
              }`}
            >
              <span
                className={`block transition-opacity duration-[var(--motion-quick)] ${
                  selected ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                }`}
              >
                <ModeThumb
                  mode={mode.value}
                  imageUrl={imageUrl}
                  accent={accent}
                  blur={selected ? config.blur : 0}
                  darkness={selected ? config.overlayOpacity : 0.3}
                />
              </span>
              <span
                className={`flex items-center justify-between gap-1 px-1 pb-0.5 text-[12px] font-medium ${
                  selected ? "text-slate-100" : "text-slate-400 group-hover:text-slate-200"
                }`}
              >
                <span className="truncate">{mode.label}</span>
                {selected && <CheckIcon className="h-3 w-3 shrink-0 text-accent" />}
              </span>
            </button>
          );
        })}
      </div>
      {usesImage && background === "none" && (
        <Notice tone="warn">{t("mapCard.noBackground")}</Notice>
      )}
      {usesImage && background === "error" && (
        <Notice tone="warn">{t("mapCard.backgroundFailed")}</Notice>
      )}
      {usesImage && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
        </div>
      )}
    </PanelSection>
  );
}
