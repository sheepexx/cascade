/**
 * Core domain types for the mania editor.
 *
 * Times are stored as integer milliseconds, matching the osu! file format.
 * Columns are 0-indexed from the left (column 0 = leftmost lane).
 *
 * A project is a *mapset*: shared song metadata + a list of difficulties.
 * Timing points and audio live on each difficulty because imported mapsets can
 * contain per-difficulty tempo/offset edits and even different audio files.
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
  /**
   * Hit-sound additions bitmask, matching the osu! file format:
   *   2 = whistle, 4 = finish, 8 = clap. 0 / undefined = no additions.
   * The normal sample of the active sample set always plays regardless.
   */
  hitSound?: number;
  /** Normal-sound sample set: 0 = auto (timing point), 1 = normal, 2 = soft, 3 = drum. */
  sampleSet?: number;
  /** Addition (whistle/finish/clap) sample set: 0 = auto (follows the normal set). */
  additionSet?: number;
  /** Custom sample index. 0 = use the timing point's index. */
  sampleIndex?: number;
  /** Per-note volume, 1..100. 0 = use the timing point's volume. */
  sampleVolume?: number;
  /** Custom sample filename for the normal sound (keysounds). */
  sampleFile?: string;
};

/** Hit-sound addition bit flags (osu! file format). */
export const HITSOUND_WHISTLE = 2;
export const HITSOUND_FINISH = 4;
export const HITSOUND_CLAP = 8;

/** Sample-set index (0..3) -> lowercase folder/file prefix. 0 = auto. */
export const SAMPLE_SET_NAMES = ["auto", "normal", "soft", "drum"] as const;

/** Beat-snap divisor. 4 = 1/4, 8 = 1/8, etc. */
export type SnapDivisor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12 | 16;

export const SNAP_DIVISORS: SnapDivisor[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16,
];

/**
 * A single osu! timing point. Mirrors the file format line:
 *   time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
 *
 * Two flavours share this shape:
 *  - **Red** (`uninherited: true`): defines BPM, meter, the beat grid and - for
 *    the first one - the map offset. `bpm` is authoritative; `sv` is ignored.
 *  - **Green** (`uninherited: false`): an inherited point that defines scroll
 *    velocity (SV), volume, sample set and kiai from its time onward. `sv` is
 *    authoritative; `bpm`/`meter` are ignored (the active red point supplies the
 *    tempo).
 */
export type TimingPoint = {
  id: string;
  /** Start time of this section, in milliseconds. */
  time: number;
  /** true = red (uninherited), false = green (inherited). */
  uninherited: boolean;
  /** Beats per minute. Authoritative for red points. */
  bpm: number;
  /** Scroll-velocity multiplier (1.0 = unchanged). Authoritative for green. */
  sv: number;
  /** Time-signature numerator (beats per bar). Red points. */
  meter: number;
  /** Hit-sample set: 0 = auto, 1 = normal, 2 = soft, 3 = drum. */
  sampleSet: number;
  /** Custom sample index (0 = default). */
  sampleIndex: number;
  /** Hit-sound volume, 0..100. */
  volume: number;
  /** Kiai time active from this point onward (effects bit 1). */
  kiai: boolean;
  /** Omit the first barline (effects bit 3). */
  omitFirstBarline: boolean;
};

/** osu! SV bounds, matching the editor's allowed inherited multipliers. */
export const MIN_SV = 0.01;
export const MAX_SV = 10;

/** SV multiplier -> inherited beatLength (the value stored in the .osu file). */
export function svToBeatLength(sv: number): number {
  return -100 / clampSv(sv);
}

/** Inherited beatLength (negative) -> SV multiplier. */
export function beatLengthToSv(beatLength: number): number {
  if (!(beatLength < 0)) return 1;
  return clampSv(-100 / beatLength);
}

export function clampSv(sv: number): number {
  if (!Number.isFinite(sv)) return 1;
  return Math.max(MIN_SV, Math.min(MAX_SV, sv));
}

/** Default field values shared by both flavours of timing point. */
const TIMING_DEFAULTS = {
  bpm: 120,
  sv: 1,
  meter: 4,
  sampleSet: 1,
  sampleIndex: 0,
  volume: 100,
  kiai: false,
  omitFirstBarline: false,
};

/** A new red (uninherited) timing point. */
export function makeRedPoint(
  time: number,
  bpm = 120,
  extra: Partial<TimingPoint> = {},
): TimingPoint {
  return {
    ...TIMING_DEFAULTS,
    id: uid("tp"),
    time: Math.round(time),
    uninherited: true,
    bpm,
    ...extra,
  };
}

/** A new green (inherited) timing point. */
export function makeGreenPoint(
  time: number,
  sv = 1,
  extra: Partial<TimingPoint> = {},
): TimingPoint {
  return {
    ...TIMING_DEFAULTS,
    id: uid("tp"),
    time: Math.round(time),
    uninherited: false,
    sv: clampSv(sv),
    ...extra,
  };
}

