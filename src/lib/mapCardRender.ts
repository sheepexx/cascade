import { FONT_STACK } from "./fontStack";
import { starColor, starTextOn } from "./starRating";
import { dominantSkillset, msdColor, msdSkillsetLabel } from "./msd/display";
import { MSD_SKILLSET_KEYS } from "./msd/minacalc";
import { fitText, formatLength } from "./shareCard";
import { formatUiNumber } from "./formatUiNumber";
import { t } from "./i18n/core";
import {
  MAP_CARD_ACCENT_COLORS,
  accentFromPixels,
  formatCardBpm,
  formatCardCount,
  type MapCardBackground,
  type MapCardConfig,
  type MapCardData,
} from "./mapCard";

export const MAP_CARD_WIDTH = 800;
export const MAP_CARD_EXPORT_SCALE = 2;

const TEXT = "#f3f4f8";
const SOFT = "#d4d7df";
const MUTED = "#a3a8b5";
const DIM = "#7a808e";
const BASE_TOP = "#1c1c26";
const BASE_BOTTOM = "#111117";
const RADIUS = 20;

type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

export type MapCardImages = {
  background: HTMLImageElement | null;
  /** The Cascade logo for the footer; accent dots stand in until it loads. */
  logo?: HTMLImageElement | null;
};

type Density = {
  pad: number;
  bannerH: number;
  title: number;
  artist: number;
  meta: number;
  chipH: number;
  gap: number;
  barsH: number;
  tileH: number;
  tileGap: number;
  statH: number;
  pillH: number;
  pillFont: number;
  footerH: number;
};

const DENSITY: Record<MapCardConfig["layout"], Density> = {
  detailed: {
    pad: 28,
    bannerH: 212,
    title: 32,
    artist: 17,
    meta: 14.5,
    chipH: 26,
    gap: 14,
    barsH: 164,
    tileH: 64,
    tileGap: 10,
    statH: 66,
    pillH: 30,
    pillFont: 13,
    footerH: 46,
  },
  compact: {
    pad: 22,
    bannerH: 150,
    title: 27,
    artist: 15,
    meta: 13.5,
    chipH: 24,
    gap: 12,
    barsH: 100,
    tileH: 52,
    tileGap: 8,
    statH: 0,
    pillH: 26,
    pillFont: 12,
    footerH: 40,
  },
};

type Block = { y: number; h: number };

type Segment = { text: string; strong: boolean };

type StatItem = {
  label: string;
  value: string;
  sub?: string;
  chip: Segment[];
};

type SkillEntry = { label: string; value: number; overall: boolean };

export type MapCardPlan = {
  width: number;
  height: number;
  mode: MapCardBackground;
  layout: MapCardConfig["layout"];
  density: Density;
  header: Block & { contentTop: number };
  skills: Block | null;
  stats: Block | null;
  footer: Block | null;
  items: StatItem[];
};

function font(size: number, weight = 600): string {
  return `${weight} ${size}px ${FONT_STACK}`;
}

function parseColor(color: string): Rgb | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function luminance([r, g, b]: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function rgba(color: string | Rgb, alpha: number): string {
  const c = typeof color === "string" ? parseColor(color) ?? [232, 104, 104] : color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/** A card colour at some opacity, for UI drawn around the card. */
export function mapCardRgba(color: string, alpha: number): string {
  return rgba(color, alpha);
}

function mix(a: string, b: string, t: number): Rgb {
  const ca = parseColor(a) ?? [0, 0, 0];
  const cb = parseColor(b) ?? [0, 0, 0];
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(ca[0] + (cb[0] - ca[0]) * k),
    Math.round(ca[1] + (cb[1] - ca[1]) * k),
    Math.round(ca[2] + (cb[2] - ca[2]) * k),
  ];
}

function inkOn(color: string): string {
  const c = parseColor(color);
  return c && luminance(c) > 0.6 ? "#15151c" : "#ffffff";
}

const imageAccents = new WeakMap<HTMLImageElement, string | null>();

/**
 * The accent the "Auto" option takes from a background, worked out once per
 * image from a small copy of it. Null when the picture has too little colour,
 * or when the browser will not let the canvas read it back.
 */
export function imageAccent(image: HTMLImageElement): string | null {
  const cached = imageAccents.get(image);
  if (cached !== undefined) return cached;
  let accent: string | null = null;
  try {
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx && image.naturalWidth > 0) {
      ctx.drawImage(image, 0, 0, size, size);
      accent = accentFromPixels(ctx.getImageData(0, 0, size, size).data);
    }
  } catch {
    accent = null;
  }
  imageAccents.set(image, accent);
  return accent;
}

