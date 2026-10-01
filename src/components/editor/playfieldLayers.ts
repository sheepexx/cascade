import { FONT_STACK as CANVAS_FONT_STACK } from "../../lib/fontStack";
import { formatUiNumber } from "../../lib/formatUiNumber";
import type { Translate } from "../../lib/i18n";
import {
  greenPoints,
  gridLineColor,
  redPoints,
  type GridLine,
} from "../../lib/timing";
import type { SnapDivisor, TimingPoint } from "../../types";
import { roundRect } from "./canvasDraw";

/**
 * The layers of the playfield drawn behind the notes: snap lines, the song and
 * trim bounds, and the timing, preview and bookmark markers. The editor calls
 * these once a frame with where the playfield sits and how time maps onto it.
 */

/** Where the playfield sits on the canvas this frame, in CSS pixels. */
export type PlayfieldFrame = {
  width: number;
  height: number;
  originX: number;
  playfieldWidth: number;
  up: boolean;
  timeToY: (time: number) => number;
  yToTime: (y: number) => number;
};

const BOUND_HATCH_STEP = 15;
const BOUND_HATCH_ALPHA = 0.14;
const BOUND_TINT_ALPHA = 0.05;
const BOUND_SONG_RGB = "239,68,68";
const BOUND_TRIM_RGB = "245,158,11";

