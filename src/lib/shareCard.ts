import { starColor } from "./starRating";
import type { ManiaNote, TimingPoint } from "../types";
import { gridLinesInRange, gridLineColor } from "./timing";
import { nearestSnap } from "./aimod";
import { FONT_STACK } from "./fontStack";
import { t } from "./i18n/core";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export type ShareCardInfo = {
  title: string;
  artist: string;
  creator: string;
  keyCounts: number[];
  starRating: number | null;
  lengthMs: number | null;
  bpm: number | null;
  noteCount: number;
  backgroundUrl?: string | null;
};

const BG = "#0b0b10";
const TEXT = "#eef0f6";
const MUTED = "#949aa8";
const ACCENT = "#f45a5a";

/** A self-contained pattern card; no background fetches or tainted canvases. */
export function renderPatternCard(info: {
  notes: ManiaNote[]; keyCount: number; timingPoints: TimingPoint[];
  title: string; difficulty: string; upscroll?: boolean;
}): Promise<Blob> {
  if (!info.notes.length) return Promise.reject(new Error(t("lib.selectNotes")));
  const start = info.notes.reduce((time, n) => Math.min(time, n.startTime), Infinity);
  const end = info.notes.reduce((time, n) => Math.max(time, n.endTime ?? n.startTime), -Infinity);
  const span = Math.max(500, end - start);
  const fieldHeight = Math.min(3400, Math.max(500, span * 0.35));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(560, info.keyCount * 66 + 144);
  canvas.height = fieldHeight + 210;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error(t("lib.noCanvas")));
  const left = 105, top = 140, lane = (canvas.width - left - 35) / info.keyCount;
  const y = (ms: number) => top + 16 + (info.upscroll ? ms - start : span - (ms - start)) / span * (fieldHeight - 32);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = headFont(24); ctx.fillStyle = TEXT;
  ctx.fillText(fitText(ctx, info.title, canvas.width - 64), 32, 42);
  ctx.font = bodyFont(14); ctx.fillStyle = MUTED;
  ctx.fillText(fitText(ctx, `${info.difficulty} · ${info.keyCount}K · ${info.notes.length} notes`, canvas.width - 64), 32, 69);
  ctx.fillText(`${(start / 1000).toFixed(3)}s – ${(end / 1000).toFixed(3)}s`, 32, 93);
  for (let c = 0; c < info.keyCount; c++) {
    ctx.fillStyle = c % 2 ? "#171b28" : "#111521";
    ctx.fillRect(left + c * lane, top, lane - 1, fieldHeight);
    ctx.fillStyle = MUTED; ctx.textAlign = "center";
    ctx.fillText(String(c + 1), left + (c + 0.5) * lane, top - 12);
  }
  ctx.textAlign = "right"; ctx.font = bodyFont(11);
  const lines = gridLinesInRange(start, start + span, info.timingPoints, 1);
  let lastLabel = -Infinity;
  for (const line of lines) {
    const py = y(line.time);
    ctx.fillStyle = "#ffffff18"; ctx.fillRect(left, py, canvas.width - left - 35, 1);
    if (Math.abs(py - lastLabel) >= 28) {
      ctx.fillStyle = MUTED; ctx.fillText(`${(line.time / 1000).toFixed(2)}s`, left - 10, py + 4); lastLabel = py;
    }
  }
  for (const note of info.notes) {
    const x = left + note.column * lane + 5, py = y(note.startTime);
    if (note.endTime !== undefined) {
      const tail = y(note.endTime);
      ctx.fillStyle = "#5eead459"; ctx.fillRect(x + 7, Math.min(py, tail), lane - 24, Math.max(2, Math.abs(tail - py)));
      ctx.fillStyle = "#99f6e4"; ctx.fillRect(x, tail - 2, lane - 10, 4);
    }
    const divisor = nearestSnap(note.startTime, info.timingPoints).divisor;
    ctx.fillStyle = gridLineColor(divisor === 1 ? 0 : 1, divisor);
    ctx.fillRect(x, py - 5, lane - 10, 10);
    ctx.fillStyle = "#ffffff80"; ctx.fillRect(x, py - 5, lane - 10, 2);
  }
  ctx.textAlign = "left"; ctx.fillStyle = MUTED; ctx.font = bodyFont(12);
  ctx.fillText("CASCADE · Pattern selection", 32, canvas.height - 25);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(t("lib.pngFailed"))), "image/png"));
}

