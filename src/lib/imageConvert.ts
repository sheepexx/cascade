/**
 * Background image re-encoding for export. Beatmap backgrounds are opaque and
 * often ship as large PNGs; re-encoding them to JPEG shrinks the exported
 * archive dramatically with no visible loss at gameplay scale. Only background
 * images are ever converted — skin sprites, storyboard elements and hitsound
 * images can rely on transparency, which JPEG cannot represent.
 */

/** True when the filename has a `.png` extension (case-insensitive). */
export function isPngName(name: string): boolean {
  return /\.png$/i.test(name);
}

/** Swap a `.png` extension for `.jpg`. */
export function toJpegName(name: string): string {
  return name.replace(/\.png$/i, ".jpg");
}

/**
 * `name.ext` -> `name_2.ext`, `name_3.ext`, … the first not already in `taken`
 * (compared case-insensitively). Returns `name` unchanged when it's free.
 */
export function uniqueFileName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  for (let n = 2; ; n++) {
    const candidate = `${stem}_${n}${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Re-encode a PNG blob as JPEG at the given quality (0..1). Returns null when
 * the image can't be decoded, JPEG encoding isn't available, or the result
 * wouldn't actually be smaller — in every such case callers keep the original
 * bytes (and its original `.png` name).
 */
export async function pngToJpeg(
  blob: Blob,
  quality: number,
): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    // JPEG has no alpha channel; paint an opaque backdrop so any transparent
    // pixels flatten predictably instead of encoding as stray colours.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    // Never grow the file: tiny/flat PNGs can encode larger as JPEG.
    return out && out.size < blob.size ? out : null;
  } catch {
    return null;
  }
}
