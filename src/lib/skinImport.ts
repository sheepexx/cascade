import JSZip from "jszip";
import {
  MAX_KEYS,
  MIN_KEYS,
  type LoadedSkin,
  type ManiaColumnSkin,
  type ManiaKeymodeSkin,
} from "../types";

/**
 * Import an osu! skin (`.osk`).
 *
 * An `.osk` is a plain zip archive containing a `skin.ini` plus image assets.
 * For the editor we only care about the `[Mania]` sections: each one targets a
 * keymode (`Keys: N`) and lists per-column colours (`ColourN`, 1-indexed),
 * note sprites (`NoteImage{col}` / `…H` head / `…L` body / `…T` tail,
 * 0-indexed) and receptor sprites (`KeyImage{col}` idle / `KeyImage{col}D`
 * pressed). Image references are extensionless paths relative to the skin
 * root, resolved here to `.png` (or `@2x.png`) entries.
 *
 * When a column omits an image, osu! falls back to the default-named element
 * (`mania-note{1|2|S}{suffix}`) rather than rendering nothing - many real skins
 * only list the hold images and rely on this for the tap note. We mirror that
 * fallback so those skins don't render as blank/coloured bars.
 *
 * Everything not understood is ignored; a skin that only defines colours still
 * imports fine and the editor falls back to its default note rendering for the
 * rest.
 */
export async function importOsk(
  file: Blob,
  fileName: string,
): Promise<LoadedSkin> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("That file isn't a valid .osk skin archive.");
  }

  // Index every file entry by its lower-cased, forward-slashed path.
  const index = new Map<string, JSZip.JSZipObject>();
  let iniEntry: JSZip.JSZipObject | null = null;
  let iniDepth = Infinity;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const norm = path.replace(/\\/g, "/").toLowerCase();
    index.set(norm, entry);
    // osu only reads the skin.ini at the skin root; some skins ship extra
    // copies in subfolders. Keep the shallowest one (the true root).
    if (norm.split("/").pop() === "skin.ini") {
      const depth = norm.split("/").length;
      if (depth < iniDepth) {
        iniDepth = depth;
        iniEntry = entry;
      }
    }
  });

  const iniText = iniEntry
    ? await (iniEntry as JSZip.JSZipObject).async("string")
    : "";
  const { general, mania } = parseSkinIni(iniText);

  const objectUrls: string[] = [];
  const urlCache = new Map<string, string>();
  const hitsounds: Record<string, Blob> = {};

  for (const [path, entry] of index) {
    const sampleKey = hitsoundKey(path);
    if (!sampleKey || hitsounds[sampleKey]) continue;
    hitsounds[sampleKey] = await entry.async("blob");
  }

  /** Turn an extensionless skin.ini image ref into an object URL (cached). */
  const resolveUrl = async (ref: string | undefined): Promise<string | null> => {
    const entry = findImage(index, ref);
    if (!entry) return null;
    const cached = urlCache.get(entry.name);
    if (cached) return cached;
    const raw = await entry.async("blob");
    const url = URL.createObjectURL(new Blob([raw], { type: "image/png" }));
    urlCache.set(entry.name, url);
    objectUrls.push(url);
    return url;
  };

  /**
   * Resolve a hold-body ref. Tall "capped" bodies (a rounded end baked into the
   * top of an otherwise uniform, often 40000px-tall strip) can't be loaded or
   * drawn as-is - the size blows past the browser's max image/texture dimension,
   * and stretching the whole thing into a note squashes the cap away. So those
   * are normalised down to a small sprite (trimmed to the cap plus a sliver of
   * fill) and reported with the cap's pixel height. Ordinary bodies pass through.
   */
  const bodyCache = new Map<string, { url: string | null; capPx: number | null }>();
  const resolveBody = async (
    ref: string | undefined,
  ): Promise<{ url: string | null; capPx: number | null }> => {
    const entry = findImage(index, ref);
    if (!entry) return { url: null, capPx: null };
    // Many columns / keymodes share one body image; only process it once.
    const hit = bodyCache.get(entry.name);
    if (hit) return hit;

    const blob = new Blob([await entry.async("blob")], { type: "image/png" });
    let result: { url: string | null; capPx: number | null };
    try {
      const norm = await normalizeCappedBody(blob);
      if (norm) {
        objectUrls.push(norm.url);
        result = norm;
      } else {
        result = { url: URL.createObjectURL(blob), capPx: null };
        objectUrls.push(result.url!);
      }
    } catch {
      // Decode/canvas unsupported or failed - fall back to the raw sprite.
      result = { url: URL.createObjectURL(blob), capPx: null };
      objectUrls.push(result.url!);
    }
    bodyCache.set(entry.name, result);
    return result;
  };

  const keymodes: Record<number, ManiaKeymodeSkin> = {};
  for (const block of mania) {
    const keys = Math.round(Number(block["keys"]));
    if (!Number.isFinite(keys) || keys < MIN_KEYS || keys > MAX_KEYS) continue;
    if (keymodes[keys]) continue; // first definition wins

    const columns: ManiaColumnSkin[] = [];
    for (let c = 0; c < keys; c++) {
      // osu! note-image lookup: the skin's explicit `NoteImage{c}[suffix]` ref
      // when present, otherwise the default element name for this column.
      const v = fallbackColumnIndex(c, keys);
      const body = await resolveBody(block[`noteimage${c}l`] || `mania-note${v}L`);
      columns.push({
        colour: parseColour(block[`colour${c + 1}`]),
        noteUrl: await resolveUrl(block[`noteimage${c}`] || `mania-note${v}`),
        holdHeadUrl: await resolveUrl(block[`noteimage${c}h`] || `mania-note${v}H`),
        holdBodyUrl: body.url,
        holdBodyCapPx: body.capPx,
        holdTailUrl: await resolveUrl(block[`noteimage${c}t`] || `mania-note${v}T`),
        // Receptors: the skin's explicit `KeyImage{c}[D]` ref, else osu!'s
        // default-named element for this column (`mania-key{1|2|S}[D]`).
        keyUrl: await resolveUrl(block[`keyimage${c}`] || `mania-key${v}`),
        keyDownUrl: await resolveUrl(block[`keyimage${c}d`] || `mania-key${v}D`),
      });
    }
    keymodes[keys] = { keys, columns };
  }

  const resolveFirstUrl = async (...refs: string[]): Promise<string | null> => {
    for (const ref of refs) {
      const url = await resolveUrl(ref);
      if (url) return url;
    }
    return null;
  };

  const comboNumbers: LoadedSkin["ui"]["comboNumbers"] = {};
  for (let n = 0; n <= 9; n++) {
    const url = await resolveFirstUrl(`combo-${n}`, `score-${n}`);
    if (url) comboNumbers[String(n)] = url;
  }

  // osu!mania draws its own judgement sprites (`mania-hit300g` … `mania-hit0`)
  // and only falls back to the osu!standard elements (`hit300g` …) when the
  // skin doesn't ship the mania-specific ones. Mirror that lookup order so a
  // skin's actual mania judgements are used in Playtest Mode.
  const judgementImages: LoadedSkin["ui"]["judgementImages"] = {};
  const judgementRefs: Record<keyof LoadedSkin["ui"]["judgementImages"], string[]> = {
    max: ["mania-hit300g", "hit300g", "hit300k", "mania-hit300", "hit300"],
    "300": ["mania-hit300", "hit300", "hit300k"],
    "200": ["mania-hit200", "hit200", "hit200k"],
    "100": ["mania-hit100", "hit100", "hit100k"],
    "50": ["mania-hit50", "hit50"],
    miss: ["mania-hit0", "hit0", "hitmiss", "miss"],
  };
  // Judgement sprites are often animated: osu! names the frames `element-0`,
  // `element-1`, … (some skins zero-pad, e.g. `element-00`). When a skin ships
  // only the animation, use its first frame as the static judgement image. So
  // for each candidate try the plain name, then frame 0 (`-0` / `-00`).
  for (const key of Object.keys(judgementRefs) as (keyof typeof judgementRefs)[]) {
    const candidates = judgementRefs[key].flatMap((base) => [
      base,
      `${base}-0`,
      `${base}-00`,
    ]);
    const url = await resolveFirstUrl(...candidates);
    if (url) judgementImages[key] = url;
  }

  return {
    name: general["name"]?.trim() || stripExt(fileName),
    author: general["author"]?.trim() || "",
    fileName,
    blob: file,
    keymodes,
    hitsounds,
    ui: { comboNumbers, judgementImages },
    objectUrls,
  };
}