export function mapCardAccent(
  config: MapCardConfig,
  data: MapCardData,
  images?: MapCardImages,
): string {
  if (config.accent === "auto") {
    const picked = images?.background ? imageAccent(images.background) : null;
    return picked ?? MAP_CARD_ACCENT_COLORS.cascade;
  }
  if (config.accent !== "difficulty") return MAP_CARD_ACCENT_COLORS[config.accent];
  const color = starColor(data.starRating);
  const parsed = parseColor(color);
  return parsed && luminance(parsed) < 0.22 ? "#f2c14e" : color;
}

function effectiveMode(
  config: MapCardConfig,
  images: MapCardImages,
): MapCardBackground {
  return config.backgroundMode !== "none" && images.background
    ? config.backgroundMode
    : "none";
}

function headerContentHeight(d: Density): number {
  const titleBase = Math.round(d.title * 0.95);
  const artistBase = titleBase + d.artist + 9;
  return artistBase + 13 + d.chipH;
}

function statItems(data: MapCardData, config: MapCardConfig): StatItem[] {
  const show = config.visibleStats;
  const items: StatItem[] = [];
  if (show.bpm && data.bpm) {
    const value = formatCardBpm(data.bpm);
    const range =
      data.bpmMin != null && data.bpmMax != null
        ? `${formatCardBpm(data.bpmMin)}-${formatCardBpm(data.bpmMax)}`
        : undefined;
    items.push({
      label: "BPM",
      value,
      sub: range,
      chip: [
        { text: value, strong: true },
        { text: range ? ` BPM (${range})` : " BPM", strong: false },
      ],
    });
  }
  const length = show.length ? formatLength(data.lengthMs) : null;
  if (length) {
    items.push({
      label: "Length",
      value: length,
      chip: [
        { text: length, strong: true },
        { text: " length", strong: false },
      ],
    });
  }
  if (show.notes && data.notes > 0) {
    const value = formatCardCount(data.notes);
    items.push({
      label: "Notes",
      value,
      chip: [
        { text: value, strong: true },
        { text: " notes", strong: false },
      ],
    });
  }
  if (show.longNotes && data.holds > 0) {
    const value = formatCardCount(data.holds);
    const share = `${Math.round(data.lnRatio * 100)}%`;
    items.push({
      label: "Long notes",
      value,
      sub: share,
      chip: [
        { text: value, strong: true },
        { text: ` LN (${share})`, strong: false },
      ],
    });
  }
  if (show.nps && data.avgNps > 0) {
    const value = formatUiNumber(data.avgNps, 1);
    const peak = `peak ${data.peakNps}`;
    items.push({
      label: "NPS",
      value,
      sub: peak,
      chip: [
        { text: value, strong: true },
        { text: ` NPS · ${peak}`, strong: false },
      ],
    });
  }
  if (show.judgement) {
    const od = formatUiNumber(data.overallDifficulty, 1);
    const hp = formatUiNumber(data.hpDrainRate, 1);
    items.push({
      label: "OD / HP",
      value: `${od} / ${hp}`,
      chip: [
        { text: "OD ", strong: false },
        { text: od, strong: true },
        { text: " · HP ", strong: false },
        { text: hp, strong: true },
      ],
    });
  }
  return items;
}

function skillEntries(data: MapCardData, withOverall: boolean): SkillEntry[] {
  const msd = data.msd;
  if (!msd) return [];
  return MSD_SKILLSET_KEYS.filter((key) => withOverall || key !== "overall").map(
    (key) => ({
      label: key === "overall" ? "Overall" : msdSkillsetLabel(key, data.keyCount),
      value: msd[key],
      overall: key === "overall",
    }),
  );
}

type Flow = { x: number; y: number; w: number }[];

