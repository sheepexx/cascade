import JSZip from "jszip";
import { uid, makeDifficulty, MIN_KEYS, MAX_KEYS, type ManiaNote } from "../types";
import {
  PACK_DEFAULT_HP,
  PACK_DEFAULT_OD,
  PLACEHOLDER_VERSION,
  VARIOUS_ARTISTS,
  type PackAsset,
  type PackCreatorSettings,
  type PackItem,
  type PackMetadata,
  type PackValidationResult,
  type ParsedOsuFile,
} from "../types/packCreator";
import { parseOsuFile } from "./osuImport";
import { buildOsuFile } from "./osuExport";
import { isPngName, pngToJpeg, toJpegName, uniqueFileName } from "./imageConvert";

/**
 * Pack Creator engine: imports whole .osz archives, keeps every .osu as raw
 * text, and on export rewrites only the metadata plus any asset references
 * that had to be renamed to avoid collisions. See src/types/packCreator.ts.
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Strip characters Windows forbids in filenames. */
export function sanitizePackFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").trim() || "untitled";
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

async function sha1Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** `name.ext` -> `name_2.ext`, `name_3.ext`, … first one not in `taken`. */
function uniqueAssetName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  for (let n = 2; ; n++) {
    const candidate = `${stem}_${n}${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** All filenames referenced inside [Events] lines (quoted or bare). */
function eventFilenames(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("//")) continue;
    // Quoted references cover backgrounds, videos, storyboard sprites and
    // sample events; a handful of old maps write them unquoted, which the
    // background/video regexes in parseOsuFile already handle.
    for (const m of line.matchAll(/"([^"]+)"/g)) out.push(m[1]);
  }
  return out;
}

/** Light parse of one .osu: raw text + everything the pack tool needs. */
export function parseOsuForPack(text: string): ParsedOsuFile & {
  meta: ReturnType<typeof parseOsuFile>["meta"];
  version: string;
} {
  const parsed = parseOsuFile(text);
  const mode = Number(text.match(/^\s*Mode\s*:\s*(\d+)\s*$/m)?.[1] ?? 0);

  // [Events] section lines, for asset references beyond bg/video.
  const eventsBlock = text.match(/^\[Events\]\s*$([\s\S]*?)(?=^\[|\s*$(?![\s\S]))/m);
  const eventLines = (eventsBlock?.[1] ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const referenced = new Set<string>();
  if (parsed.audioFilename) referenced.add(parsed.audioFilename);
  if (parsed.backgroundFilename) referenced.add(parsed.backgroundFilename);
  if (parsed.videoFilename) referenced.add(parsed.videoFilename);
  for (const f of eventFilenames(eventLines)) referenced.add(f);
  for (const n of parsed.difficulty.notes) {
    if (n.sampleFile) referenced.add(n.sampleFile);
  }

  let maxObjectTimeMs = 0;
  for (const n of parsed.difficulty.notes) {
    maxObjectTimeMs = Math.max(maxObjectTimeMs, n.endTime ?? n.startTime);
  }

  return {
    rawText: text,
    mode,
    keyCount: parsed.difficulty.keyCount,
    audioFilename: parsed.audioFilename,
    backgroundFilename: parsed.backgroundFilename,
    videoFilename: parsed.videoFilename,
    referencedAssets: [...referenced],
    maxObjectTimeMs,
    meta: parsed.meta,
    version: parsed.difficulty.name,
  };
}

// ---------------------------------------------------------------------------
// Rate detection
// ---------------------------------------------------------------------------

/** Plausible playback-rate bounds; guards against "x4" style keymode names. */
const MIN_RATE = 0.5;
const MAX_RATE = 3;

/**
 * Detect a rate marker in an original difficulty name: `x1.2`, `1.2x`,
 * `x0.9`, `0.9x`, `x1.05`, plus the mod aliases DT / HT / NC.
 * Numeric rates are normalised to the `x1.2` form.
 */
export function detectRateFromVersion(version: string): string | undefined {
  const mod = version.match(/(?:^|[\s([\]-])(DT|HT|NC)(?=$|[\s)\]-])/i);
  if (mod) return mod[1].toUpperCase();

  const xFirst = version.match(/(?:^|[^\w.])x(\d+(?:\.\d+)?)(?=$|[^\w.])/i);
  const xLast = version.match(/(?:^|[^\w.])(\d+(?:\.\d+)?)x(?=$|[^\w.])/i);
  const raw = xFirst?.[1] ?? xLast?.[1];
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < MIN_RATE || value > MAX_RATE)
    return undefined;
  return `x${raw}`;
}

// ---------------------------------------------------------------------------
// Difficulty names / metadata fields
// ---------------------------------------------------------------------------

/** `<Song Name> <Rate> [- <Original Diff>] [<Mapper>]`, live-previewed in the UI. */
export function generatePackDifficultyName(item: PackItem): string {
  let name = item.songDisplayName.trim();
  if (item.includeRateInDifficultyName && item.rate?.trim())
    name += ` ${item.rate.trim()}`;
  if (item.includeOriginalDifficultyName && item.originalVersion.trim())
    name += ` - ${item.originalVersion.trim()}`;
  if (item.includeMapperInBrackets && item.mapperName.trim())
    name += ` [${item.mapperName.trim()}]`;
  return name.trim();
}

export function artistFieldFor(metadata: PackMetadata, item: PackItem): string {
  if (metadata.artistMode === "original-per-map") return item.originalArtist;
  if (metadata.artistMode === "custom-shared")
    return metadata.customSharedArtist?.trim() || VARIOUS_ARTISTS;
  return VARIOUS_ARTISTS;
}

function artistUnicodeFieldFor(metadata: PackMetadata, item: PackItem): string {
  if (metadata.artistMode === "original-per-map")
    return item.originalArtistUnicode || item.originalArtist;
  return artistFieldFor(metadata, item);
}

export function creatorFieldFor(
  metadata: PackMetadata,
  settings: PackCreatorSettings,
  item: PackItem,
): string {
  if (item.creatorFieldOverride?.trim()) return item.creatorFieldOverride.trim();
  if (settings.creatorFieldMode === "original") return item.originalCreator;
  return metadata.creator;
}

function tagsFieldFor(
  metadata: PackMetadata,
  settings: PackCreatorSettings,
  item: PackItem,
): string {
  const words: string[] = [...(metadata.tags ?? [])];
  if (settings.keepOriginalTags) {
    words.push(item.originalArtist, item.originalCreator);
    if (item.originalTags) words.push(...item.originalTags.split(/\s+/));
  }
  // Dedupe case-insensitively, preserving first spelling.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const t = w.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.join(" ");
}

// ---------------------------------------------------------------------------
// .osu rewriting
// ---------------------------------------------------------------------------

export type RewriteArgs = {
  item: PackItem;
  metadata: PackMetadata;
  settings: PackCreatorSettings;
  /** lowercased original name -> new name, for this item's source archive. */
  renames: Map<string, string>;
};

/**
 * Rewrite one imported .osu for the pack: replace the whole [Metadata] block,
 * point AudioFilename at the (possibly renamed) audio, and update any renamed
 * asset references inside [Events] / [HitObjects]. Everything else is kept
 * verbatim so the chart itself cannot be damaged.
 */
export function rewriteOsuForPack({
  item,
  metadata,
  settings,
  renames,
}: RewriteArgs): string {
  const applyRenames = (line: string): string => {
    if (!renames.size) return line;
    let out = line;
    for (const [oldLower, next] of renames) {
      // Case-insensitive, escaped literal match of the original filename,
      // delimited so e.g. renaming "a.wav" can't touch "media.wav". Event and
      // sample references are bounded by quotes, commas, colons or line edges.
      const escaped = oldLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?<=^|["',:])${escaped}(?=$|["',:])`, "gi");
      out = out.replace(pattern, next);
    }
    return out;
  };

  const metadataBlock = [
    `Title:${metadata.title}`,
    `TitleUnicode:${metadata.titleUnicode?.trim() || metadata.title}`,
    `Artist:${artistFieldFor(metadata, item)}`,
    `ArtistUnicode:${artistUnicodeFieldFor(metadata, item)}`,
    `Creator:${creatorFieldFor(metadata, settings, item)}`,
    `Version:${generatePackDifficultyName(item)}`,
    `Source:${metadata.source ?? ""}`,
    `Tags:${tagsFieldFor(metadata, settings, item)}`,
    "BeatmapID:0",
    "BeatmapSetID:-1",
  ];

  const out: string[] = [];
  let section = "";
  for (const raw of item.parsedOsu.rawText.split(/\r?\n/)) {
    const header = raw.trim().match(/^\[(.+)\]$/);
    if (header) {
      section = header[1];
      out.push(raw.trim());
      if (section === "Metadata") out.push(...metadataBlock);
      continue;
    }
    if (section === "Metadata") continue; // replaced wholesale above
    if (section === "General") {
      const m = raw.match(/^(\s*AudioFilename\s*:\s*)(.*)$/);
      if (m) {
        const current = m[2].trim();
        const renamed = renames.get(current.toLowerCase());
        out.push(`AudioFilename: ${renamed ?? current}`);
        continue;
      }
    }
    if (section === "Difficulty") {
      if (/^\s*OverallDifficulty\s*:/i.test(raw)) {
        out.push(`OverallDifficulty:${item.overallDifficulty}`);
        continue;
      }
      if (/^\s*HPDrainRate\s*:/i.test(raw)) {
        out.push(`HPDrainRate:${item.hpDrainRate}`);
        continue;
      }
    }
    if (section === "Events" || section === "HitObjects") {
      out.push(applyRenames(raw));
      continue;
    }
    out.push(raw);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type PackImportResult = {
  /** osu!mania difficulties, ready to add to the pack. */
  items: PackItem[];
  /** Non-mania difficulties, parsed but excluded unless manually included. */
  nonManiaItems: PackItem[];
  /** Human-readable problems with this archive (unreadable .osu files etc.). */
  problems: string[];
};

/**
 * Import one .osz for the Pack Creator: parse every .osu (keeping the raw
 * text), load every other file as a shared PackAsset, and split difficulties
 * into mania and non-mania.
 */
export async function importOszForPack(
  file: File,
  /** Overrides the "From" label (e.g. the original .sm/.ssc name for a
   *  StepMania song that was repackaged to .osz before import). */
  sourceLabel?: string,
): Promise<PackImportResult> {
  const zip = await JSZip.loadAsync(file);
  const archiveId = uid("packsrc");
  const problems: string[] = [];

  const osuEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  const assetEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const name = basename(path);
    if (name.toLowerCase().endsWith(".osu")) osuEntries.push({ name, entry });
    else assetEntries.push({ name, entry });
  });
  if (osuEntries.length === 0) {
    throw new Error(`${file.name} contains no .osu difficulties.`);
  }
  osuEntries.sort((a, b) => a.name.localeCompare(b.name));

  const parsedList: {
    name: string;
    parsed: ReturnType<typeof parseOsuForPack>;
  }[] = [];
  for (const e of osuEntries) {
    const text = await e.entry.async("string");
    try {
      parsedList.push({ name: e.name, parsed: parseOsuForPack(text) });
    } catch {
      problems.push(`${file.name}: could not parse ${e.name}; skipped.`);
    }
  }

  // Which asset names does any .osu in this archive reference?
  const referencedLower = new Set<string>();
  for (const { parsed } of parsedList)
    for (const r of parsed.referencedAssets) referencedLower.add(r.toLowerCase());

  const assets: PackAsset[] = [];
  for (const { name, entry } of assetEntries) {
    const blob = await entry.async("blob");
    assets.push({
      id: uid("asset"),
      name,
      blob,
      size: blob.size,
      hash: await sha1Hex(blob),
      referenced: referencedLower.has(name.toLowerCase()),
    });
  }

  const toItem = (name: string, parsed: ReturnType<typeof parseOsuForPack>): PackItem => {
    const rate = detectRateFromVersion(parsed.version);
    const item: PackItem = {
      id: uid("packitem"),
      originalTitle: parsed.meta.title,
      originalArtist: parsed.meta.artist,
      originalCreator: parsed.meta.creator,
      originalVersion: parsed.version,
      originalTags: parsed.meta.tags || undefined,
      songDisplayName: parsed.meta.title,
      rate,
      mapperName: parsed.meta.creator,
      includeRateInDifficultyName: rate !== undefined,
      includeOriginalDifficultyName: false,
      includeMapperInBrackets: true,
      overallDifficulty: PACK_DEFAULT_OD,
      hpDrainRate: PACK_DEFAULT_HP,
      originalAudioFilename: parsed.audioFilename ?? "",
      originalOsuFilename: name,
      sourceFileName: sourceLabel ?? file.name,
      sourceArchiveId: archiveId,
      finalDifficultyName: "",
      nonMania: parsed.mode !== 3 ? true : undefined,
      parsedOsu: parsed,
      assets,
    };
    item.finalDifficultyName = generatePackDifficultyName(item);
    return item;
  };

  const items: PackItem[] = [];
  const nonManiaItems: PackItem[] = [];
  for (const { name, parsed } of parsedList) {
    (parsed.mode === 3 ? items : nonManiaItems).push(toItem(name, parsed));
  }
  return { items, nonManiaItems, problems };
}

