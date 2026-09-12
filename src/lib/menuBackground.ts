/**
 * Prepares a picture for the main-menu background.
 *
 * The menu draws the image full-bleed, scaled up slightly and with a blurred
 * copy masked over the edges, so a small picture shows every flaw: hence a
 * minimum size. Above 4K there is nothing left to see on any display Cascade
 * runs on, so anything larger is scaled down rather than stored. Everything is
 * re-encoded to JPEG at the quality a map export uses, which takes a 4K PNG
 * from tens of megabytes to a couple without a visible difference.
 */

/** Smaller than this and the picture visibly softens when blown up. */
export const MENU_BG_MIN_WIDTH = 1280;
export const MENU_BG_MIN_HEIGHT = 720;
/** 4K. Larger pictures are scaled to fit inside this, keeping their shape. */
export const MENU_BG_MAX_WIDTH = 3840;
export const MENU_BG_MAX_HEIGHT = 2160;
/** The same quality the .osz export encodes PNG backgrounds at. */
export const MENU_BG_QUALITY = 0.9;
/** Refused before decoding, so a huge file fails fast instead of filling memory. */
export const MENU_BG_MAX_INPUT_BYTES = 32 * 1024 * 1024;
/** What one account may store once compressed; a 4K JPEG lands well under it. */
export const MENU_BG_MAX_STORED_BYTES = 8 * 1024 * 1024;

// Tried in order until the result fits the stored cap. The first is the normal
// outcome; the rest only matter for pathological images (heavy film grain and
// the like) that JPEG cannot compress at the usual quality.
const QUALITY_STEPS = [MENU_BG_QUALITY, 0.82, 0.74, 0.66, 0.6];

export type PreparedMenuBackground = {
  blob: Blob;
  width: number;
  height: number;
};

/** Longest-edge fit into the 4K box, never scaling a smaller picture up. */
export function fitWithinMax(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    MENU_BG_MAX_WIDTH / width,
    MENU_BG_MAX_HEIGHT / height,
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function formatMenuBackgroundRules(): string {
  return `JPEG, PNG or WebP · at least ${MENU_BG_MIN_WIDTH}×${MENU_BG_MIN_HEIGHT} · scaled down past 4K`;
}

export async function prepareMenuBackground(
  file: File,
): Promise<PreparedMenuBackground> {
  if (!/^image\//i.test(file.type)) {
    throw new Error("Choose an image file.");
  }
  if (file.size <= 0 || file.size > MENU_BG_MAX_INPUT_BYTES) {
    throw new Error(
      `Images must be under ${Math.round(MENU_BG_MAX_INPUT_BYTES / 1024 / 1024)} MB before compression.`,
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image could not be read.");
  }

  try {
    if (
      bitmap.width < MENU_BG_MIN_WIDTH ||
      bitmap.height < MENU_BG_MIN_HEIGHT
    ) {
      throw new Error(
        `That image is ${bitmap.width}×${bitmap.height}. The menu needs at least ${MENU_BG_MIN_WIDTH}×${MENU_BG_MIN_HEIGHT}.`,
      );
    }

    const { width, height } = fitWithinMax(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("That image could not be processed.");
    // JPEG has no alpha, so a transparent PNG would otherwise composite onto
    // black fringes; filling first keeps those areas clean.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((out) => resolve(out), "image/jpeg", quality),
      );
      if (!blob) throw new Error("That image could not be compressed.");
      if (blob.size <= MENU_BG_MAX_STORED_BYTES) {
        return { blob, width, height };
      }
    }
    throw new Error(
      "That image is too detailed to compress to a sensible size. Try a smaller one.",
    );
  } finally {
    bitmap.close();
  }
}
