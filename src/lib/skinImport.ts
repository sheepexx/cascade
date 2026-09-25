import type JSZip from "jszip";
import { loadSafeZip } from "./archiveLimits";
import {
  MAX_KEYS,
  MIN_KEYS,
  type LoadedSkin,
  type ManiaColumnSkin,
  type ManiaKeymodeSkin,
  type ManiaStagePiece,
  type ManiaStageSkin,
} from "../types";
import { t } from "./i18n/core";

type SkinArchive = {
  /** Every file by its full lower-cased path. */
  index: Map<string, JSZip.JSZipObject>;
  /** Every file by bare name, shallowest copy winning. */
  byName: Map<string, { entry: JSZip.JSZipObject; depth: number }>;
};

export async function importOsk(
  file: Blob,
  fileName: string,
): Promise<LoadedSkin> {
  let zip: JSZip;
  try {
    zip = await loadSafeZip(file);
  } catch {
    throw new Error(t("lib.invalidOsk"));
  }

  const index = new Map<string, JSZip.JSZipObject>();
  // Skins are also indexed by bare file name so a lookup never has to walk the
  // archive: an .osk may nest everything under a folder, and a skin with every
  // keymode costs over a thousand lookups.
  const byName = new Map<string, { entry: JSZip.JSZipObject; depth: number }>();
  let iniEntry: JSZip.JSZipObject | null = null;
  let iniDepth = Infinity;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const norm = path.replace(/\\/g, "/").toLowerCase();
    index.set(norm, entry);
    const segments = norm.split("/");
    const name = segments[segments.length - 1];
    const depth = segments.length;
    // The shallowest copy wins, so a skin's own art beats a spare tucked away
    // in a subfolder.
    const seen = byName.get(name);
    if (!seen || depth < seen.depth) byName.set(name, { entry, depth });
    if (name === "skin.ini" && depth < iniDepth) {
      iniDepth = depth;
      iniEntry = entry;
    }
  });

  const archive: SkinArchive = { index, byName };

  const iniText = iniEntry
    ? decodeIni(await (iniEntry as JSZip.JSZipObject).async("uint8array"))
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

  const urlFor = async (entry: JSZip.JSZipObject): Promise<string> => {
    const cached = urlCache.get(entry.name);
    if (cached) return cached;
    const raw = await entry.async("blob");
    const url = URL.createObjectURL(new Blob([raw], { type: imageMime(entry.name) }));
    urlCache.set(entry.name, url);
    objectUrls.push(url);
    return url;
  };

  const resolveUrl = async (ref: string | undefined): Promise<string | null> => {
    const entry = findImage(archive, ref);
    return entry ? await urlFor(entry) : null;
  };

  /** The first reference that resolves, carrying its `@2x` scale. */
  const resolveFirstPiece = async (
    ...refs: string[]
  ): Promise<ManiaStagePiece | null> => {
    for (const ref of refs) {
      const entry = findImage(archive, ref);
      if (!entry) continue;
      return {
        url: await urlFor(entry),
        scale: HD_SUFFIX.test(entry.name) ? 0.5 : 1,
      };
    }
    return null;
  };

  const resolveFirstUrl = async (...refs: string[]): Promise<string | null> => {
    for (const ref of refs) {
      const url = await resolveUrl(ref);
      if (url) return url;
    }
    return null;
  };



  const blockFor = new Map<number, Record<string, string>>();
  for (const block of mania) {
    const keys = Math.round(Number(block["keys"]));
    if (!Number.isFinite(keys) || keys < MIN_KEYS || keys > MAX_KEYS) continue;
    // A skin may repeat a keymode to describe variants; osu! reads the first.
    if (!blockFor.has(keys)) blockFor.set(keys, block);
  }

  // osu! renders a keymode the skin never mentions from the shared
  // mania-note1/2/S set, and most skins lean on that: plenty declare only
  // `Keys: 4` while shipping art every other keymode can use. So build every
  // keymode that has something to show, not just the declared ones.
  const buildColumns = async (
    keys: number,
    block: Record<string, string> | undefined,
  ): Promise<ManiaColumnSkin[]> => {
    const widths = columnWidths(block, keys);
    // osu! takes note height from WidthForNoteHeightScale, falling back to the
    // narrowest column: "the smallest one is scaled correctly and the others
    // are compressed to match its height".
    const heightWidth =
      finiteNumber(block?.["widthfornoteheightscale"]) ?? Math.min(...widths);
    const columns: ManiaColumnSkin[] = [];
    for (let c = 0; c < keys; c++) {
      const v = fallbackColumnIndex(c, keys);
      // A named image that is not in the archive falls back to the shared
      // default, the way osu! does. Skins reference art in subfolders all the
      // time, and one that did not travel must not blank the column.
      const named = (key: string, fallback: string) =>
        resolveFirstUrl(block?.[key] ?? "", fallback);
      const noteUrl = await named(`noteimage${c}`, `mania-note${v}`);
      const holdHeadUrl = await named(`noteimage${c}h`, `mania-note${v}H`);
      columns.push({
        bodyStretch: bodyStretch(block, c),
        columnWidth: widths[c] * STABLE_MAGIC_SCALE_FACTOR,
        noteHeightScale:
          widths[c] > 0 ? clamp(heightWidth / widths[c], 0.2, 5) : 1,
        columnBackground: columnColour(block?.[`colour${c + 1}`]),
        noteUrl,
        holdHeadUrl,
        holdBodyUrl: await named(`noteimage${c}l`, `mania-note${v}L`),
        // osu! looks up the tail, then the head, then the plain note — plenty
        // of skins draw no mania-noteNT of their own and lean on that.
        holdTailUrl:
          (await named(`noteimage${c}t`, `mania-note${v}T`)) ??
          holdHeadUrl ??
          noteUrl,
        keyUrl: await named(`keyimage${c}`, `mania-key${v}`),
        keyDownUrl: await named(`keyimage${c}d`, `mania-key${v}D`),
      });
    }
    return columns;
  };

  // A keymode may name its own stage pieces; otherwise the shared
  // mania-stage-* set applies. The `-0` spellings are the first frame of an
  // animated piece, which is all a still playfield needs.
  const buildStage = async (
    block: Record<string, string> | undefined,
  ): Promise<ManiaStageSkin> => {
    const piece = async (key: string, base: string) =>
      block?.[key]
        ? await resolveFirstPiece(block[key], `${block[key]}-0`)
        : await resolveFirstPiece(base, `${base}-0`, `${base}-00`);
    return {
      left: await piece("stageleft", "mania-stage-left"),
      right: await piece("stageright", "mania-stage-right"),
      bottom: await piece("stagebottom", "mania-stage-bottom"),
      hint: await piece("stagehint", "mania-stage-hint"),
    };
  };

  const stageCache = new Map<
    Record<string, string> | undefined,
    ManiaStageSkin
  >();
  const keymodes: Record<number, ManiaKeymodeSkin> = {};
  for (let keys = MIN_KEYS; keys <= MAX_KEYS; keys++) {
    const block = blockFor.get(keys);
    const columns = await buildColumns(keys, block);
    let stage = stageCache.get(block);
    if (!stage) {
      stage = await buildStage(block);
      stageCache.set(block, stage);
    }
    // A declared keymode is kept even when its art is missing, because its
    // column colours alone are a deliberate choice. An undeclared one is only
    // worth keeping when the shared art actually gave it something to draw.
    if (!block && !columns.some(hasArt) && !hasStage(stage)) continue;
    keymodes[keys] = { keys, columns, stage, declared: !!block };
  }

  const comboNumbers: LoadedSkin["ui"]["comboNumbers"] = {};
  for (let n = 0; n <= 9; n++) {
    const url = await resolveFirstUrl(`combo-${n}`, `score-${n}`);
    if (url) comboNumbers[String(n)] = url;
  }

  const judgementImages: LoadedSkin["ui"]["judgementImages"] = {};
  const judgementRefs: Record<keyof LoadedSkin["ui"]["judgementImages"], string[]> = {
    max: ["mania-hit300g", "hit300g", "hit300k", "mania-hit300", "hit300"],
    "300": ["mania-hit300", "hit300", "hit300k"],
    "200": ["mania-hit200", "hit200", "hit200k"],
    "100": ["mania-hit100", "hit100", "hit100k"],
    "50": ["mania-hit50", "hit50"],
    miss: ["mania-hit0", "hit0", "hitmiss", "miss"],
  };
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