/**
 * Fill in any missing fields on a (possibly legacy `{id,time,bpm}`) timing
 * point so older saves and partial objects become full TimingPoints.
 */
export function normalizeTimingPoint(p: Partial<TimingPoint>): TimingPoint {
  return {
    ...TIMING_DEFAULTS,
    id: p.id ?? uid("tp"),
    time: Math.round(p.time ?? 0),
    // Anything without an explicit `uninherited` flag is a legacy red point.
    uninherited: p.uninherited ?? true,
    bpm: p.bpm ?? TIMING_DEFAULTS.bpm,
    sv: clampSv(p.sv ?? TIMING_DEFAULTS.sv),
    meter: p.meter ?? TIMING_DEFAULTS.meter,
    sampleSet: p.sampleSet ?? TIMING_DEFAULTS.sampleSet,
    sampleIndex: p.sampleIndex ?? TIMING_DEFAULTS.sampleIndex,
    volume: p.volume ?? TIMING_DEFAULTS.volume,
    kiai: p.kiai ?? TIMING_DEFAULTS.kiai,
    omitFirstBarline: p.omitFirstBarline ?? TIMING_DEFAULTS.omitFirstBarline,
  };
}

/** Normalize a whole list (used when loading saves / imports). */
export function normalizeTimingPoints(points: Partial<TimingPoint>[]): TimingPoint[] {
  return points.map(normalizeTimingPoint);
}

/** Song-level metadata, shared by every difficulty in the set. */
export type SongMeta = {
  title: string;
  artist: string;
  creator: string;
  /** Space-separated search tags (osu! `Tags`). Optional / may be empty. */
  tags?: string;
};

