/**
 * Core domain types for the mania editor.
 *
 * Times are stored as integer milliseconds, matching the osu! file format.
 * Columns are 0-indexed from the left (column 0 = leftmost lane).
 *
 * A project is a *mapset*: shared song metadata + audio + a list of
 * difficulties. Timing points live on each difficulty because imported mapsets
 * can contain per-difficulty tempo/offset edits.
 */

/** A single mania note. A long note (hold) is one that has an `endTime`. */
export type ManiaNote = {
  id: string;
  /** 0-indexed lane, 0 = leftmost. Always < keyCount. */
  column: number;
  /** Start time in milliseconds. */
  startTime: number;
  /** End time in milliseconds. Present only for long notes (holds). */
  endTime?: number;
};

/** Beat-snap divisor. 4 = 1/4, 8 = 1/8, etc. */
export type SnapDivisor = 2 | 3 | 4 | 6 | 8 | 12 | 16;

export const SNAP_DIVISORS: SnapDivisor[] = [2, 3, 4, 6, 8, 12, 16];

/**
 * One uninherited timing point: from `time` onward the song runs at `bpm`.
 * The first point's `time` doubles as the map offset.
 */
export type TimingPoint = {
  id: string;
  /** Start time of this tempo section, in milliseconds. */
  time: number;
  /** Beats per minute from this point onward. */
  bpm: number;
};

/** Song-level metadata, shared by every difficulty in the set. */
export type SongMeta = {
  title: string;
  artist: string;
  creator: string;
};

/** A single difficulty within the set. */
export type Difficulty = {
  id: string;
  /** Difficulty name -> [Metadata] Version. */
  name: string;
  /** 1K .. 18K. Exported as CircleSize. */
  keyCount: number;
  /** HPDrainRate, 0..10. */
  hpDrainRate: number;
  /** OverallDifficulty, 0..10. */
  overallDifficulty: number;
  /** General PreviewTime in milliseconds. -1 means unset. */
  previewTime: number;
  timingPoints: TimingPoint[];
  notes: ManiaNote[];
};

/** A user-uploaded file kept in memory together with its raw bytes. */
export type LoadedFile = {
  /** Original file name, used inside the .osz and referenced in the .osu. */
  name: string;
  /** Object URL for playback / preview. Remember to revoke when replaced. */
  url: string;
  /** Raw bytes, used when zipping the .osz. */
  blob: Blob;
};

/**
 * Visual-only editor view state.
 * NOTE: `scrollSpeed` affects rendering only and is intentionally never exported.
 */
export type ViewState = {
  /** Multiplies pixels-per-millisecond. Pure preview speed; not exported. */
  scrollSpeed: number;
  /** Zoom multiplier on the timeline. */
  zoom: number;
  snapDivisor: SnapDivisor;
};

let idCounter = 0;
/** Small unique id helper for notes / difficulties / timing points. */
export function uid(prefix = "id"): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export const DEFAULT_SONG_META: SongMeta = {
  title: "Untitled",
  artist: "Unknown Artist",
  creator: "Mapper",
};

export function makeDifficulty(name = "Normal", keyCount = 4): Difficulty {
  return {
    id: uid("diff"),
    name,
    keyCount,
    hpDrainRate: 7,
    overallDifficulty: 7,
    previewTime: -1,
    timingPoints: defaultTimingPoints(),
    notes: [],
  };
}

export function defaultTimingPoints(): TimingPoint[] {
  return [{ id: uid("tp"), time: 0, bpm: 120 }];
}

export const DEFAULT_VIEW: ViewState = {
  scrollSpeed: 1,
  zoom: 1,
  snapDivisor: 4,
};

/**
 * Whether an uploaded background applies to every difficulty in the set or
 * only the current one.
 */
export type BackgroundScope = "mapset" | "difficulty";

/** Website/editor preferences (not part of the beatmap). */
export type AppSettings = {
  /** Multiplies waveform amplitude in the bottom timeline. 0.5 .. 3. */
  waveformSensitivity: number;
};

/**
 * One mania column's skin assets, resolved to object URLs / CSS colours.
 * Any field may be null when the skin doesn't specify it for that column.
 */
export type ManiaColumnSkin = {
  /** Lane / fallback note colour, from `ColourN` in skin.ini. */
  colour: string | null;
  /** Tap note sprite (`NoteImage{col}`). */
  noteUrl: string | null;
  /** Hold note head (`NoteImage{col}H`). */
  holdHeadUrl: string | null;
  /** Hold note body (`NoteImage{col}L`), drawn stretched between caps. */
  holdBodyUrl: string | null;
  /** Hold note tail (`NoteImage{col}T`). */
  holdTailUrl: string | null;
};

/** The skin assets for a single keymode (e.g. 4K, 7K). */
export type ManiaKeymodeSkin = {
  keys: number;
  columns: ManiaColumnSkin[];
};

/**
 * A parsed, in-memory osu! skin (`.osk`). The raw `blob` is kept so the skin
 * can be persisted and re-imported; `objectUrls` tracks every URL created for
 * the resolved images so they can be revoked when the skin is replaced.
 */
export type LoadedSkin = {
  name: string;
  author: string;
  /** Original `.osk` file name. */
  fileName: string;
  /** Raw `.osk` bytes, for persistence. */
  blob: Blob;
  /** Mania skin assets keyed by key count. */
  keymodes: Record<number, ManiaKeymodeSkin>;
  /** Every object URL created for this skin, for later revocation. */
  objectUrls: string[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  waveformSensitivity: 1,
};

export const MIN_KEYS = 1;
export const MAX_KEYS = 18;
