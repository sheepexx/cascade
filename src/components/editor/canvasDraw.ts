import { HITSOUND_WHISTLE, HITSOUND_FINISH, HITSOUND_CLAP, type ManiaNote } from "../../types";
import { FONT_STACK as CANVAS_FONT_STACK } from "../../lib/fontStack";

/**
 * Canvas drawing for the editor's playfield: skin pieces (notes, hold bodies,
 * receptors, the stage cover), hitsound letters and the rectangle maths the
 * selection box uses. Nothing here holds editor state.
 */

/** An unskinned note's height in editor pixels, before the note height setting. */
export const NOTE_HEIGHT = 16;

export function hitsoundOf(n: {
  hitSound?: number;
  sampleSet?: number;
  additionSet?: number;
  sampleIndex?: number;
  sampleVolume?: number;
  sampleFile?: string;
}): Partial<ManiaNote> {
  return {
    hitSound: n.hitSound,
    sampleSet: n.sampleSet,
    additionSet: n.additionSet,
    sampleIndex: n.sampleIndex,
    sampleVolume: n.sampleVolume,
    sampleFile: n.sampleFile,
  };
}

export function hitsoundLabel(hitSound: number | undefined): string {
  if (!hitSound) return "";
  let s = "";
  if (hitSound & HITSOUND_WHISTLE) s += "W";
  if (hitSound & HITSOUND_FINISH) s += "F";
  if (hitSound & HITSOUND_CLAP) s += "C";
  return s;
}

