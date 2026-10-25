import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { menuMetrics } from "../../lib/menuLayout";
import { reduceMotion } from "../../lib/performanceMode";

const SESSION_KEY = "cascade:intro:shown";
// Never hold the curtain longer than this waiting on `ready`.
const MAX_INTRO_MS = 6000;

/*
 * The close of osu!lazer's default intro (IntroTriangles), with its timing,
 * transforms and easings as in its source: the logo's rim drawn on while it
 * shrinks into place, then a white flash as the real logo takes over. Sizes
 * are lazer's units, scaled so its logo (485 units across: a 512-unit sprite
 * whose circle fills 94.7%) matches the menu's closed logo.
 */
const RIM_MS = 920;
const LAZER_LOGO_UNITS = 485;
// LazerLogo is 960 units square; its strokes are 5 of the textures' 1295px.
const RIM_SIZE = 960;
const RIM_STROKE = (RIM_SIZE * 5) / 1295;
// The rim's inner edge, as in Cascade's logo (960 of 1066.67).
const RIM_INNER = 0.9;

/*
 * When each part of the rim appears, from lazer's logo-highlight (white) and
 * logo-background (grey, drawn over it) textures: the shader shows a pixel
 * once its red channel is below the progress. Sampled every 5 degrees
 * clockwise from 12 o'clock, on 0-255. The outer edge starts at the top and
 * runs anticlockwise; the inner edge starts at the bottom and runs clockwise.
 */
const HIGHLIGHT_OUTER = [10, 213, 209, 206, 201, 196, 191, 184, 178, 172, 165, 159, 153, 148, 142, 136, 128, 121, 117, 114, 111, 104, 97, 89, 81, 75, 70, 65, 60, 55, 51, 47, 44, 40, 37, 36, 34, 33, 31, 29, 28, 26, 25, 24, 23, 22, 21, 20, 19, 18, 18, 17, 16, 16, 15, 15, 14, 14, 13, 13, 12, 12, 12, 11, 11, 11, 10, 10, 10, 10, 10, 10];
const HIGHLIGHT_INNER = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8];
const BACKGROUND_OUTER = [30, 238, 234, 230, 225, 221, 217, 212, 208, 203, 198, 193, 187, 182, 177, 172, 165, 158, 155, 156, 153, 149, 144, 138, 133, 128, 124, 120, 116, 112, 108, 105, 101, 98, 95, 93, 90, 88, 85, 83, 80, 77, 74, 71, 68, 66, 63, 60, 58, 56, 54, 53, 52, 50, 49, 48, 46, 45, 44, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 31];
const BACKGROUND_INNER = [15, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 23, 24, 24, 24, 24, 25, 25, 26, 26, 27, 28, 28, 29, 29, 5, 5, 5, 5, 5, 6, 6, 6, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 10, 10, 10, 10, 11, 11, 12, 12, 12, 13, 13, 14, 14, 14, 15, 15, 15];
const SAMPLE_DEG = 5;

/** Clockwise samples reordered along a stroke, kept rising so it never retreats. */
function along(clockwise: number[], startIndex: number, anticlockwise: boolean): number[] {
  const n = clockwise.length;
  let peak = 0;
  return clockwise.map((_, i) => {
    const index = anticlockwise ? (startIndex - i + n) % n : (startIndex + i) % n;
    peak = Math.max(peak, clockwise[index]);
    return peak;
  });
}

const RIM_LAYERS = [
  { colour: "#ffffff", outer: along(HIGHLIGHT_OUTER, 0, true), inner: along(HIGHLIGHT_INNER, 36, false) },
  // OsuColour.Gray(0.6f)
  { colour: "#999999", outer: along(BACKGROUND_OUTER, 0, true), inner: along(BACKGROUND_INNER, 36, false) },
];