function greedyRows(widths: number[], maxWidth: number, gap: number): number[][] {
  const rows: number[][] = [];
  let x = 0;
  widths.forEach((w, i) => {
    if (!rows.length || (x > 0 && x + w > maxWidth)) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push(i);
    x += w + gap;
  });
  return rows;
}

function balancedRows(widths: number[], maxWidth: number, gap: number): number[][] {
  const greedy = greedyRows(widths, maxWidth, gap);
  if (greedy.length < 2) return greedy;
  const perRow = Math.ceil(widths.length / greedy.length);
  const rows: number[][] = [];
  for (let start = 0; start < widths.length; start += perRow) {
    const row = widths.slice(start, start + perRow);
    const used = row.reduce((sum, w) => sum + w, 0) + gap * (row.length - 1);
    if (used > maxWidth) return greedy;
    rows.push(row.map((_, i) => start + i));
  }
  return rows.length === greedy.length ? rows : greedy;
}

function flowLayout(
  widths: number[],
  maxWidth: number,
  rowHeight: number,
  gap: number,
): { placements: Flow; height: number } {
  const placements: Flow = [];
  const rows = balancedRows(widths, maxWidth, gap);
  rows.forEach((row, r) => {
    let x = 0;
    for (const i of row) {
      placements[i] = { x, y: r * (rowHeight + gap), w: Math.min(widths[i], maxWidth) };
      x += widths[i] + gap;
    }
  });
  return { placements, height: rows.length ? rows.length * (rowHeight + gap) - gap : 0 };
}

function segmentsWidth(ctx: Ctx, segments: Segment[], size: number): number {
  let width = 0;
  for (const segment of segments) {
    ctx.font = font(size, segment.strong ? 700 : 500);
    width += ctx.measureText(segment.text).width;
  }
  return width;
}

function pillWidths(ctx: Ctx, entries: SkillEntry[], d: Density): number[] {
  return entries.map((entry) => {
    const size = entry.overall ? d.pillFont + 2 : d.pillFont;
    ctx.font = font(d.pillFont, entry.overall ? 700 : 600);
    const label = ctx.measureText(entry.overall ? "MSD" : entry.label).width;
    ctx.font = font(size, 700);
    const value = ctx.measureText(entry.value.toFixed(2)).width;
    return Math.ceil(label + value + 6 + 26);
  });
}

function chipWidths(ctx: Ctx, items: StatItem[], d: Density): number[] {
  return items.map((item) => Math.ceil(segmentsWidth(ctx, item.chip, d.pillFont) + 24));
}

function skillsHeight(
  ctx: Ctx,
  data: MapCardData,
  config: MapCardConfig,
  d: Density,
  width: number,
): number {
  if (config.skillsetStyle === "bars") return d.barsH;
  if (config.skillsetStyle === "tiles") return d.tileH * 2 + d.tileGap;
  return flowLayout(pillWidths(ctx, skillEntries(data, true), d), width, d.pillH, 8).height;
}

export function planMapCard(
  ctx: Ctx,
  data: MapCardData,
  config: MapCardConfig,
  images: MapCardImages,
): MapCardPlan {
  const d = DENSITY[config.layout];
  const width = MAP_CARD_WIDTH;
  const inner = width - d.pad * 2;
  const mode = effectiveMode(config, images);
  const content = headerContentHeight(d);
  const banner = mode === "banner";
  const headerH = banner ? d.bannerH : d.pad + content;
  const contentTop = banner ? d.bannerH - Math.round(d.pad * 0.75) - content : d.pad;
  let y = headerH;

  let skills: Block | null = null;
  if (config.visibleStats.msd && data.msd) {
    const h = skillsHeight(ctx, data, config, d, inner);
    y += d.gap;
    skills = { y, h };
    y += h;
  }

  const items = statItems(data, config);
  let stats: Block | null = null;
  if (items.length) {
    const h =
      config.layout === "detailed"
        ? d.statH
        : flowLayout(chipWidths(ctx, items, d), inner, d.pillH, 8).height;
    y += d.gap;
    stats = { y, h };
    y += h;
  }

  let footer: Block | null = null;
  if (config.showBranding) {
    footer = { y, h: d.footerH };
    y += d.footerH;
  } else {
    y += d.pad;
  }

  return {
    width,
    height: Math.ceil(y),
    mode,
    layout: config.layout,
    density: d,
    header: { y: 0, h: headerH, contentTop },
    skills,
    stats,
    footer,
    items,
  };
}