export function drawHitsoundLetters(
  ctx: CanvasRenderingContext2D,
  hitSound: number | undefined,
  cx: number,
  cy: number,
) {
  const label = hitsoundLabel(hitSound);
  if (!label) return;
  ctx.save();
  ctx.font = `700 8px ${CANVAS_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(label, cx, cy);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

export type CanvasRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * A stage piece worth drawing. Skins routinely ship a 1x1 pixel to switch an
 * element off rather than deleting the file, and stretching that across the
 * playfield would paint a bar the author meant to be invisible.
 */
export function usableStagePiece(
  piece: StagePieceRender | null | undefined,
): StagePieceRender | null {
  return piece && piece.img.width > 2 && piece.img.height > 2 ? piece : null;
}

export type StagePieceRender = { img: HTMLImageElement; scale: number };

export type StageRender = {
  left: StagePieceRender | null;
  right: StagePieceRender | null;
  bottom: StagePieceRender | null;
  hint: StagePieceRender | null;
};

/**
 * The strip osu! stretches a hold body over, in the units `ColumnWidth` is
 * measured in. `LegacyBodyPiece` scales the sprite by `32800 / DrawHeight`.
 */
const LEGACY_BODY_STRIP = 32800;
/** `DEFAULT_COLUMN_SIZE`: 30 in skin.ini, times the 480-to-768 factor of 1.6. */
const DEFAULT_COLUMN_UNITS = 48;

/** A column's width in osu!'s units, guarding the skins that declare it zero. */
export function columnUnits(col: ColumnRender | undefined): number {
  const width = col?.columnWidth ?? 0;
  return width > 0 ? width : DEFAULT_COLUMN_UNITS;
}

/**
 * Editor pixels per osu! unit: a lane stands in for what the skin calls a
 * column, so art the skin sizes for itself is measured against that. One scale
 * for the whole stage keeps the frame in proportion with the notes.
 */
export function skinUnit(laneWidth: number, col: ColumnRender | undefined): number {
  return laneWidth / columnUnits(col);
}

export type ColumnRender = {
  background: string;
  bodyStretch: boolean;
  columnWidth: number;
  noteHeightScale: number;
  note: HTMLImageElement | null;
  head: HTMLImageElement | null;
  body: HTMLImageElement | null;
  tail: HTMLImageElement | null;
  key: HTMLImageElement | null;
  keyDown: HTMLImageElement | null;
};

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): CanvasRect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return {
    x,
    y,
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

export function rectIntersects(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * A hold note's body, filling `span` between the tail and the head.
 *
 * osu! does something odd here that the whole look depends on. The body is not
 * fitted to the note at all: `LegacyBodyPiece` sizes the sprite to the hold,
 * then scales it vertically by `max(1, 32800 / DrawHeight)` — so whatever the
 * hold's length, the texture is stretched over a fixed strip 32800 units tall,
 * pinned at the tail end, and only the part overlapping the note is seen.
 *
 * That constant is why skins ship bodies like 104x32767, 148x20000 and
 * 128x40000: against a 32800-unit strip those land at roughly one texture pixel
 * per unit, so the art plays out at the scale it was drawn, running off the far
 * end of all but the longest holds. It also fixes the vertical scale
 * independently of the horizontal one, which is set by the column — a body
 * drawn 148 wide for a 108-unit column is squashed to 73% across while staying
 * 164% tall. Scaling both axes together, the obvious reading, flattens exactly
 * the tapered caps those tall bodies exist to show.
 *
 * Measured in the editor's pixels the strip is `32800 * width / columnWidth`,
 * since `width` pixels span `columnWidth` units. `NoteBodyStyle: 0` opts out
 * and stretches one copy over the note instead.
 */
export function drawHoldBody(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  stretch: boolean,
  x: number,
  top: number,
  width: number,
  span: number,
  columnWidth: number,
) {
  if (img.width <= 0 || img.height <= 0 || span <= 0 || width <= 0) return;
  if (stretch) {
    ctx.drawImage(img, x, top, width, span);
    return;
  }

  const strip = (LEGACY_BODY_STRIP * width) / columnWidth;
  if (strip <= 0) return;

  if (strip >= span) {
    // The usual case by a wide margin: the strip is thousands of pixels tall,
    // so the note shows the first slice of the texture and nothing more.
    // Floored at a whole row: a body a few dozen pixels tall covers so little
    // of the strip that the slice comes to a fraction of one, and a sub-pixel
    // source rectangle is not something every browser samples the same way.
    const srcH = Math.min(img.height, Math.max(1, (span / strip) * img.height));
    ctx.drawImage(img, 0, 0, img.width, srcH, x, top, width, span);
    return;
  }

  // A column wide enough to make the strip shorter than the note is far-fetched,
  // but osu! loads the body with `WrapMode.Repeat`, so it would tile.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, width, span);
  ctx.clip();
  // Snapped to whole pixels and sharing each boundary, because tiles landing on
  // fractions leave hairline gaps that read as seams across the whole note.
  const bottom = top + span;
  for (let edge = top; edge < bottom; edge += strip) {
    const lo = Math.floor(edge);
    ctx.drawImage(img, x, lo, width, Math.ceil(edge + strip) - lo);
  }
  ctx.restore();
}
// osu! draws note art across the full column — `LegacyNotePiece` is
// `RelativeSizeAxes = Axes.X` inside it — so skin sprites get the whole lane,
// not the gutter the editor's own notes are drawn with. Keeping the gutter left
// heads a different width from the body they cap.
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  bottomY: number,
  laneWidth: number,
  flip = false,
  heightScale = 1,
) {
  const h =
    img.width > 0 ? img.height * (laneWidth / img.width) * heightScale : NOTE_HEIGHT;
  if (flip) {
    ctx.save();
    ctx.translate(0, bottomY + h);
    ctx.scale(1, -1);
    ctx.drawImage(img, x, 0, laneWidth, h);
    ctx.restore();
    return;
  }
  ctx.drawImage(img, x, bottomY - h, laneWidth, h);
}

type OpaqueBounds = { left: number; top: number; right: number; bottom: number };
const opaqueBoundsCache = new WeakMap<HTMLImageElement, OpaqueBounds>();
// Bounding box of the non-transparent content, so receptors with lots of empty
// canvas padding (common in arrow / note-shaped receptor skins) can be sized and
// aligned by their visible pixels rather than the raw image edges.
export function opaqueBounds(img: HTMLImageElement): OpaqueBounds {
  const cached = opaqueBoundsCache.get(img);
  if (cached) return cached;
  let result: OpaqueBounds = { left: 0, top: 0, right: img.width, bottom: img.height };
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (cx) {
      cx.drawImage(img, 0, 0);
      const { data } = cx.getImageData(0, 0, img.width, img.height);
      let left = img.width;
      let right = 0;
      let top = img.height;
      let bottom = 0;
      let any = false;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (data[(y * img.width + x) * 4 + 3] > 8) {
            any = true;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
      }
      if (any) result = { left, top, right: right + 1, bottom: bottom + 1 };
    }
  } catch {
    // keep full-image fallback
  }
  opaqueBoundsCache.set(img, result);
  return result;
}

export function drawReceptor(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  lineY: number,
  laneWidth: number,
  up = false,
  // The note's opaque display box (width/height in canvas px). A note-shaped
  // receptor - one whose visible pixels are much taller than the note, e.g. an
  // arrow or ring the note falls into - is fitted to this box and centred on the
  // note, matching how osu! renders it (a tall oval ring becomes a round ring the
  // size of the note). Normal/flat key images keep the old "opaque bottom on the
  // hit line" placement, so ordinary skins render exactly as before.
  noteBox?: { w: number; h: number } | null,
) {
  if (img.width <= 0 || img.height <= 0) return;
  const s = laneWidth / img.width;
  const b = opaqueBounds(img);
  const opaqueDisplayH = (b.bottom - b.top) * s;

  if (noteBox && noteBox.h > 0 && opaqueDisplayH > noteBox.h * 1.15) {
    const srcW = b.right - b.left;
    const srcH = b.bottom - b.top;
    const cx = x + laneWidth / 2;
    const cy = up ? lineY + noteBox.h / 2 : lineY - noteBox.h / 2;
    if (up) {
      ctx.save();
      ctx.translate(0, lineY * 2);
      ctx.scale(1, -1);
      ctx.drawImage(
        img, b.left, b.top, srcW, srcH,
        cx - noteBox.w / 2, lineY * 2 - (cy + noteBox.h / 2), noteBox.w, noteBox.h,
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        img, b.left, b.top, srcW, srcH,
        cx - noteBox.w / 2, cy - noteBox.h / 2, noteBox.w, noteBox.h,
      );
    }
    return;
  }

  // Default: aspect-preserving, opaque bottom anchored on the hit line.
  const dy = lineY - b.bottom * s;
  if (up) {
    ctx.save();
    ctx.translate(0, lineY * 2);
    ctx.scale(1, -1);
    ctx.drawImage(img, x, dy, laneWidth, img.height * s);
    ctx.restore();
    return;
  }
  ctx.drawImage(img, x, dy, laneWidth, img.height * s);
}

export const LANE_FLASH_MS = 800;

/**
 * How lit a flashed lane is, 0 to 1: bright at once, dark, bright again a
 * little softer, then out. With reduced motion it simply fades.
 */
export function laneFlashStrength(elapsed: number, reduced: boolean): number {
  if (elapsed < 0 || elapsed >= LANE_FLASH_MS) return 0;
  const p = elapsed / LANE_FLASH_MS;
  if (reduced) return 1 - p;
  return Math.cos(1.5 * Math.PI * p) ** 2 * (1 - 0.4 * p);
}

export function drawReceptorGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  lineY: number,
  laneWidth: number,
  canvasHeight: number,
  color: string,
  intensity = 1,
  up = false,
) {
  const h = up ? lineY : canvasHeight - lineY;
  if (h <= 0 || intensity <= 0) return;
  const farY = up ? lineY - h : lineY + h;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.55 * intensity;
  const grad = ctx.createLinearGradient(0, lineY, 0, farY);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(x, Math.min(lineY, farY), laneWidth, h);
  ctx.restore();
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const w = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
  const h = img instanceof HTMLVideoElement ? img.videoHeight : img.height;
  const ir = w / h;
  const r = dw / dh;
  let sw = w;
  let sh = h;
  if (ir > r) {
    sw = h * r;
  } else {
    sh = w / r;
  }
  const sx = (w - sw) / 2;
  const sy = (h - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