/** A single difficulty within the set. */
export type Difficulty = {
  id: string;
  /** Difficulty name -> [Metadata] Version. */
  name: string;
  /**
   * General AudioFilename for this difficulty. osu! beatmap sets may use a
   * different audio file per difficulty, so audio is tracked here (resolved to
   * bytes via the mapset's audio registry) rather than once for the whole set.
   * Undefined falls back to the set's single audio, if any.
   */
  audioFilename?: string;
  /**
   * Background image filename for this difficulty. osu! beatmap sets may use a
   * different background per difficulty, stored in the mapset's bg registry.
   * Undefined means no background for this difficulty.
   */
  backgroundFilename?: string;
  /** 1K .. 18K. Exported as CircleSize. */
  keyCount: number;
  /** HPDrainRate, 0..10. */
  hpDrainRate: number;
  /** OverallDifficulty, 0..10. */
  overallDifficulty: number;
  /** General PreviewTime in milliseconds. -1 means unset. */
  previewTime: number;
  /** Editor bookmarks, in milliseconds, ascending (osu! `[Editor] Bookmarks`). */
  bookmarks?: number[];
  /** Playback region start (ms). Undefined = play from the song start (0). */
  trimStartMs?: number;
  /** Playback region end (ms). Undefined = play to the song end (duration). */
  trimEndMs?: number;
  /** Fade-in length (ms) applied at the region start. Undefined/0 = no fade. */
  fadeInMs?: number;
  /** Fade-out length (ms) applied before the region end. Undefined/0 = no fade. */
  fadeOutMs?: number;
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

/** osu!mania scroll-speed range. The value behaves like osu!mania's: higher
 *  means notes scroll faster (less time on screen). */
export const MIN_SCROLL_SPEED = 10;
export const MAX_SCROLL_SPEED = 45;

/**
 * Visual-only editor view state.
 * NOTE: `scrollSpeed` affects rendering only and is intentionally never exported.
 */
export type ViewState = {
  /**
   * osu!mania scroll speed, an integer in [MIN_SCROLL_SPEED, MAX_SCROLL_SPEED].
   * Controls how fast notes scroll (preview-only); not exported.
   */
  scrollSpeed: number;
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
  return [makeRedPoint(0, 120)];
}

export const DEFAULT_VIEW: ViewState = {
  scrollSpeed: 35,
  snapDivisor: 4,
};

/**
 * Whether an uploaded background applies to every difficulty in the set or
 * only the current one.
 */
export type BackgroundScope = "mapset" | "difficulty";

/**
 * The original osu! hit-sample sets. Played during playback preview when a note
 * crosses the judgement line. "normal" is bright/clicky, "soft" is mellow and
 * "drum" is percussive - matching osu!'s `normal-`, `soft-` and `drum-` samples.
 */
export type HitsoundSet = "normal" | "soft" | "drum";

export const HITSOUND_SETS: HitsoundSet[] = ["normal", "soft", "drum"];

/** Which skin source should provide playback hitsound samples. */
export type HitsoundSkinSource = "visual" | "default" | "selected";

export type PlaytestOffsetMode = "visual" | "audio";

export type PlaytestSettings = {
  /** Local-only gameplay scroll speed. Never exported. */
  scrollSpeed: number;
  /** Local-only playtest playfield zoom. Never exported. */
  zoom: number;
  /** Background dim strength during playtest, 0..100. */
  backgroundDim: number;
  /** Whether offset shifts visuals or input judgement timing. */
  offsetMode: PlaytestOffsetMode;
  /** Local playtest offset in milliseconds. Never exported. */
  offsetMs: number;
  showJudgements: boolean;
  showCombo: boolean;
  showAccuracy: boolean;
  showHitError: boolean;
  /** Show the osu!-style hit-error / unstable-rate (UR) bar. */
  showErrorBar: boolean;
  useSkinComboFont: boolean;
  useSkinJudgements: boolean;
  /** KeyboardEvent.code per keymode, 1K through 18K. */
  keybinds: Record<number, string[]>;
  /** KeyboardEvent.code that instantly restarts the run during playtest. */
  quickRestartKey: string;
};

/** Website/editor preferences (not part of the beatmap). */
export type AppSettings = {
  /** Multiplies waveform amplitude in the bottom timeline. 0.5 .. 3. */
  waveformSensitivity: number;
  /** Multiplies the on-screen playfield size / zoom. 0.5 .. 2. */
  playfieldScale: number;
  /** Width multiplier for the default long-note body. 0.2 .. 1. */
  longNoteBodyScale: number;
  /** Whether hitsounds play while the song is playing. */
  hitsoundsEnabled: boolean;
  /** Which original osu! sample set is played for hitsounds. */
  hitsoundSet: HitsoundSet;
  /** Hitsound volume (perceived slider position, 0..1). */
  hitsoundVolume: number;
  /** How strongly background images are dimmed behind the playfield, 0..100. */
  dimBackground: number;
  /** Ease scrubbing between snap lines (still snaps) instead of jumping. */
  smoothScrolling: boolean;
  /** Flip the playfield so notes scroll upward (upscroll) instead of down. */
  upscroll: boolean;
  /** Whether the full project is automatically saved to IndexedDB. */
  localAutosaveEnabled: boolean;
  /** Whether UI sound effects (clicks, chimes, invites) play. */
  uiSoundsEnabled: boolean;
  /** UI sound effects volume, 0..1 (1 = 100%). */
  uiSoundVolume: number;
  /** Playtest-only settings. Never exported to .osu/.osz. */
  playtest: PlaytestSettings;
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
  /**
   * For a "capped" body sprite (a very tall image with a rounded end baked into
   * its top and a uniform fill below - e.g. osu's 40000px hold bodies), the
   * height in `holdBodyUrl` pixels of that end cap. The renderer draws the cap
   * at native scale at the far end and stretches only the fill below it. Null
   * for ordinary bodies, which are stretched whole.
   */
  holdBodyCapPx: number | null;
  /** Hold note tail (`NoteImage{col}T`). */
  holdTailUrl: string | null;
  /** Receptor in its idle/unpressed state (`KeyImage{col}`). */
  keyUrl: string | null;
  /** Receptor in its pressed/down state (`KeyImage{col}D`). */
  keyDownUrl: string | null;
};

/** The skin assets for a single keymode (e.g. 4K, 7K). */
export type ManiaKeymodeSkin = {
  keys: number;
  columns: ManiaColumnSkin[];
};

export type SkinJudgementAsset = "max" | "300" | "200" | "100" | "50" | "miss";

export type SkinUiAssets = {
  comboNumbers: Partial<Record<string, string>>;
  judgementImages: Partial<Record<SkinJudgementAsset, string>>;
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
  /** Skin-provided hitsound samples, keyed by extensionless lower-case filename. */
  hitsounds: Record<string, Blob>;
  /** Skin combo-number and judgement image assets used by Playtest Mode. */
  ui: SkinUiAssets;
  /** Every object URL created for this skin, for later revocation. */
  objectUrls: string[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  waveformSensitivity: 1,
  playfieldScale: 1.5,
  longNoteBodyScale: 0.75,
  hitsoundsEnabled: true,
  hitsoundSet: "normal",
  hitsoundVolume: 0.18,
  dimBackground: 82,
  smoothScrolling: true,
  upscroll: false,
  localAutosaveEnabled: true,
  uiSoundsEnabled: true,
  uiSoundVolume: 1,
  playtest: {
    scrollSpeed: 35,
    zoom: 1.5,
    backgroundDim: 82,
    offsetMode: "visual",
    offsetMs: 0,
    showJudgements: true,
    showCombo: true,
    showAccuracy: true,
    showHitError: true,
    showErrorBar: true,
    useSkinComboFont: true,
    useSkinJudgements: true,
    keybinds: {},
    quickRestartKey: "Backquote",
  },
};

export const MIN_KEYS = 1;
export const MAX_KEYS = 18;
