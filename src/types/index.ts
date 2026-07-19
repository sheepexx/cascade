export type ManiaNote = {
  id: string;
  column: number;
  startTime: number;
  endTime?: number;
  hitSound?: number;
  sampleSet?: number;
  additionSet?: number;
  sampleIndex?: number;
  sampleVolume?: number;
  sampleFile?: string;
};

export const HITSOUND_WHISTLE = 2;
export const HITSOUND_FINISH = 4;
export const HITSOUND_CLAP = 8;

export const SAMPLE_SET_NAMES = ["auto", "normal", "soft", "drum"] as const;

export type SnapDivisor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12 | 16;

export const SNAP_DIVISORS: SnapDivisor[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16,
];

export type TimingPoint = {
  id: string;
  time: number;
  uninherited: boolean;
  bpm: number;
  sv: number;
  meter: number;
  sampleSet: number;
  sampleIndex: number;
  volume: number;
  kiai: boolean;
  omitFirstBarline: boolean;
};

export const MIN_SV = 0.01;
export const MAX_SV = 10;

export function svToBeatLength(sv: number): number {
  return -100 / clampSv(sv);
}

export function beatLengthToSv(beatLength: number): number {
  if (!(beatLength < 0)) return 1;
  return clampSv(-100 / beatLength);
}

export function clampSv(sv: number): number {
  if (!Number.isFinite(sv)) return 1;
  return Math.max(MIN_SV, Math.min(MAX_SV, sv));
}

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

