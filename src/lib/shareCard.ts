import { starColor } from "./starRating";

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

function headFont(size: number, weight = 700): string {
  return `${weight} ${size}px Quicksand, Inter, "Segoe UI", sans-serif`;
}

function bodyFont(size: number, weight = 400): string {
  return `${weight} ${size}px Inter, "Segoe UI", sans-serif`;
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