// ---------------------------------------------------------------------------
// Asset collision handling
// ---------------------------------------------------------------------------

export type CollisionResolution = {
  /** Final file list for the zip (deduped, collision-free). */
  files: { name: string; blob: Blob }[];
  /** archiveId -> (lowercased old name -> new name). */
  renamesByArchive: Map<string, Map<string, string>>;
  /** Convention-named files (custom hitsounds etc.) dropped on collision. */
  droppedNames: string[];
};

/**
 * Merge every item's assets into one flat file list. Identical contents under
 * the same name are shared; different contents under the same name are renamed
 * when the file is referenced by name (so the reference can be rewritten), or
 * dropped with a warning when only osu!'s naming conventions point at it.
 */
export function resolveAssetCollisions(items: PackItem[]): CollisionResolution {
  const files: { name: string; blob: Blob }[] = [];
  const renamesByArchive = new Map<string, Map<string, string>>();
  const droppedNames: string[] = [];
  const byName = new Map<string, string>(); // lower name -> hash
  const seenAssets = new Set<string>();

  for (const item of items) {
    for (const asset of item.assets) {
      if (seenAssets.has(asset.id)) continue;
      seenAssets.add(asset.id);

      const lower = asset.name.toLowerCase();
      const existing = byName.get(lower);
      if (existing === undefined) {
        byName.set(lower, asset.hash);
        files.push({ name: asset.name, blob: asset.blob });
        continue;
      }
      if (existing === asset.hash) continue; // same bytes: share the first copy

      if (!asset.referenced) {
        droppedNames.push(asset.name);
        continue;
      }
      const renamed = uniqueAssetName(asset.name, new Set(byName.keys()));
      byName.set(renamed.toLowerCase(), asset.hash);
      files.push({ name: renamed, blob: asset.blob });
      let map = renamesByArchive.get(item.sourceArchiveId);
      if (!map) {
        map = new Map();
        renamesByArchive.set(item.sourceArchiveId, map);
      }
      map.set(lower, renamed);
    }
  }
  return { files, renamesByArchive, droppedNames };
}

