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
 * keymode (`Keys: N`) and lists per-column colours (`ColourN`, 1-indexed) and
 * note sprites (`NoteImage{col}` / `…H` head / `…L` body / `…T` tail,
 * 0-indexed). Image references are extensionless paths relative to the skin
 * root, resolved here to `.png` (or `@2x.png`) entries.
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
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const norm = path.replace(/\\/g, "/").toLowerCase();
    index.set(norm, entry);
    if (!iniEntry && norm.split("/").pop() === "skin.ini") iniEntry = entry;
  });

  const iniText = iniEntry
    ? await (iniEntry as JSZip.JSZipObject).async("string")
    : "";
  const { general, mania } = parseSkinIni(iniText);

  const objectUrls: string[] = [];
  const urlCache = new Map<string, string>();

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

  const keymodes: Record<number, ManiaKeymodeSkin> = {};
  for (const block of mania) {
    const keys = Math.round(Number(block["keys"]));
    if (!Number.isFinite(keys) || keys < MIN_KEYS || keys > MAX_KEYS) continue;
    if (keymodes[keys]) continue; // first definition wins

    const columns: ManiaColumnSkin[] = [];
    for (let c = 0; c < keys; c++) {
      columns.push({
        colour: parseColour(block[`colour${c + 1}`]),
        noteUrl: await resolveUrl(block[`noteimage${c}`]),
        holdHeadUrl: await resolveUrl(block[`noteimage${c}h`]),
        holdBodyUrl: await resolveUrl(block[`noteimage${c}l`]),
        holdTailUrl: await resolveUrl(block[`noteimage${c}t`]),
      });
    }
    keymodes[keys] = { keys, columns };
  }

  return {
    name: general["name"]?.trim() || stripExt(fileName),
    author: general["author"]?.trim() || "",
    fileName,
    blob: file,
    keymodes,
    objectUrls,
  };
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

  for (const raw of text.split(/\r?\n/)) {
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
 * Resolve an extensionless skin.ini image reference (e.g. `mania/note1`) to a
 * zip entry, trying the standard `.png` and `@2x.png` (HD) variants.
 */
function findImage(
  index: Map<string, JSZip.JSZipObject>,
  ref: string | undefined,
): JSZip.JSZipObject | null {
  if (!ref) return null;
  const base = ref.replace(/\\/g, "/").trim().toLowerCase();
  if (!base) return null;
  const candidates = [`${base}.png`, `${base}@2x.png`, base];
  for (const candidate of candidates) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }
  return null;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
