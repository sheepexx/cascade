// How the playtest turns the audio clock into gameplay time, after osu!'s
// FramedBeatmapClock and Interlude's Song clock.
//
// There is one gameplay clock, and both the playfield and the judge read it.
// The audio offset moves that clock against the music, so notes and their
// hit windows move together and can never drift apart (osu!'s
// OffsetCorrectionClock). Offsets are in real milliseconds, so in song time
// they scale with the playback rate. The input offset is the one exception:
// it moves only where presses land, for players whose input path lags.
//
// Key presses are timed at the moment the browser saw them
// (KeyboardEvent.timeStamp), not when the handler got to run. The main thread
// can be busy for a frame or more; Interlude likewise stamps each input with
// the audio position at the instant it was polled.

export type PlaytestTiming = {
  /** Playback rate of the run, song ms per real ms. */
  rate: number;
  /** Real ms; negative when the music is heard late. */
  audioOffsetMs: number;
  /** Real ms, applied to presses and releases only. */
  inputOffsetMs: number;
};

/** A stamp further back than this is a stale event, not input lag. */
export const MAX_INPUT_LAG_MS = 250;

/** How long a run gives before its first note, like osu!'s gameplay start. */
export const PLAYTEST_LEAD_IN_MS = 2000;

const safeRate = (rate: number) => (Number.isFinite(rate) && rate > 0 ? rate : 1);

/** The song time the playfield draws and misses are judged at. */
export function gameplayTime(audioMs: number, timing: PlaytestTiming): number {
  return audioMs + timing.audioOffsetMs * safeRate(timing.rate);
}

/**
 * The song time a press or release lands on. `audioMs` is the audio clock
 * read at `now`; the event happened `now - eventStamp` real ms earlier.
 */
export function inputTime(
  audioMs: number,
  now: number,
  eventStamp: number | undefined,
  timing: PlaytestTiming,
): number {
  const rate = safeRate(timing.rate);
  const lag =
    eventStamp === undefined || !Number.isFinite(eventStamp)
      ? 0
      : Math.min(MAX_INPUT_LAG_MS, Math.max(0, now - eventStamp));
  return gameplayTime(audioMs, timing) - lag * rate + timing.inputOffsetMs * rate;
}

/**
 * Where a run starting at `startTime` begins playing: at the playhead when the
 * first note is far enough away, otherwise early enough to give the lead-in.
 * Before zero the run counts in over silence.
 */
export function runStartTime(
  startTime: number,
  firstNoteTime: number | null,
  rate: number,
): number {
  if (firstNoteTime === null) return startTime;
  const leadIn = PLAYTEST_LEAD_IN_MS * safeRate(rate);
  return Math.min(startTime, firstNoteTime - leadIn);
}

/**
 * Offsets saved before the single clock, when one number either moved only
 * the notes ("visual") or only the judging ("audio"). An audio-mode value
 * becomes the audio offset, now moving notes too, which is what it was for.
 * A visual-mode value keeps its exact effect: notes move by it, and the input
 * offset takes it back off the judging.
 */
export function migrateLegacyOffsets(
  saved: Record<string, unknown> | null | undefined,
): { audioOffsetMs: number; inputOffsetMs: number } | null {
  if (!saved || typeof saved.audioOffsetMs === "number") return null;
  const legacy = saved.offsetMs;
  if (typeof legacy !== "number" || !Number.isFinite(legacy)) return null;
  return saved.offsetMode === "audio"
    ? { audioOffsetMs: legacy, inputOffsetMs: 0 }
    : { audioOffsetMs: legacy, inputOffsetMs: legacy === 0 ? 0 : -legacy };
}

/** Scroll speed on osu!mania's scale: a note crosses the playfield in 11485 / speed ms. */
export const MIN_PLAYTEST_SCROLL_SPEED = 1;
export const MAX_PLAYTEST_SCROLL_SPEED = 40;
export const MIN_HIT_POSITION = -100;
export const MAX_HIT_POSITION = 250;
export const MAX_OFFSET_MS = 300;

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * The timing fields of saved playtest settings, migrated and kept in range.
 * Spread over the rest; drops the fields the old offset model used.
 */
export function normalizePlaytestTiming<T extends Record<string, unknown>>(
  saved: T,
  defaults: { scrollSpeed: number; audioOffsetMs: number; inputOffsetMs: number; hitPosition: number },
): Omit<T, "offsetMode" | "offsetMs" | "hitPositionOffset"> & {
  scrollSpeed: number;
  audioOffsetMs: number;
  inputOffsetMs: number;
  hitPosition: number;
} {
  const migrated = migrateLegacyOffsets(saved);
  const { offsetMode: _mode, offsetMs: _ms, hitPositionOffset: _hit, ...rest } = saved;
  void _mode;
  void _ms;
  void _hit;
  return {
    ...rest,
    scrollSpeed: clamp(
      finite(saved.scrollSpeed, defaults.scrollSpeed),
      MIN_PLAYTEST_SCROLL_SPEED,
      MAX_PLAYTEST_SCROLL_SPEED,
    ),
    audioOffsetMs: clamp(
      Math.round(migrated?.audioOffsetMs ?? finite(saved.audioOffsetMs, defaults.audioOffsetMs)),
      -MAX_OFFSET_MS,
      MAX_OFFSET_MS,
    ),
    inputOffsetMs: clamp(
      Math.round(migrated?.inputOffsetMs ?? finite(saved.inputOffsetMs, defaults.inputOffsetMs)),
      -MAX_OFFSET_MS,
      MAX_OFFSET_MS,
    ),
    hitPosition: clamp(
      Math.round(finite(saved.hitPosition, defaults.hitPosition)),
      MIN_HIT_POSITION,
      MAX_HIT_POSITION,
    ),
  };
}