let filterSupport: boolean | null = null;

function canvasFilterSupported(ctx: Ctx): boolean {
  if (filterSupport !== null) return filterSupport;
  try {
    ctx.filter = "blur(1px)";
    filterSupport = ctx.filter === "blur(1px)";
    ctx.filter = "none";
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

function drawCover(
  ctx: Ctx,
  img: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const iw = (img as HTMLImageElement).naturalWidth || img.width || w;
  const ih = (img as HTMLImageElement).naturalHeight || img.height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

const coverCache = new WeakMap<object, { key: string; canvas: HTMLCanvasElement }>();

function coverImage(
  img: HTMLImageElement,
  w: number,
  h: number,
  blur: number,
  scale: number,
): HTMLCanvasElement {
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  const key = `${pw}x${ph}:${blur}`;
  const cached = coverCache.get(img);
  if (cached?.key === key) return cached.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const radius = blur * scale;
  if (radius <= 0) {
    drawCover(ctx, img, 0, 0, pw, ph);
  } else if (canvasFilterSupported(ctx)) {
    const bleed = radius * 2;
    ctx.filter = `blur(${radius}px)`;
    drawCover(ctx, img, -bleed, -bleed, pw + bleed * 2, ph + bleed * 2);
    ctx.filter = "none";
  } else {
    const factor = Math.max(1.5, radius / 2.5);
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(pw / factor));
    small.height = Math.max(1, Math.round(ph / factor));
    const sctx = small.getContext("2d");
    if (sctx) {
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      drawCover(sctx, img, 0, 0, small.width, small.height);
      ctx.drawImage(small, 0, 0, pw, ph);
    }
  }
  coverCache.set(img, { key, canvas });
  return canvas;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
}

type Surface = { fill: string; stroke: string };

function surface(plan: MapCardPlan): Surface {
  return plan.mode === "full"
    ? { fill: "rgba(10, 10, 15, 0.46)", stroke: "rgba(255, 255, 255, 0.09)" }
    : { fill: "rgba(255, 255, 255, 0.035)", stroke: "rgba(255, 255, 255, 0.07)" };
}

function panel(
  ctx: Ctx,
  plan: MapCardPlan,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 14,
  stroke?: string,
): void {
  const s = surface(plan);
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = s.fill;
  ctx.fill();
  ctx.lineWidth = stroke ? 1.5 : 1;
  ctx.strokeStyle = stroke ?? s.stroke;
  ctx.stroke();
}

function withShadow(ctx: Ctx, on: boolean, draw: () => void): void {
  if (!on) {
    draw();
    return;
  }
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 1;
  draw();
  ctx.restore();
}

function spaced(ctx: Ctx, spacing: number, draw: () => void): void {
  ctx.letterSpacing = `${spacing}px`;
  draw();
  ctx.letterSpacing = "0px";
}

function drawBackground(
  ctx: Ctx,
  plan: MapCardPlan,
  config: MapCardConfig,
  images: MapCardImages,
  accent: string,
  scale: number,
): void {
  const { width: w, height: h, mode } = plan;
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, BASE_TOP);
  base.addColorStop(1, BASE_BOTTOM);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const background = images.background;
  if (mode === "full" && background) {
    ctx.drawImage(coverImage(background, w, h, config.blur, scale), 0, 0, w, h);
    ctx.fillStyle = `rgba(9, 9, 13, ${config.overlayOpacity})`;
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, "rgba(9, 9, 13, 0)");
    shade.addColorStop(1, "rgba(9, 9, 13, 0.4)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (mode !== "banner" || !background) {
    glow(ctx, w, h, accent, 0.16);
    return;
  }

  const bh = plan.header.h;
  ctx.drawImage(coverImage(background, w, bh, config.blur, scale), 0, 0, w, bh);
  ctx.fillStyle = `rgba(9, 9, 13, ${config.overlayOpacity})`;
  ctx.fillRect(0, 0, w, bh);
  const edge = mix(BASE_TOP, BASE_BOTTOM, bh / h);
  const fade = ctx.createLinearGradient(0, bh * 0.25, 0, bh);
  fade.addColorStop(0, rgba(edge, 0));
  fade.addColorStop(0.55, rgba(edge, 0.62));
  fade.addColorStop(1, rgba(edge, 1));
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, bh + 1);
  glow(ctx, w, h, accent, 0.07);
}