export function normalizeTimingPoint(p: Partial<TimingPoint>): TimingPoint {
  return {
    ...TIMING_DEFAULTS,
    id: p.id ?? uid("tp"),
    time: Math.round(p.time ?? 0),
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

export function normalizeTimingPoints(points: Partial<TimingPoint>[]): TimingPoint[] {
  return points.map(normalizeTimingPoint);
}

export type SongMeta = {
  title: string;
  artist: string;
  creator: string;
  tags?: string;
  /**
   * Original-script metadata. Kept separate from the romanised title/artist so
   * a round-trip through Cascade doesn't overwrite it — osu! stores both.
   */
  titleUnicode?: string;
  artistUnicode?: string;
  /**
   * Identifies the uploaded beatmapset. Preserved so an exported map still
   * updates the existing submission instead of looking like a brand-new one.
   */
  beatmapSetId?: number;
};

export type SmMeta = {
  subtitle?: string;
  titleTranslit?: string;
  subtitleTranslit?: string;
  artistTranslit?: string;
  genre?: string;
  displayBpm?: string;
  selectable?: "YES" | "NO";
  sampleLength?: number;
  listnotes?: string;
};

export type Difficulty = {
  id: string;
  sourceFormat?: "osu" | "sm";
  smMeta?: SmMeta;
  name: string;
  audioFilename?: string;
  /**
   * Playback rate this difficulty's timing is written against, relative to the
   * source audio file. All times on this difficulty live in "map time"
   * (audioMs / audioRate); the editor plays the shared audio file this much
   * faster so notes stay in sync. Undefined or 1 means unchanged.
   */
  audioRate?: number;
  /**
   * Time-stretch the audio instead of resampling it, so the rate change keeps
   * the original pitch. Undefined/false matches osu!'s DT/HT, where pitch
   * shifts with speed.
   */
  preservePitch?: boolean;
  backgroundFilename?: string;
  videoFilename?: string;
  videoOffsetMs?: number;
  keyCount: number;
  hpDrainRate: number;
  overallDifficulty: number;
  /** Identifies this difficulty within an uploaded set; 0 when unsubmitted. */
  beatmapId?: number;
  /** [General] SampleSet — the difficulty's default hitsound bank. */
  sampleSet?: string;
  previewTime: number;
  bookmarks?: number[];
  /** Cascade-only labels keyed by the rounded bookmark timestamp. */
  bookmarkLabels?: Record<string, string>;
  trimStartMs?: number;
  trimEndMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  timingPoints: TimingPoint[];
  notes: ManiaNote[];
};

export type LoadedFile = {
  name: string;
  url: string;
  blob: Blob;
};

export const MIN_SCROLL_SPEED = 10;
export const MAX_SCROLL_SPEED = 45;

export type ViewState = {
  scrollSpeed: number;
  snapDivisor: SnapDivisor;
};

let idCounter = 0;
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
  scrollSpeed: 25,
  snapDivisor: 4,
};

export type BackgroundScope = "mapset" | "difficulty";

export type HitsoundSet = "normal" | "soft" | "drum";

export const HITSOUND_SETS: HitsoundSet[] = ["normal", "soft", "drum"];

export type HitsoundSkinSource = "visual" | "default" | "selected";

export type PlaytestOffsetMode = "visual" | "audio";

export type PlaytestSettings = {
  scrollSpeed: number;
  zoom: number;
  rate: number;
  backgroundDim: number;
  offsetMode: PlaytestOffsetMode;
  offsetMs: number;
  hitPositionOffset: number;
  showJudgements: boolean;
  showCombo: boolean;
  showAccuracy: boolean;
  showHitError: boolean;
  showErrorBar: boolean;
  useSkinComboFont: boolean;
  useSkinJudgements: boolean;
  keybinds: Record<number, string[]>;
  quickRestartKey: string;
};

export type AppSettings = {
  waveformSensitivity: number;
  playfieldScale: number;
  longNoteBodyScale: number;
  hitsoundsEnabled: boolean;
  hitsoundSet: HitsoundSet;
  hitsoundVolume: number;
  dimBackground: number;
  smoothScrolling: boolean;
  showWaveform: boolean;
  showTimingLines: boolean;
  upscroll: boolean;
  svPreviewPlayback: boolean;
  bpmAffectsScroll: boolean;
  localAutosaveEnabled: boolean;
  exportPngBackgroundsAsJpeg: boolean;
  exportJpegQuality: number;
  uiSoundsEnabled: boolean;
  uiSoundVolume: number;
  playtest: PlaytestSettings;
  /** Rebindable editor shortcuts (KeyboardEvent.code per action); defaults
   * are filled in by normalizeEditorKeybinds at load time. */
  editorKeybinds: Record<string, string>;
};

export type ManiaColumnSkin = {
  colour: string | null;
  noteUrl: string | null;
  holdHeadUrl: string | null;
  holdBodyUrl: string | null;
  holdBodyCapPx: number | null;
  holdTailUrl: string | null;
  keyUrl: string | null;
  keyDownUrl: string | null;
};

export type ManiaKeymodeSkin = {
  keys: number;
  columns: ManiaColumnSkin[];
};

export type SkinJudgementAsset = "max" | "300" | "200" | "100" | "50" | "miss";

export type SkinUiAssets = {
  comboNumbers: Partial<Record<string, string>>;
  judgementImages: Partial<Record<SkinJudgementAsset, string>>;
};

export type LoadedSkin = {
  name: string;
  author: string;
  fileName: string;
  blob: Blob;
  keymodes: Record<number, ManiaKeymodeSkin>;
  hitsounds: Record<string, Blob>;
  ui: SkinUiAssets;
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
  showWaveform: false,
  showTimingLines: true,
  upscroll: false,
  svPreviewPlayback: true,
  bpmAffectsScroll: true,
  localAutosaveEnabled: true,
  exportPngBackgroundsAsJpeg: true,
  exportJpegQuality: 0.9,
  uiSoundsEnabled: true,
  uiSoundVolume: 1,
  playtest: {
    scrollSpeed: 35,
    zoom: 1.5,
    rate: 1,
    backgroundDim: 82,
    offsetMode: "visual",
    offsetMs: 0,
    hitPositionOffset: 0,
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
  editorKeybinds: {},
};

export const MIN_KEYS = 1;
export const MAX_KEYS = 18;