const DEFAULT_COLUMN_WIDTH = 30;
/** osu!'s double-resolution art, which covers the same ground at twice the detail. */
const HD_SUFFIX = /@2x.[^.]+$/i;
/**
 * What osu! multiplies skin.ini's lengths by: stable authored them against a
 * 480-tall playfield, lazer draws in a 768-tall one, and 768 / 480 is 1.6.
 */
export const STABLE_MAGIC_SCALE_FACTOR = 1.6;

function finiteNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** skin.ini's `ColumnWidth`, a comma-split list, one entry per column. */
function columnWidths(
  block: Record<string, string> | undefined,
  keys: number,
): number[] {
  const listed = (block?.["columnwidth"] ?? "")
    .split(",")
    .map((part) => finiteNumber(part))
    .filter((n): n is number => n !== null);
  return Array.from(
    { length: keys },
    (_, c) => listed[c] ?? listed[listed.length - 1] ?? DEFAULT_COLUMN_WIDTH,
  );
}

/**
 * Whether `NoteBodyStyle` asks for the stretched body — the only branch osu!
 * actually distinguishes.
 *
 * `LegacyNoteBodyStyle` defines Stretch = 0, RepeatTop = 2, RepeatBottom = 3
 * and RepeatTopAndBottom = 4, with a comment that the `Repeat = 1` the wiki
 * documents "is seemingly not [the default] according to the source". The
 * decoder parses the number with `Enum.TryParse`, which accepts any integer,
 * and `LegacyBodyPiece` then switches on `Stretch` alone: 1, the three repeat
 * values and no declaration at all fall through to one shared branch. There
 * is no version gate on it either.
 *
 * `NoteBodyStyle#` per column is parsed by osu! but never read back, so the
 * block-wide value is what decides — the per-column spelling is honoured here
 * only as a hint of what the author meant.
 */