function glow(ctx: Ctx, w: number, h: number, accent: string, strength: number): void {
  const main = ctx.createRadialGradient(w * 0.1, -h * 0.05, 0, w * 0.1, -h * 0.05, w * 0.8);
  main.addColorStop(0, rgba(accent, strength));
  main.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, w, h);
  const corner = ctx.createRadialGradient(w, h, 0, w, h, w * 0.55);
  corner.addColorStop(0, rgba(accent, strength * 0.4));
  corner.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = corner;
  ctx.fillRect(0, 0, w, h);
}

function drawHeader(
  ctx: Ctx,
  plan: MapCardPlan,
  data: MapCardData,
  config: MapCardConfig,
  accent: string,
): void {
  const d = plan.density;
  const x = d.pad;
  const maxW = plan.width - d.pad * 2;
  const top = plan.header.contentTop;
  const shadow = plan.mode !== "none";
  const titleBase = top + Math.round(d.title * 0.95);
  const artistBase = titleBase + d.artist + 9;
  const chipTop = artistBase + 13;

  withShadow(ctx, shadow, () => {
    ctx.fillStyle = TEXT;
    ctx.font = font(d.title, 700);
    ctx.fillText(fitText(ctx, data.title, maxW), x, titleBase);
    if (data.artist) {
      ctx.fillStyle = shadow ? SOFT : MUTED;
      ctx.font = font(d.artist, 600);
      ctx.fillText(fitText(ctx, data.artist, maxW), x, artistBase);
    }
  });

  const chipH = d.chipH;
  const middle = chipTop + chipH / 2;
  const keySize = d.meta - 1;
  ctx.font = font(keySize, 700);
  const keyText = `${data.keyCount}K`;
  const keyW = Math.ceil(ctx.measureText(keyText).width) + 18;
  roundRect(ctx, x, chipTop, keyW, chipH, 8);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = inkOn(accent);
  ctx.fillText(keyText, x + 9, middle + keySize * 0.36);

  let right = x + maxW;
  if (config.visibleStats.starRating && data.starRating > 0) {
    const size = d.meta - 0.5;
    ctx.font = font(size, 700);
    const label = `★ ${data.starRating.toFixed(2)}`;
    const w = Math.ceil(ctx.measureText(label).width) + 22;
    roundRect(ctx, right - w, chipTop, w, chipH, chipH / 2);
    ctx.fillStyle = starColor(data.starRating);
    ctx.fill();
    ctx.fillStyle = starTextOn(data.starRating);
    ctx.fillText(label, right - w + 11, middle + size * 0.36);
    right -= w + 12;
  }

  const start = x + keyW + 10;
  const avail = Math.max(0, right - start);
  const nameSize = d.meta + 1;
  ctx.font = font(nameSize, 700);
  const nameFull = ctx.measureText(data.difficultyName).width;
  const prefix = "mapped by ";
  ctx.font = font(d.meta, 500);
  const prefixW = ctx.measureText(prefix).width;
  ctx.font = font(d.meta, 700);
  const creatorFull = data.creator ? ctx.measureText(data.creator).width : 0;
  const gap = 10;
  let mapperW = data.creator ? prefixW + creatorFull : 0;
  let nameW = nameFull;
  if (nameW + (mapperW ? gap + mapperW : 0) > avail) {
    const room = avail - nameW - gap;
    if (mapperW && room >= Math.min(mapperW, prefixW + 60)) {
      mapperW = Math.min(mapperW, room);
    } else if (mapperW) {
      mapperW = Math.min(mapperW, Math.max(prefixW + 60, avail * 0.42));
      nameW = avail - mapperW - gap;
    } else {
      nameW = avail;
    }
  }
  if (nameW < 48) {
    mapperW = 0;
    nameW = avail;
  }

  withShadow(ctx, shadow, () => {
    const base = middle + nameSize * 0.36;
    ctx.font = font(nameSize, 700);
    ctx.fillStyle = TEXT;
    const name = fitText(ctx, data.difficultyName, nameW);
    ctx.fillText(name, start, base);
    if (mapperW > prefixW + 12) {
      const mx = start + Math.min(nameW, ctx.measureText(name).width) + gap;
      ctx.font = font(d.meta, 500);
      ctx.fillStyle = shadow ? SOFT : MUTED;
      ctx.fillText(prefix, mx, base);
      ctx.font = font(d.meta, 700);
      ctx.fillStyle = shadow ? TEXT : SOFT;
      ctx.fillText(fitText(ctx, data.creator, mapperW - prefixW), mx + prefixW, base);
    }
  });
}