// ---- hold-body normalisation -----------------------------------------------

/** Read `[width, height]` from a PNG blob's IHDR header, or null if not a PNG. */
async function pngSize(blob: Blob): Promise<[number, number] | null> {
  const head = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length < 24 || sig.some((b, i) => head[i] !== b)) return null;
  const view = new DataView(head.buffer);
  return [view.getUint32(16), view.getUint32(20)];
}

/**
 * Detect a tall "capped" hold body - a sprite far taller than it is wide, with
 * a rounded end at the top and a uniform fill below (osu skins use ~40000px-tall
 * strips so the body never visibly tiles). Returns a normalised sprite trimmed
 * to the cap plus a sliver of fill (small enough to load and draw safely) plus
 * the cap's height in that sprite's pixels. Returns null for ordinary bodies.
 */
async function normalizeCappedBody(
  blob: Blob,
): Promise<{ url: string; capPx: number } | null> {
  const size = await pngSize(blob);
  if (!size) return null;
  const [w, h] = size;
  // Ordinary bodies (tileable textures, short designed bodies) are stretched
  // whole; only treat clearly cap+fill strips specially.
  if (w === 0 || h <= w * 2) return null;

  // Decode just the top of the strip: enough to clear any transparent padding
  // and capture the full cap, but never the whole giant image.
  const sliceH = Math.min(h, 1024);
  const bmp = await createImageBitmap(blob, 0, 0, w, sliceH);
  const src = document.createElement("canvas");
  src.width = w;
  src.height = sliceH;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) {
    bmp.close?.();
    return null;
  }
  sctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const { data } = sctx.getImageData(0, 0, w, sliceH);

  const opaqueWidth = (y: number): number => {
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 32) {
        if (left < 0) left = x;
        right = x;
      }
    }
    return left < 0 ? 0 : right - left + 1;
  };

  // First opaque row (top of the cap) and the body's full opaque width.
  let domeTop = -1;
  let maxWidth = 0;
  for (let y = 0; y < sliceH; y++) {
    const ww = opaqueWidth(y);
    if (ww > 0 && domeTop < 0) domeTop = y;
    if (ww > maxWidth) maxWidth = ww;
  }
  if (domeTop < 0 || maxWidth === 0) return null;

  // The cap ends where the sprite first reaches its full width (the straight
  // fill below the rounded end).
  let capEnd = domeTop;
  for (let y = domeTop; y < sliceH; y++) {
    if (opaqueWidth(y) >= maxWidth * 0.98) {
      capEnd = y;
      break;
    }
  }
  const capPx = Math.max(capEnd - domeTop + 1, 1);

  // Emit cap + a short run of fill, anchored at the cap's top (padding trimmed).
  const outH = Math.min(sliceH - domeTop, capPx + 48);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.drawImage(src, 0, domeTop, w, outH, 0, 0, w, outH);
  const outBlob = await new Promise<Blob | null>((resolve) =>
    out.toBlob((b) => resolve(b), "image/png"),
  );
  if (!outBlob) return null;
  return { url: URL.createObjectURL(outBlob), capPx };
}