/** Degrees of a stroke drawn at `progress` (0-1). */
function drawnDegrees(stroke: number[], progress: number): number {
  const threshold = progress * 255;
  for (let i = 0; i < stroke.length; i++) {
    const from = stroke[i];
    if (from >= threshold) return i * SAMPLE_DEG;
    const to = stroke[i + 1] ?? from;
    if (to >= threshold) return (i + (threshold - from) / (to - from)) * SAMPLE_DEG;
  }
  return 360;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const inQuint = (x: number) => x ** 5;
const inQuad = (x: number) => x * x;

function shouldShow(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

function closedLogo(): number {
  return menuMetrics(window.innerWidth, window.innerHeight).logoClosed;
}

/**
 * `ready` reports that the menus' code has finished loading; the intro draws
 * the rim and then waits for it, so the first modal opens instantly.
 */
export function SessionIntro({
  enabled,
  ready,
  onCoveringChange,
}: {
  enabled: boolean;
  ready: boolean;
  /** Whether the curtain hides the menu; false from the moment it lifts,
   *  which is also when the menu's song starts. */
  onCoveringChange?: (covering: boolean) => void;
}) {
  const t = useT();
  const [visible, setVisible] = useState(() => enabled && shouldShow());
  const [played, setPlayed] = useState(false);
  const [flash, setFlash] = useState(false);
  // With reduced motion the curtain just holds the logo where the menu's is.
  const [still] = useState(reduceMotion);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!enabled) setVisible(false);
  }, [enabled]);

  useEffect(() => {
    onCoveringChange?.(visible);
  }, [onCoveringChange, visible]);

  // Lazer swaps its drawn rim for the real logo in one frame, under a flash.
  const finish = useCallback(() => {
    if (!visible) return;
    setVisible(false);
    if (!still) setFlash(true);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // A private browsing context may not expose session storage.
    }
  }, [still, visible]);

  useEffect(() => {
    if (!visible) return;
    const cap = window.setTimeout(finish, MAX_INTRO_MS);
    const onKey = () => finish();
    window.addEventListener("keydown", onKey, { once: true });
    return () => {
      window.clearTimeout(cap);
      window.removeEventListener("keydown", onKey);
    };
  }, [finish, visible]);

  useEffect(() => {
    if (played && ready) finish();
  }, [finish, played, ready]);

  useEffect(() => {
    if (!visible) return;
    if (still) {
      setPlayed(true);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let unit = 1;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      unit = closedLogo() / LAZER_LOGO_UNITS;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawRim = (elapsed: number) => {
      const progress = clamp01(elapsed / RIM_MS);
      // lazerLogo holds at 1.2, then drops to 0.4 over the last 30% (InQuint)
      // inside a container easing 1.2 to 1 (InQuad), matching flyte's curve.
      const hold = RIM_MS * 0.7;
      const logoScale = 1.2 - 0.8 * inQuint(clamp01((elapsed - hold) / (RIM_MS - hold)));
      const containerScale = 1.2 - 0.2 * inQuad(progress);
      const scale = logoScale * containerScale * unit;
      const radius = (RIM_SIZE / 2) * scale;
      const stroke = RIM_STROKE * scale;
      const cx = width / 2;
      const cy = height / 2;
      ctx.lineWidth = stroke;
      ctx.lineCap = "butt";
      for (const layer of RIM_LAYERS) {
        ctx.strokeStyle = layer.colour;
        const outer = drawnDegrees(layer.outer, progress);
        if (outer > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius - stroke / 2, -Math.PI / 2, -Math.PI / 2 - (outer * Math.PI) / 180, true);
          ctx.stroke();
        }
        const inner = drawnDegrees(layer.inner, progress);
        if (inner > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius * RIM_INNER, Math.PI / 2, Math.PI / 2 + (inner * Math.PI) / 180);
          ctx.stroke();
        }
      }
    };

    let reported = false;
    let raf = 0;
    // Timed from the first frame actually drawn, not from mounting: the
    // desktop window loads hidden behind its splash, and frames only start
    // once it is shown, so the rim must not have already "played" by then.
    let start: number | null = null;
    const frame = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);
      // Past the end the drawn rim holds until the menu is ready.
      drawRim(Math.min(elapsed, RIM_MS));
      if (elapsed >= RIM_MS && !reported) {
        reported = true;
        setPlayed(true);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [still, visible]);

  return (
    <>
      {visible && (
        <button
          type="button"
          onClick={finish}
          className="session-intro fixed inset-0 z-[500] cursor-pointer overflow-hidden bg-black font-display text-white"
          aria-label={t("intro.skipLabel")}
        >
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />
          {still && (
            <img
              src={`${import.meta.env.BASE_URL}logo.svg?v=1`}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
              style={{ width: closedLogo(), height: closedLogo() }}
            />
          )}
          <span className="absolute inset-x-0 bottom-6 text-center text-[10px] uppercase tracking-[0.22em] text-white/30">
            {t("intro.skip")}
          </span>
        </button>
      )}
      {flash && (
        // GameWideFlash: additive white, gone over a second (Easing.Out).
        <div
          aria-hidden
          className="intro-flash pointer-events-none fixed inset-0 z-[500] bg-white"
          onAnimationEnd={() => setFlash(false)}
        />
      )}
    </>
  );
}