function bodyStretch(
  block: Record<string, string> | undefined,
  column: number,
): boolean {
  const raw = block?.[`notebodystyle${column}`] ?? block?.["notebodystyle"];
  return raw !== undefined && Number(raw.trim()) === 0;
}


/**
 * `ColourN`, the solid box osu! paints behind a column.
 *
 * Undeclared or unreadable is opaque black, the fallback in `Column`'s
 * `?? Color4.Black`. A declared alpha counts twice, because stable's did:
 * `LegacyStageBackground` paints the box through `ApplyWithDoubledAlpha`,
 * which sets the drawable's own alpha as well as the colour's, squaring it.
 * Zero stays zero — `DisallowZeroAlpha` only rescues the colour, and the
 * drawable alpha of 0 still hides the box.
 */
function columnColour(value: string | undefined): string {
  const parts = (value ?? "").split(",").map((s) => Number(s.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) {
    return "rgb(0, 0, 0)";
  }
  const [r, g, b, a] = parts;
  if (a === undefined || !Number.isFinite(a) || a >= 255) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  const unit = clamp(a, 0, 255) / 255;
  return `rgba(${r}, ${g}, ${b}, ${Number((unit * unit).toFixed(4))})`;
}

function fallbackColumnIndex(column: number, keys: number): "1" | "2" | "S" {
  if (keys % 2 === 1 && column === Math.floor(keys / 2)) return "S";
  const distanceToEdge = Math.min(column, keys - 1 - column);
  return distanceToEdge % 2 === 0 ? "1" : "2";
}

/** Whether the skin drew a stage frame of its own. */
function hasStage(stage: ManiaStageSkin): boolean {
  return !!(stage.left || stage.right || stage.bottom || stage.hint);
}

/** Whether a column has any image at all, as opposed to only a lane colour. */
function hasArt(column: ManiaColumnSkin): boolean {
  return !!(
    column.noteUrl ||
    column.holdHeadUrl ||
    column.holdBodyUrl ||
    column.holdTailUrl ||
    column.keyUrl
  );
}

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg"];

function imageMime(path: string): string {
  return /\.jpe?g$/i.test(path) ? "image/jpeg" : "image/png";
}

/**
 * skin.ini is plain ASCII in the parts that matter, but the Name and Author
 * lines often are not, and plenty of skins were saved in a Windows codepage
 * rather than UTF-8. Decoding strictly first and only falling back on failure
 * keeps real UTF-8 intact while sparing everyone else the mojibake.
 */
function decodeIni(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes);
    }
  }
}

function findImage(
  archive: SkinArchive,
  ref: string | undefined,
): JSZip.JSZipObject | null {
  if (!ref) return null;
  // A skin.ini reference may carry its own extension, a folder, or the `@2x`
  // marker already; strip those so one lookup order covers every spelling.
  const cleaned = ref.replace(/\\/g, "/").trim().toLowerCase();
  const base = cleaned.replace(/\.(?:png|jpe?g)$/, "").replace(/@2x$/, "");
  if (!base || base === "_blank") return null;

  // Standard resolution wins over @2x, and the bare reference is the last
  // resort, so the result does not depend on how the zip happens to be ordered.
  const candidates = [
    ...IMAGE_EXTENSIONS.map((ext) => `${base}.${ext}`),
    ...IMAGE_EXTENSIONS.map((ext) => `${base}@2x.${ext}`),
    base,
  ];
  for (const candidate of candidates) {
    const exact = archive.index.get(candidate);
    if (exact) return exact;
    // A reference that named a folder has to match that whole tail; a bare one
    // can land on the file wherever the skin keeps it.
    const name = candidate.slice(candidate.lastIndexOf("/") + 1);
    if (name === candidate) {
      const hit = archive.byName.get(name);
      if (hit) return hit.entry;
      continue;
    }
    const suffix = `/${candidate}`;
    for (const [path, entry] of archive.index) {
      if (path.endsWith(suffix)) return entry;
    }
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