// ---------------------------------------------------------------------------
// Background JPEG conversion
// ---------------------------------------------------------------------------

/**
 * Re-encode PNG backgrounds referenced by the pack's difficulties to JPEG,
 * in place on the resolved `files` list. Only images referenced as a
 * difficulty background are touched — skin sprites, storyboard elements and
 * hitsound images are left alone since JPEG can't carry transparency.
 *
 * Each converted file is renamed `.png` -> `.jpg`; the corresponding `.osu`
 * reference is updated by adding a rename (keyed by the ORIGINAL name) to
 * `renamesByArchive`, chaining through any collision rename already recorded,
 * so {@link rewriteOsuForPack} rewrites the [Events] background line to match.
 */
async function convertPackBackgroundsToJpeg(
  files: { name: string; blob: Blob }[],
  renamesByArchive: Map<string, Map<string, string>>,
  items: PackItem[],
  quality: number,
): Promise<void> {
  // Snapshot the collision renames up front. We add our own JPEG renames to the
  // same map below, so reading it live would make a later difficulty see the
  // .jpg name as the "current" file and try to re-convert an already-converted
  // background.
  const collisionRenames = new Map<string, Map<string, string>>();
  for (const [archive, map] of renamesByArchive)
    collisionRenames.set(archive, new Map(map));

  // A background shared by several difficulties resolves to one file; convert
  // it once, keyed by its current (post-collision) name.
  const convertedFinal = new Map<string, string>();
  const handled = new Set<string>();
  const taken = new Set(files.map((f) => f.name.toLowerCase()));

  for (const item of items) {
    const bg = item.parsedOsu.backgroundFilename;
    if (!bg || !isPngName(bg)) continue;

    const dedupeKey = `${item.sourceArchiveId}\n${bg.toLowerCase()}`;
    if (handled.has(dedupeKey)) continue;
    handled.add(dedupeKey);

    const currentFinal =
      collisionRenames.get(item.sourceArchiveId)?.get(bg.toLowerCase()) ?? bg;
    const finalLower = currentFinal.toLowerCase();

    let jpgName = convertedFinal.get(finalLower);
    if (!jpgName) {
      const fileEntry = files.find((f) => f.name.toLowerCase() === finalLower);
      if (!fileEntry) continue; // background missing from the archive
      const jpeg = await pngToJpeg(fileEntry.blob, quality);
      if (!jpeg) continue; // undecodable: keep the PNG
      taken.delete(finalLower);
      jpgName = uniqueFileName(toJpegName(currentFinal), taken);
      taken.add(jpgName.toLowerCase());
      fileEntry.name = jpgName;
      fileEntry.blob = jpeg;
      convertedFinal.set(finalLower, jpgName);
    }

    let map = renamesByArchive.get(item.sourceArchiveId);
    if (!map) {
      map = new Map();
      renamesByArchive.set(item.sourceArchiveId, map);
    }
    map.set(bg.toLowerCase(), jpgName);
  }
}