// ---- skin.ini parsing ------------------------------------------------------

/**
 * Parse a `skin.ini` into its `[General]` block and the list of `[Mania]`
 * blocks (there is one per keymode). All keys are lower-cased for robust,
 * case-insensitive lookup; values keep their original casing.
 */
function parseSkinIni(text: string): {
  general: Record<string, string>;
  mania: Record<string, string>[];
} {
  const general: Record<string, string> = {};
  const mania: Record<string, string>[] = [];
  let section: "general" | "mania" | "other" = "other";
  let block: Record<string, string> | null = null;

  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;

    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      const name = header[1].trim().toLowerCase();
      if (name === "general") {
        section = "general";
        block = null;
      } else if (name === "mania") {
        section = "mania";
        block = {};
        mania.push(block);
      } else {
        section = "other";
        block = null;
      }
      continue;
    }

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (section === "general") general[key] = value;
    else if (section === "mania" && block) block[key] = value;
  }

  return { general, mania };
}

/** `"255,128,0"` / `"255,128,0,200"` -> a CSS colour string, or null. */
function parseColour(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(",").map((s) => Number(s.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [r, g, b, a] = parts;
  return a === undefined || !Number.isFinite(a)
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

/**
 * osu!'s default note-image variant for a column when skin.ini doesn't list one
 * explicitly. The centre lane of an odd keymode is the "special" column (`S`);
 * every other column alternates `1`/`2` by its distance to the nearest stage
 * edge. Mirrors osu!stable's `LegacyManiaColumnElement.FallbackColumnIndex`
 * (e.g. 7K → `1 2 1 S 1 2 1`, 4K → `1 2 2 1`).
 */
function fallbackColumnIndex(column: number, keys: number): "1" | "2" | "S" {
  if (keys % 2 === 1 && column === Math.floor(keys / 2)) return "S";
  const distanceToEdge = Math.min(column, keys - 1 - column);
  return distanceToEdge % 2 === 0 ? "1" : "2";
}

/**
 * Resolve an extensionless skin.ini image reference (e.g. `mania/note1`) to a
 * zip entry, trying the standard `.png` and `@2x.png` (HD) variants.
 */
function findImage(
  index: Map<string, JSZip.JSZipObject>,
  ref: string | undefined,
): JSZip.JSZipObject | null {
  if (!ref) return null;
  const base = ref.replace(/\\/g, "/").trim().toLowerCase();
  // `_blank` is osu's sentinel for "intentionally no image"; empty is the same.
  if (!base || base === "_blank") return null;
  const candidates = [`${base}.png`, `${base}@2x.png`, base];
  for (const candidate of candidates) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }
  // Fallback: some skins nest elements in a subfolder, so the exact root path
  // misses. Match by basename (the last path segment) against the same variants.
  const suffixes = candidates.map((c) => `/${c}`);
  for (const [path, entry] of index) {
    if (suffixes.some((s) => path.endsWith(s))) return entry;
  }
  return null;
}

function hitsoundKey(path: string): string | null {
  const file = path.split("/").pop() ?? "";
  const match = file.match(
    /^(normal|soft|drum)-hit(normal|whistle|finish|clap)\d*\.(wav|mp3|ogg)$/i,
  );
  return match ? file.replace(/\.[^.]+$/, "").toLowerCase() : null;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
