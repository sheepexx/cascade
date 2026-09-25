import { useEffect, useRef, useState } from "react";
import { drawMapCard, mapCardRgba, type MapCardImages } from "../../lib/mapCardRender";
import {
  mapCardNeedsMorph,
  type MapCardConfig,
  type MapCardData,
} from "../../lib/mapCard";
import { useT } from "../../lib/i18n";
import { Notice } from "./controls";

type Frame = {
  data: MapCardData;
  config: MapCardConfig;
  images: MapCardImages;
};

const FADE =
  "opacity var(--motion-enter) var(--ease-standard), filter var(--motion-enter) var(--ease-standard), transform var(--motion-enter) var(--ease-standard)";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function fadeOut(ghost: HTMLCanvasElement, source: HTMLCanvasElement): void {
  ghost.width = source.width;
  ghost.height = source.height;
  const ctx = ghost.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(source, 0, 0);
  ghost.style.transition = "none";
  ghost.style.opacity = "1";
  ghost.style.filter = "blur(0px)";
  ghost.style.transform = "scale(1)";
  void ghost.offsetWidth;
  ghost.style.transition = FADE;
  ghost.style.opacity = "0";
  ghost.style.filter = "blur(3px)";
  ghost.style.transform = "scale(0.992)";
}

export function MapCardPreview({
  data,
  config,
  images,
  revision,
  label,
  accent,
}: {
  data: MapCardData;
  config: MapCardConfig;
  images: MapCardImages;
  revision: number;
  label: string;
  /** The card's accent, which tints the stage behind it. */
  accent: string;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLCanvasElement>(null);
  const shownRef = useRef<Frame | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [morphing, setMorphing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const shown = shownRef.current;
      const morph =
        !!shown &&
        canvas.width > 0 &&
        !prefersReducedMotion() &&
        (shown.data !== data ||
          shown.images !== images ||
          mapCardNeedsMorph(shown.config, config));
      try {
        if (morph && ghostRef.current) fadeOut(ghostRef.current, canvas);
        drawMapCard(canvas, data, config, images);
        shownRef.current = { data, config, images };
        setMorphing(morph);
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

  const height =
    size && boxWidth > 0 ? (boxWidth * size.height) / size.width : undefined;

  return (
    <figure className="flex flex-col gap-2">
      <div
        className="rounded-2xl border border-white/10 bg-ink-900/80 p-3 transition-[background] duration-500 uimd:px-6 uimd:py-7"
        style={{
          backgroundImage: `radial-gradient(90% 70% at 50% 0%, ${mapCardRgba(accent, 0.13)}, transparent 70%)`,
        }}
      >
        <div
          ref={boxRef}
          className="relative mx-auto w-full max-w-[800px] overflow-hidden"
          style={{
            height,
            transition: morphing
              ? "height var(--motion-enter) var(--ease-emphasized)"
              : "none",
          }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={label}
            className={`block h-auto w-full transition-opacity duration-[var(--motion-quick)] ${
              size ? "opacity-100" : "opacity-0"
            }`}
          />
          <canvas
            ref={ghostRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-auto w-full origin-top opacity-0"
          />
        </div>
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