// ---------------------------------------------------------------------------
// "<Delete" placeholder difficulty
// ---------------------------------------------------------------------------

/** Decode the audio to find its real duration; null when undecodable. */
async function audioDurationMs(blob: Blob): Promise<number | null> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buffer.duration * 1000;
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => {});
  }
}

export type PlaceholderArgs = {
  metadata: PackMetadata;
  settings: PackCreatorSettings;
  /** The item whose audio the placeholder uses. */
  audioItem: PackItem;
  /** Exported audio filename (after any collision rename). */
  audioFilename: string;
  /** End-note time; from decoded duration when available. */
  lastNoteMs: number;
};

/**
 * Build the minimal "<Delete" thumbnail difficulty: valid mania metadata,
 * default timing, one note at the start and one near the end of the audio.
 */
export function generatePlaceholderDifficulty({
  metadata,
  settings,
  audioItem,
  audioFilename,
  lastNoteMs,
}: PlaceholderArgs): string {
  const keyCount = settings.placeholderKeyCount;
  const notes: ManiaNote[] = [
    { id: uid("ph"), column: 0, startTime: 0 },
    { id: uid("ph"), column: 0, startTime: Math.max(1000, Math.round(lastNoteMs)) },
  ];
  const difficulty = {
    ...makeDifficulty(PLACEHOLDER_VERSION, keyCount),
    notes,
  };
  return buildOsuFile({
    meta: {
      title: metadata.title,
      artist: artistFieldFor(metadata, audioItem),
      creator: metadata.creator,
      tags: (metadata.tags ?? []).join(" "),
    },
    difficulty,
    timingPoints: difficulty.timingPoints,
    audioFilename,
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidatePackArgs = {
  metadata: PackMetadata;
  items: PackItem[];
  settings: PackCreatorSettings;
};

export function validatePack({
  metadata,
  items,
  settings,
}: ValidatePackArgs): PackValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (items.length === 0) errors.push("No maps imported.");
  if (!metadata.title.trim()) errors.push("Missing pack title.");
  if (!metadata.creator.trim()) errors.push("Missing pack creator.");
  if (metadata.artistMode === "custom-shared" && !metadata.customSharedArtist?.trim())
    errors.push("Custom shared artist is empty.");

  const diffNames = new Map<string, number>();
  for (const item of items) {
    const label = item.songDisplayName.trim() || item.originalTitle || "(unnamed)";
    if (!item.songDisplayName.trim())
      errors.push(`"${item.originalTitle || item.originalOsuFilename}": missing song display name.`);
    if (item.includeMapperInBrackets && !item.mapperName.trim())
      errors.push(`"${label}": missing mapper name.`);
    if (!item.originalAudioFilename)
      errors.push(`"${label}": the imported map has no audio file reference.`);
    else if (
      !item.assets.some(
        (a) => a.name.toLowerCase() === item.originalAudioFilename.toLowerCase(),
      )
    )
      errors.push(`"${label}": audio "${item.originalAudioFilename}" is missing from the imported .osz.`);
    if (item.parsedOsu.keyCount < MIN_KEYS || item.parsedOsu.keyCount > MAX_KEYS)
      errors.push(`"${label}": invalid key count (${item.parsedOsu.keyCount}).`);

    const final = generatePackDifficultyName(item);
    diffNames.set(final.toLowerCase(), (diffNames.get(final.toLowerCase()) ?? 0) + 1);

    if (item.nonMania)
      warnings.push(`"${label}" is not an osu!mania map; it will export unconverted.`);
    if (!item.parsedOsu.backgroundFilename)
      warnings.push(`"${label}": no background image.`);
    if (
      item.parsedOsu.videoFilename &&
      !item.assets.some(
        (a) => a.name.toLowerCase() === item.parsedOsu.videoFilename!.toLowerCase(),
      )
    )
      warnings.push(`"${label}": background video "${item.parsedOsu.videoFilename}" is missing from the imported .osz.`);
    if (
      !item.rate &&
      /\d\s*x|x\s*\d/i.test(item.originalVersion) &&
      item.includeRateInDifficultyName
    )
      warnings.push(`"${label}": rate could not be detected from "${item.originalVersion}"; set it manually if needed.`);
  }
  for (const [name, count] of diffNames) {
    if (count > 1)
      errors.push(`Duplicate final difficulty name "${name}" (${count} difficulties). Adjust rates, mappers or display names.`);
  }

  if (settings.placeholderEnabled) {
    if (
      !settings.placeholderAudioItemId ||
      !items.some((i) => i.id === settings.placeholderAudioItemId)
    )
      errors.push("Thumbnail difficulty is enabled but no audio source is selected.");
    if (
      !Number.isInteger(settings.placeholderKeyCount) ||
      settings.placeholderKeyCount < MIN_KEYS ||
      settings.placeholderKeyCount > MAX_KEYS
    )
      errors.push(`Invalid thumbnail key count (${settings.placeholderKeyCount}).`);
    warnings.push("The <Delete thumbnail difficulty is only meant as a local pack helper.");
  }

  const distinctArtists = new Set(items.map((i) => i.originalArtist.toLowerCase()));
  if (metadata.artistMode !== "various") {
    warnings.push("Changing artist metadata may make the pack less consistent or unsuitable for upload.");
    if (distinctArtists.size > 1)
      warnings.push("Multiple imported maps have different original artists; using Various Artists is recommended.");
  }
  if (settings.creatorFieldMode === "original")
    warnings.push("Using the original mapper in the Creator field may make the pack unsuitable for official upload/submission.");

  const { droppedNames } = resolveAssetCollisions(items);
  if (droppedNames.length)
    warnings.push(`Some custom hitsounds may not be referenced correctly: colliding files (${[...new Set(droppedNames)].join(", ")}) share a name but differ in content, so only the first copy is kept.`);

  const distinctSongs = new Set(items.map((i) => i.originalTitle.toLowerCase()));
  if (distinctSongs.size > 1)
    warnings.push("Packs with multiple songs may not be suitable for official osu! submission.");

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Build / export
// ---------------------------------------------------------------------------

/** `<Artist> - <Pack Title> (<Creator>) [<Diff>].osu`, sanitized + unique. */
function packOsuFilename(
  artist: string,
  title: string,
  creator: string,
  diffName: string,
  taken: Set<string>,
): string {
  const base = `${sanitizePackFilename(artist)} - ${sanitizePackFilename(
    title,
  )} (${sanitizePackFilename(creator)}) [${sanitizePackFilename(diffName)}]`;
  let name = `${base}.osu`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}.osu`;
  taken.add(name.toLowerCase());
  return name;
}

export function packOszFilename(metadata: PackMetadata): string {
  return `${sanitizePackFilename(metadata.title)} (${sanitizePackFilename(
    metadata.creator,
  )}) Pack.osz`;
}

export type BuildPackArgs = {
  metadata: PackMetadata;
  items: PackItem[];
  settings: PackCreatorSettings;
  /**
   * When set (0 < q ≤ 1), re-encode PNG backgrounds as JPEG at this quality to
   * shrink the archive. Undefined keeps every image byte-for-byte.
   */
  jpegQuality?: number;
};

/** Assemble the final .osz: rewritten .osu files, assets, optional <Delete. */
export async function buildPack({
  metadata,
  items,
  settings,
  jpegQuality,
}: BuildPackArgs): Promise<{ blob: Blob; filename: string }> {
  const zip = new JSZip();
  const { files, renamesByArchive } = resolveAssetCollisions(items);
  if (typeof jpegQuality === "number" && jpegQuality > 0) {
    await convertPackBackgroundsToJpeg(files, renamesByArchive, items, jpegQuality);
  }
  for (const f of files) zip.file(f.name, f.blob);

  const takenOsuNames = new Set<string>();
  for (const item of items) {
    const renames = renamesByArchive.get(item.sourceArchiveId) ?? new Map();
    const text = rewriteOsuForPack({ item, metadata, settings, renames });
    const filename = packOsuFilename(
      artistFieldFor(metadata, item),
      metadata.title,
      creatorFieldFor(metadata, settings, item),
      generatePackDifficultyName(item),
      takenOsuNames,
    );
    zip.file(filename, text);
  }

  if (settings.placeholderEnabled) {
    const audioItem = items.find((i) => i.id === settings.placeholderAudioItemId);
    if (audioItem) {
      const renames = renamesByArchive.get(audioItem.sourceArchiveId);
      const audioFilename =
        renames?.get(audioItem.originalAudioFilename.toLowerCase()) ??
        audioItem.originalAudioFilename;
      const audioAsset = audioItem.assets.find(
        (a) => a.name.toLowerCase() === audioItem.originalAudioFilename.toLowerCase(),
      );
      const durationMs = audioAsset ? await audioDurationMs(audioAsset.blob) : null;
      const lastNoteMs =
        durationMs !== null
          ? durationMs - 1000
          : audioItem.parsedOsu.maxObjectTimeMs + 500;
      const text = generatePlaceholderDifficulty({
        metadata,
        settings,
        audioItem,
        audioFilename,
        lastNoteMs,
      });
      const filename = packOsuFilename(
        artistFieldFor(metadata, audioItem),
        metadata.title,
        metadata.creator,
        PLACEHOLDER_VERSION,
        takenOsuNames,
      );
      zip.file(filename, text);
    }
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { blob, filename: packOszFilename(metadata) };
}