function drawBar(
  ctx: Ctx,
  entry: SkillEntry,
  x: number,
  right: number,
  cy: number,
  labelW: number,
  valueW: number,
  size: number,
  max: number,
  barH: number,
): void {
  const color = msdColor(entry.value);
  ctx.font = font(size, entry.overall ? 700 : 600);
  ctx.fillStyle = entry.overall ? TEXT : MUTED;
  ctx.fillText(fitText(ctx, entry.label, labelW - 8), x, cy + size * 0.36);
  const trackX = x + labelW;
  const trackW = Math.max(10, right - valueW - trackX);
  roundRect(ctx, trackX, cy - barH / 2, trackW, barH, barH / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.fill();
  const fillW = Math.max(barH, trackW * Math.min(1, entry.value / max));
  roundRect(ctx, trackX, cy - barH / 2, fillW, barH, barH / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = font(size + 0.5, 700);
  ctx.textAlign = "right";
  ctx.fillText(entry.value.toFixed(2), right, cy + size * 0.36);
  ctx.textAlign = "left";
}

function drawSkills(
  ctx: Ctx,
  plan: MapCardPlan,
  block: Block,
  data: MapCardData,
  config: MapCardConfig,
  accent: string,
): void {
  const msd = data.msd;
  if (!msd) return;
  const d = plan.density;
  const x = d.pad;
  const w = plan.width - d.pad * 2;
  const { y, h } = block;
  const all = skillEntries(data, true);
  const skills = all.filter((entry) => !entry.overall);
  const max = Math.max(1, ...all.map((entry) => entry.value));

  if (config.skillsetStyle === "bars" && config.layout === "detailed") {
    panel(ctx, plan, x, y, w, h);
    const heroW = 196;
    spaced(ctx, 1.5, () => {
      ctx.font = font(11, 700);
      ctx.fillStyle = accent;
      ctx.fillText("MSD", x + 22, y + 36);
    });
    ctx.font = font(46, 700);
    ctx.fillStyle = msdColor(msd.overall);
    ctx.fillText(fitText(ctx, msd.overall.toFixed(2), heroW - 30), x + 20, y + 88);
    spaced(ctx, 1, () => {
      ctx.font = font(10.5, 700);
      ctx.fillStyle = DIM;
      ctx.fillText("TOP SKILL", x + 22, y + 119);
    });
    ctx.font = font(16, 700);
    ctx.fillStyle = TEXT;
    ctx.fillText(
      fitText(ctx, dominantSkillset(msd, data.keyCount), heroW - 34),
      x + 22,
      y + 141,
    );
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(x + heroW, y + 18, 1, h - 36);

    const left = x + heroW + 24;
    const right = x + w - 22;
    const pitch = (h - 40) / skills.length;
    skills.forEach((entry, i) => {
      drawBar(ctx, entry, left, right, y + 20 + pitch * (i + 0.5), 110, 50, 12.5, max, 6);
    });
    return;
  }

  if (config.skillsetStyle === "bars") {
    panel(ctx, plan, x, y, w, h);
    const innerX = x + 18;
    const innerW = w - 36;
    const colGap = 30;
    const colW = (innerW - colGap) / 2;
    const rows = Math.ceil(all.length / 2);
    const pitch = (h - 24) / rows;
    all.forEach((entry, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const cx = innerX + col * (colW + colGap);
      drawBar(ctx, entry, cx, cx + colW, y + 12 + pitch * (row + 0.5), 96, 44, 11.5, max, 5);
    });
    return;
  }

  if (config.skillsetStyle === "tiles") {
    const detailed = config.layout === "detailed";
    const gap = d.tileGap;
    const cols = 4;
    const tileW = (w - gap * (cols - 1)) / cols;
    const tileH = d.tileH;
    all.forEach((entry, i) => {
      const tx = x + (i % cols) * (tileW + gap);
      const ty = y + Math.floor(i / cols) * (tileH + gap);
      const color = msdColor(entry.value);
      panel(ctx, plan, tx, ty, tileW, tileH, 12, entry.overall ? rgba(accent, 0.75) : undefined);
      if (entry.overall) {
        roundRect(ctx, tx, ty, tileW, tileH, 12);
        ctx.fillStyle = rgba(accent, 0.08);
        ctx.fill();
      }
      spaced(ctx, 1, () => {
        ctx.font = font(detailed ? 10.5 : 9.5, 700);
        ctx.fillStyle = entry.overall ? accent : DIM;
        ctx.fillText(
          fitText(ctx, entry.label.toUpperCase(), tileW - 26),
          tx + 14,
          ty + (detailed ? 22 : 18),
        );
      });
      ctx.font = font(detailed ? 24 : 19, 700);
      ctx.fillStyle = color;
      ctx.fillText(entry.value.toFixed(2), tx + 13, ty + (detailed ? 48 : 38));
      const barY = ty + tileH - (detailed ? 11 : 9);
      const trackW = tileW - 28;
      roundRect(ctx, tx + 14, barY, trackW, 3, 1.5);
      ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
      ctx.fill();
      roundRect(ctx, tx + 14, barY, Math.max(3, trackW * Math.min(1, entry.value / max)), 3, 1.5);
      ctx.fillStyle = color;
      ctx.fill();
    });
    return;
  }

  const { placements } = flowLayout(pillWidths(ctx, all, d), w, d.pillH, 8);
  all.forEach((entry, i) => {
    const p = placements[i];
    const px = x + p.x;
    const py = y + p.y;
    const color = msdColor(entry.value);
    roundRect(ctx, px, py, p.w, d.pillH, d.pillH / 2);
    ctx.fillStyle = entry.overall
      ? rgba(accent, 0.16)
      : plan.mode === "full"
        ? "rgba(10, 10, 15, 0.5)"
        : "rgba(255, 255, 255, 0.045)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = entry.overall ? rgba(accent, 0.55) : "rgba(255, 255, 255, 0.08)";
    ctx.stroke();
    const base = py + d.pillH / 2 + d.pillFont * 0.36;
    ctx.font = font(d.pillFont, entry.overall ? 700 : 600);
    ctx.fillStyle = entry.overall ? accent : MUTED;
    const label = entry.overall ? "MSD" : entry.label;
    ctx.fillText(label, px + 13, base);
    const labelW = ctx.measureText(label).width;
    ctx.font = font(entry.overall ? d.pillFont + 2 : d.pillFont, 700);
    ctx.fillStyle = color;
    ctx.fillText(entry.value.toFixed(2), px + 13 + labelW + 6, base + (entry.overall ? 0.5 : 0));
  });
}

function drawStats(ctx: Ctx, plan: MapCardPlan, block: Block): void {
  const d = plan.density;
  const x = d.pad;
  const w = plan.width - d.pad * 2;
  const items = plan.items;

  if (plan.layout === "detailed") {
    const gap = 10;
    const tileW = (w - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      const tx = x + i * (tileW + gap);
      const ty = block.y;
      panel(ctx, plan, tx, ty, tileW, block.h, 12);
      spaced(ctx, 1, () => {
        ctx.font = font(10.5, 700);
        ctx.fillStyle = DIM;
        ctx.fillText(fitText(ctx, item.label.toUpperCase(), tileW - 26), tx + 14, ty + 24);
      });
      ctx.font = font(20, 700);
      ctx.fillStyle = TEXT;
      const value = fitText(ctx, item.value, tileW - 28);
      ctx.fillText(value, tx + 14, ty + 50);
      if (!item.sub) return;
      const valueW = ctx.measureText(value).width;
      const room = tileW - 12 - (14 + valueW + 5);
      const size = [12, 10.5].find((candidate) => {
        ctx.font = font(candidate, 600);
        return ctx.measureText(item.sub ?? "").width <= room;
      });
      if (size) {
        ctx.font = font(size, 600);
        ctx.fillStyle = MUTED;
        ctx.fillText(item.sub, tx + 14 + valueW + 5, ty + 50);
      }
    });
    return;
  }

  const { placements } = flowLayout(chipWidths(ctx, items, d), w, d.pillH, 8);
  items.forEach((item, i) => {
    const p = placements[i];
    const px = x + p.x;
    const py = block.y + p.y;
    roundRect(ctx, px, py, p.w, d.pillH, d.pillH / 2);
    ctx.fillStyle = plan.mode === "full" ? "rgba(10, 10, 15, 0.5)" : "rgba(255, 255, 255, 0.045)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.stroke();
    let cx = px + 12;
    const base = py + d.pillH / 2 + d.pillFont * 0.36;
    for (const segment of item.chip) {
      ctx.font = font(d.pillFont, segment.strong ? 700 : 500);
      ctx.fillStyle = segment.strong ? TEXT : MUTED;
      ctx.fillText(segment.text, cx, base);
      cx += ctx.measureText(segment.text).width;
    }
  });
}

function drawFooter(
  ctx: Ctx,
  plan: MapCardPlan,
  block: Block,
  accent: string,
  logo: HTMLImageElement | null,
): void {
  const d = plan.density;
  const x = d.pad;
  const right = plan.width - d.pad;
  const base = block.y + block.h - Math.round(d.pad * 0.72);
  if (logo && logo.naturalWidth > 0) {
    // The logo is square art shown as a circle, as on the main menu.
    const size = 17;
    const cy = base - 4.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, cy, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, x, cy - size / 2, size, size);
    ctx.restore();
  } else {
    for (let i = 0; i < 4; i++) {
      roundRect(ctx, x + i * 4.2, base - 11 + i * 2.4, 3.4, 3.4, 1);
      ctx.fillStyle = rgba(accent, 1 - i * 0.2);
      ctx.fill();
    }
  }
  ctx.font = font(12, 600);
  ctx.fillStyle = MUTED;
  ctx.fillText("Made with Cascade", x + 24, base);
  ctx.textAlign = "right";
  ctx.fillStyle = DIM;
  ctx.fillText("cascade.sheepex.net", right, base);
  ctx.textAlign = "left";
}

