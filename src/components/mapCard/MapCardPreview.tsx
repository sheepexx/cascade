import { useEffect, useRef, useState } from "react";
import { drawMapCard, type MapCardImages } from "../../lib/mapCardRender";
import type { MapCardConfig, MapCardData } from "../../lib/mapCard";
import { useT } from "../../lib/i18n";
import { Notice } from "./controls";

export function MapCardPreview({
  data,
  config,
  images,
  revision,
  label,
}: {
  data: MapCardData;
  config: MapCardConfig;
  images: MapCardImages;
  revision: number;
  label: string;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        drawMapCard(canvas, data, config, images);
        setSize((prev) =>
          prev?.width === canvas.width && prev.height === canvas.height
            ? prev
            : { width: canvas.width, height: canvas.height },
        );
        setFailed(null);
      } catch (error) {
        setFailed(error instanceof Error && error.message ? error.message : "");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [data, config, images, revision]);

  return (
    <figure className="flex flex-col gap-2">
      <div className="rounded-xl border border-white/10 bg-ink-900/70 p-3 uimd:p-4">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className={`mx-auto block h-auto w-full max-w-[800px] transition-opacity duration-[var(--motion-quick)] ${
            size ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
      <figcaption className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{t("mapCard.previewCaption")}</span>
        {size && (
          <span className="shrink-0 tabular-nums">
            {t("mapCard.previewSize", {
              width: String(size.width),
              height: String(size.height),
            })}
          </span>
        )}
      </figcaption>
      {failed !== null && (
        <Notice tone="error">{failed || t("mapCard.previewFailed")}</Notice>
      )}
    </figure>
  );
}