// Cards are shared as images, so they carry the same typeface as the app.
function headFont(size: number, weight = 700): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

function bodyFont(size: number, weight = 400): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

export function formatLength(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function cardChips(info: ShareCardInfo): string[] {
  const chips: string[] = [];
  if (info.keyCounts.length) chips.push(info.keyCounts.map((k) => `${k}K`).join(" · "));
  const length = formatLength(info.lengthMs);
  if (length) chips.push(length);
  if (info.bpm != null && info.bpm > 0) chips.push(`${Math.round(info.bpm)} BPM`);
  if (info.noteCount > 0) chips.push(`${info.noteCount.toLocaleString("en-US")} notes`);
  return chips;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
): void {
  const iw = (img as HTMLImageElement).naturalWidth || CARD_WIDTH;
  const ih = (img as HTMLImageElement).naturalHeight || CARD_HEIGHT;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function renderShareCard(info: ShareCardInfo): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (document.fonts?.ready) {
    await document.fonts.ready.catch(() => {});
  }

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const bg = info.backgroundUrl ? await loadImage(info.backgroundUrl) : null;
  if (bg) {
    ctx.save();
    ctx.filter = "blur(3px)";
    ctx.globalAlpha = 0.55;
    drawCover(ctx, bg, CARD_WIDTH, CARD_HEIGHT);
    ctx.restore();
  }

  const shade = ctx.createLinearGradient(0, 0, CARD_WIDTH * 0.9, 0);
  shade.addColorStop(0, "rgba(11,11,16,0.95)");
  shade.addColorStop(0.55, "rgba(11,11,16,0.82)");
  shade.addColorStop(1, "rgba(11,11,16,0.45)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const bottom = ctx.createLinearGradient(0, CARD_HEIGHT - 220, 0, CARD_HEIGHT);
  bottom.addColorStop(0, "rgba(11,11,16,0)");
  bottom.addColorStop(1, "rgba(11,11,16,0.92)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, CARD_HEIGHT - 220, CARD_WIDTH, 220);

  const left = 78;
  const maxWidth = CARD_WIDTH - left * 2;

  ctx.fillStyle = ACCENT;
  ctx.font = headFont(19, 600);
  ctx.letterSpacing = "3px";
  ctx.fillText("CASCADE · OSU!MANIA", left, 108);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = TEXT;
  ctx.font = headFont(66);
  ctx.fillText(fitText(ctx, info.title || "Untitled", maxWidth), left, 244);

  ctx.fillStyle = MUTED;
  ctx.font = bodyFont(31);
  ctx.fillText(fitText(ctx, info.artist || "", maxWidth), left, 296);

  if (info.creator) {
    ctx.fillStyle = "#c3c7d1";
    ctx.font = bodyFont(26, 500);
    ctx.fillText(fitText(ctx, `mapped by ${info.creator}`, maxWidth), left, 348);
  }

  const chips = cardChips(info);
  if (chips.length) {
    ctx.font = bodyFont(26, 500);
    let x = left;
    const y = CARD_HEIGHT - 118;
    for (const chip of chips) {
      const w = ctx.measureText(chip).width + 34;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.roundRect(x, y - 30, w, 48, 12);
      ctx.fill();
      ctx.fillStyle = "#cfd2dc";
      ctx.fillText(chip, x + 17, y + 2);
      x += w + 12;
    }
  }

  if (info.starRating != null && info.starRating > 0) {
    const label = `★ ${info.starRating.toFixed(2)}`;
    ctx.font = headFont(34, 700);
    const w = ctx.measureText(label).width + 40;
    const x = CARD_WIDTH - left - w;
    const y = CARD_HEIGHT - 148;
    ctx.fillStyle = starColor(info.starRating);
    ctx.beginPath();
    ctx.roundRect(x, y, w, 58, 14);
    ctx.fill();
    ctx.fillStyle = info.starRating >= 6.5 ? "#f6d98a" : "#12121a";
    ctx.fillText(label, x + 20, y + 40);
  }

  ctx.fillStyle = MUTED;
  ctx.font = bodyFont(23, 500);
  ctx.fillText("cascade.sheepex.net", left, CARD_HEIGHT - 46);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
