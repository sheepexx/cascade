export type PackArtistMode = "various" | "original-per-map" | "custom-shared";

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

export type PackAsset = {
  id: string;
  name: string;
  blob: Blob;
  size: number;
  hash: string;
  referenced: boolean;
};

export type ParsedOsuFile = {
  rawText: string;
  mode: number;
  keyCount: number;
  audioFilename: string | null;
  backgroundFilename: string | null;
  videoFilename: string | null;
  referencedAssets: string[];
  maxObjectTimeMs: number;
};

export type PackItem = {
  id: string;

  originalTitle: string;
  originalTitleUnicode?: string;
  originalArtist: string;
  originalArtistUnicode?: string;
  originalCreator: string;
  originalVersion: string;
  originalTags?: string;

  songDisplayName: string;
  rate?: string;
  mapperName: string;

  includeRateInDifficultyName: boolean;
  includeOriginalDifficultyName: boolean;
  includeMapperInBrackets: boolean;

  creatorFieldOverride?: string;

  overallDifficulty: number;
  hpDrainRate: number;

  originalAudioFilename: string;
  originalOsuFilename: string;
  sourceFileName?: string;
  sourceArchiveId: string;

  finalDifficultyName: string;

  nonMania?: boolean;

  parsedOsu: ParsedOsuFile;
  assets: PackAsset[];
};

export type PackCreatorSettings = {
  creatorFieldMode: PackCreatorFieldMode;
  keepOriginalTags: boolean;
  placeholderEnabled: boolean;
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

export const PACK_DEFAULT_OD = 8;
export const PACK_DEFAULT_HP = 7.5;
