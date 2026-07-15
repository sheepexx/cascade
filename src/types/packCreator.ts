/**
 * Pack Creator domain types.
 *
 * The Pack Creator combines several existing osu!mania beatmaps into one
 * exported .osz "song pack" (multiple songs in a single beatmapset). Items
 * keep the original .osu text verbatim; only metadata and renamed asset
 * references are rewritten on export, so notes, timing, SVs, storyboards and
 * hitsounds survive untouched.
 */

/** How the exported Artist / ArtistUnicode fields are filled. */
export type PackArtistMode = "various" | "original-per-map" | "custom-shared";

/** How the exported Creator field is filled. */
export type PackCreatorFieldMode =
  | "pack"
  | "original"
  | "pack-append-mapper";

export type PackMetadata = {
  title: string;
  titleUnicode?: string;
  artistMode: PackArtistMode;
  customSharedArtist?: string;
  creator: string;
  source?: string;
  tags?: string[];
};

/** One file carried over from a source .osz (audio, image, video, hitsound…). */
export type PackAsset = {
  id: string;
  /** Basename inside the source archive; also the reference used by .osu files. */
  name: string;
  blob: Blob;
  size: number;
  /** SHA-1 of the contents, for collision / duplicate detection. */
  hash: string;
  /**
   * True when some .osu in the source archive references this file by name
   * (audio, background, video, sample events, keysounds). Referenced files can
   * be renamed on collision because the reference can be rewritten; files used
   * purely by osu!'s naming conventions (e.g. `soft-hitnormal.wav`) cannot.
   */
  referenced: boolean;
};

/**
 * Light parse of one .osu file. `rawText` is the source of truth for export;
 * the other fields exist for display, validation and reference rewriting.
 */
export type ParsedOsuFile = {
  rawText: string;
  /** osu! game mode (3 = mania). */
  mode: number;
  /** CircleSize = key count for mania. */
  keyCount: number;
  audioFilename: string | null;
  backgroundFilename: string | null;
  videoFilename: string | null;
  /** Every filename this .osu references (events + hit-object samples). */
  referencedAssets: string[];
  /** Latest hit-object time (ms), for the placeholder's end note. */
  maxObjectTimeMs: number;
};

/** One imported difficulty, i.e. one difficulty of the final pack. */
export type PackItem = {
  id: string;

  originalTitle: string;
  originalTitleUnicode?: string;
  originalArtist: string;
  originalArtistUnicode?: string;
  originalCreator: string;
  originalVersion: string;
  originalTags?: string;

  /** Song name used in the generated difficulty name. */
  songDisplayName: string;
  /** Rate suffix, e.g. "x1.2" or "DT". Empty/undefined = none. */
  rate?: string;
  /** Mapper credit shown in square brackets. */
  mapperName: string;

  includeRateInDifficultyName: boolean;
  includeOriginalDifficultyName: boolean;
  includeMapperInBrackets: boolean;

  /** Overrides the Creator field for this difficulty only. */
  creatorFieldOverride?: string;

  originalAudioFilename: string;
  originalOsuFilename: string;
  /** Name of the imported .osz this came from. */
  sourceFileName?: string;
  /** Groups items that came from the same archive (they share assets). */
  sourceArchiveId: string;

  /** Live-generated difficulty name (kept for display; regenerated on export). */
  finalDifficultyName: string;

  /** True for a non-mania map the user chose to include anyway. */
  nonMania?: boolean;

  parsedOsu: ParsedOsuFile;
  /** Assets from this item's source archive (shared between its items). */
  assets: PackAsset[];
};

export type PackCreatorSettings = {
  creatorFieldMode: PackCreatorFieldMode;
  /** Append each map's original tags/artist/creator to the exported Tags. */
  keepOriginalTags: boolean;
  /** "<Delete" thumbnail/placeholder difficulty. */
  placeholderEnabled: boolean;
  /** Item whose (possibly renamed) audio the placeholder uses. */
  placeholderAudioItemId: string | null;
  placeholderKeyCount: number;
};

export type PackValidationResult = {
  errors: string[];
  warnings: string[];
};

export const DEFAULT_PACK_METADATA: PackMetadata = {
  title: "",
  artistMode: "various",
  creator: "",
};

export const DEFAULT_PACK_SETTINGS: PackCreatorSettings = {
  creatorFieldMode: "pack-append-mapper",
  keepOriginalTags: true,
  placeholderEnabled: true,
  placeholderAudioItemId: null,
  placeholderKeyCount: 4,
};

export const VARIOUS_ARTISTS = "Various Artists";
export const PLACEHOLDER_VERSION = "<Delete";