export function drawMapCard(
  canvas: HTMLCanvasElement,
  data: MapCardData,
  config: MapCardConfig,
  images: MapCardImages,
  scale = MAP_CARD_EXPORT_SCALE,
): MapCardPlan {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("lib.noCanvas"));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const plan = planMapCard(ctx, data, config, images);
  const pw = Math.round(plan.width * scale);
  const ph = Math.round(plan.height * scale);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, plan.width, plan.height);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const accent = mapCardAccent(config, data, images);

  ctx.save();
  roundRect(ctx, 0, 0, plan.width, plan.height, RADIUS);
  ctx.clip();
  drawBackground(ctx, plan, config, images, accent, scale);
  drawHeader(ctx, plan, data, config, accent);
  if (plan.skills) drawSkills(ctx, plan, plan.skills, data, config, accent);
  if (plan.stats) drawStats(ctx, plan, plan.stats);
  if (plan.footer) drawFooter(ctx, plan, plan.footer, accent, images.logo ?? null);
  ctx.restore();

  roundRect(ctx, 0.5, 0.5, plan.width - 1, plan.height - 1, RADIUS - 0.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
  ctx.stroke();
  return plan;
}

export async function renderMapCardPng(
  data: MapCardData,
  config: MapCardConfig,
  images: MapCardImages,
  scale = MAP_CARD_EXPORT_SCALE,
): Promise<{ blob: Blob; width: number; height: number }> {
  const canvas = document.createElement("canvas");
  drawMapCard(canvas, data, config, images, scale);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error(t("lib.pngFailed"));
  return { blob, width: canvas.width, height: canvas.height };
}

export async function prepareMapCardFonts(sample: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const text = `${sample} 0123456789.:/-()% ★`;
  await Promise.all(
    [500, 600, 700].map((weight) =>
      document.fonts.load(`${weight} 16px ${FONT_STACK}`, text).catch(() => []),
    ),
  );
}