/** Index of the first point at or after `time` in a time-sorted list. */
export function firstPointFrom(list: TimingPoint[], time: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Beat and snap lines across the playfield, barlines heavier. */
export function drawSnapGrid(
  ctx: CanvasRenderingContext2D,
  frame: PlayfieldFrame,
  lines: GridLine[],
  snapDivisor: SnapDivisor,
) {
  const { height, originX, playfieldWidth, timeToY } = frame;
  for (const line of lines) {
    const y = Math.round(timeToY(line.time)) + 0.5;
    if (y < -4 || y > height + 4) continue;
    const color = line.barline
      ? "rgba(255,255,255,0.9)"
      : gridLineColor(line.idxInBeat, snapDivisor);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = line.barline ? 5 : 4;
    ctx.beginPath();
    ctx.moveTo(originX, y);
    ctx.lineTo(originX + playfieldWidth, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = line.barline ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(originX, y);
    ctx.lineTo(originX + playfieldWidth, y);
    ctx.stroke();
  }
}

/**
 * Hatched bands over the parts of the chart outside the song (red) and outside
 * the trim (amber), each edge labelled.
 */
export function drawPlayfieldBounds(
  ctx: CanvasRenderingContext2D,
  frame: PlayfieldFrame,
  t: Translate,
  {
    songEndMs,
    trimStartMs,
    trimEndMs,
  }: { songEndMs?: number; trimStartMs?: number; trimEndMs?: number },
) {
  const { height, originX, playfieldWidth, up, timeToY } = frame;
  const drawBoundary = (
    time: number,
    outsideLater: boolean,
    rgb: string,
    label: string,
    limit?: number,
  ) => {
    const y = timeToY(time);
    const dir = up ? -1 : 1;
    const sign = outsideLater ? -dir : dir;
    const far =
      limit === undefined ? (sign > 0 ? height : 0) : timeToY(limit);
    const bandTop = Math.max(0, Math.min(y, far));
    const bandBottom = Math.min(height, Math.max(y, far));
    const bandH = bandBottom - bandTop;
    if (bandH > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(originX, bandTop, playfieldWidth, bandH);
      ctx.clip();
      ctx.fillStyle = `rgba(${rgb},${BOUND_TINT_ALPHA})`;
      ctx.fillRect(originX, bandTop, playfieldWidth, bandH);
      ctx.strokeStyle = `rgba(${rgb},${BOUND_HATCH_ALPHA})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= playfieldWidth + bandH; x += BOUND_HATCH_STEP) {
        ctx.moveTo(originX - bandH + x, bandBottom);
        ctx.lineTo(originX + x, bandTop);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (y < -4 || y > height + 4) return;
    const x0 = originX;
    const x1 = originX + playfieldWidth;
    ctx.strokeStyle = `rgba(${rgb},0.26)`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.font = `11px ${CANVAS_FONT_STACK}`;
    ctx.fillText(label, 6, sign > 0 ? y + 14 : y - 6);
  };

  const songEnd = songEndMs ?? 0;
  const trimStart = trimStartMs;
  const trimEnd = trimEndMs;
  drawBoundary(0, false, BOUND_SONG_RGB, t("editor.songStart"));
  if (songEnd > 0) {
    drawBoundary(songEnd, true, BOUND_SONG_RGB, t("editor.songEnd"));
  }
  if (trimStart !== undefined && trimStart > 0) {
    drawBoundary(trimStart, false, BOUND_TRIM_RGB, t("editor.trimStart"), 0);
  }
  if (trimEnd !== undefined && (!(songEnd > 0) || trimEnd < songEnd - 0.5)) {
    drawBoundary(
      trimEnd,
      true,
      BOUND_TRIM_RGB,
      t("editor.trimEnd"),
      songEnd > 0 ? songEnd : undefined,
    );
  }
}

/**
 * Red BPM lines and green SV markers with their labels, the preview point and
 * bookmarks, for whatever is on screen give or take 20 pixels.
 */
export function drawTimingMarkers(
  ctx: CanvasRenderingContext2D,
  frame: PlayfieldFrame,
  t: Translate,
  {
    timingPoints,
    previewTime,
    bookmarks,
  }: { timingPoints: TimingPoint[]; previewTime: number; bookmarks?: number[] },
) {
  const { width, height, originX, playfieldWidth, timeToY, yToTime } = frame;
  const lineEdgeA = yToTime(-20);
  const lineEdgeB = yToTime(height + 20);
  const lineLo = Math.min(lineEdgeA, lineEdgeB);
  const lineHi = Math.max(lineEdgeA, lineEdgeB);

  const reds = redPoints(timingPoints);
  for (let i = firstPointFrom(reds, lineLo); i < reds.length; i++) {
    const tp = reds[i];
    if (tp.time > lineHi) break;
    const y = timeToY(tp.time);
    ctx.strokeStyle = "#ff2d6f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillStyle = "#ff2d6f";
    ctx.font = `11px ${CANVAS_FONT_STACK}`;
    ctx.fillText(`${formatUiNumber(tp.bpm)} BPM`, 6, y - 4);
  }

  const greens = greenPoints(timingPoints);
  for (let i = firstPointFrom(greens, lineLo); i < greens.length; i++) {
    const tp = greens[i];
    if (tp.time > lineHi) break;
    const y = timeToY(tp.time);
    const markerRight = originX + playfieldWidth;
    const markerLeft = Math.max(originX, markerRight - 28);
    const label = `${formatUiNumber(tp.sv)}× SV`;
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(markerLeft, y);
    ctx.lineTo(markerRight, y);
    ctx.stroke();
    ctx.font = `600 12px ${CANVAS_FONT_STACK}`;
    const labelWidth = ctx.measureText(label).width;
    const labelX =
      markerRight + labelWidth + 16 <= width
        ? markerRight + 7
        : markerLeft - labelWidth - 7;
    ctx.fillStyle = "rgba(9,18,23,0.88)";
    roundRect(ctx, labelX - 4, y - 9, labelWidth + 8, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#5eead4";
    ctx.fillText(label, labelX, y + 4);
  }

  if (previewTime >= 0) {
    const y = timeToY(previewTime);
    if (y >= -20 && y <= height + 20) {
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillStyle = "#c084fc";
      ctx.font = `11px ${CANVAS_FONT_STACK}`;
      ctx.fillText(t("editor.previewPoint"), 6, y - 4);
    }
  }

  if (bookmarks?.length) {
    ctx.setLineDash([6, 3]);
    for (const bm of bookmarks) {
      const y = timeToY(bm);
      if (y < -20 || y > height + 20) continue;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillStyle = "#fbbf24";
      ctx.font = `11px ${CANVAS_FONT_STACK}`;
      ctx.fillText(t("editor.bookmark"), 6, y - 4);
    }
    ctx.setLineDash([]);
  }
}
