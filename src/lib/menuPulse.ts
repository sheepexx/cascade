/**
 * Motion helpers for the main-menu logo and side flashes.
 *
 * Logo: `AudioPunch` listens to the analyser. Spectral flux (how much the
 * spectrum jumped since last frame, weighted towards the bass where kicks
 * live) is normalised against the song's recent peaks, then followed by a fast
 * attack / slow release envelope. The mapped grid adds a light `beatShape`,
 * and a critically damped spring smooths the final scale.
 *
 * Side flashes: ported from osu!lazer's MenuSideFlashes and the beat maths of
 * its BeatSyncedContainer. A beat is detected FLASH_FADE_IN_MS early and the
 * flash is backdated to the moment that early clock crossed the beat, so its
 * fade-in completes exactly on the audible beat; it then fades out over one
 * beat with an ease-in. Brightness follows the song's per-channel level.
 */

// Byte-frequency bins at the menu's 512-point FFT are ~90 Hz wide, so bins
// 1..5 cover the kick and bass range.
const BASS_FROM = 1;
const BASS_TO = 6;
const BROAD_TO = 96;
// Kicks carry the beat, so the bass range leads the onset.
const BASS_WEIGHT = 0.8;
const BROAD_WEIGHT = 0.2;
// Broadband flux is averaged over many more bins, so it reads much smaller.
const BROAD_GAIN = 3;
const ATTACK_MS = 8;
// Short enough that the logo drops back between hits and each one reads.
const RELEASE_MS = 110;
const PEAK_DECAY_MS = 1500;
const PEAK_FLOOR = 0.02;
const THRESHOLD = 0.1;
const MAX_STEP_MS = 100;

const BEAT_LEAD_MS = 40;
const BEAT_LEAD_SHARE = 0.15;
const BEAT_DECAY_SHARE = 0.3;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

export class AudioPunch {
  private key: string | null | undefined = undefined;
  private prev: Float32Array | null = null;
  private peak = PEAK_FLOOR;
  private envelope = 0;
  private last: number | null = null;

  /** Feeds one analyser frame; returns the punch envelope, 0..1. */
  update(key: string | null, levels: ArrayLike<number> | null, now: number): number {
    if (key !== this.key) {
      this.key = key;
      this.prev = null;
      this.peak = PEAK_FLOOR;
      this.envelope = 0;
    }
    const dt =
      this.last === null ? 16 : Math.max(0, Math.min(MAX_STEP_MS, now - this.last));
    this.last = now;
    const release = Math.exp(-dt / RELEASE_MS);
    if (!levels || levels.length <= BASS_TO) {
      this.prev = null;
      this.envelope *= release;
      return this.envelope;
    }

    const bins = Math.min(levels.length, BROAD_TO);
    const prev = this.prev;
    if (!prev || prev.length !== bins) {
      this.prev = Float32Array.from({ length: bins }, (_, i) => levels[i]);
      this.envelope *= release;
      return this.envelope;
    }

    let bass = 0;
    let broad = 0;
    for (let i = BASS_FROM; i < bins; i++) {
      const rise = (levels[i] - prev[i]) / 255;
      prev[i] = levels[i];
      if (rise <= 0) continue;
      broad += rise;
      if (i < BASS_TO) bass += rise;
    }
    bass /= BASS_TO - BASS_FROM;
    broad /= bins - BASS_FROM;
    const onset = BASS_WEIGHT * bass + BROAD_WEIGHT * Math.min(1, broad * BROAD_GAIN);

    this.peak = Math.max(onset, PEAK_FLOOR, this.peak * Math.exp(-dt / PEAK_DECAY_MS));
    const hit = clamp01((onset / this.peak - THRESHOLD) / (1 - THRESHOLD));
    this.envelope =
      hit > this.envelope
        ? this.envelope + (hit - this.envelope) * (1 - Math.exp(-dt / ATTACK_MS))
        : Math.max(hit, this.envelope * release);
    return this.envelope;
  }
}

/**
 * A soft pulse on the mapped grid: eases up just before the beat, peaks on it
 * and decays over roughly a third of the beat.
 */
export function beatShape(phase: number, length: number): number {
  if (!(length > 0)) return 0;
  const lead = Math.min(BEAT_LEAD_MS, length * BEAT_LEAD_SHARE);
  const untilNext = length - phase;
  const rise = untilNext < lead ? smoothstep(clamp01(1 - untilNext / lead)) : 0;
  const fall = Math.exp(-Math.max(0, phase) / (length * BEAT_DECAY_SHARE));
  return Math.max(rise, fall);
}

/** A red line as the menu needs it. */
export type MenuTimingPoint = {
  time: number;
  bpm: number;
  meter: number;
  omitFirstBarline: boolean;
};

export type MenuBeat = {
  length: number;
  /** Beats since the timing point, bar-aligned; negative before it. */
  index: number;
  /** Milliseconds since the last beat. */
  phase: number;
  meter: number;
  /** Which timing point is in effect; -1 on the idle grid. */
  point: number;
};

/**
 * osu!'s BeatSyncedContainer maths: the timing point in effect at `position`
 * (the first one before any), then floor((t - T) / L) less one when the
 * point omits its first bar line.
 */
export function beatAt(
  points: readonly MenuTimingPoint[],
  position: number,
): MenuBeat | null {
  let current = -1;
  for (let i = 0; i < points.length; i++) {
    if (!(points[i].bpm > 0)) continue;
    if (current === -1 || points[i].time <= position) current = i;
    else break;
  }
  if (current === -1) return null;
  const point = points[current];
  const length = 60000 / point.bpm;
  const beats = Math.floor((position - point.time) / length);
  return {
    length,
    index: beats - (point.omitFirstBarline ? 1 : 0),
    phase: position - point.time - beats * length,
    meter: point.meter > 0 ? point.meter : 4,
    point: current,
  };
}

/** A steady grid on the wall clock for when nothing is playing. */
export function idleBeat(now: number, bpm: number): MenuBeat {
  const length = 60000 / bpm;
  const index = Math.floor(now / length);
  return { length, index, phase: now - index * length, meter: 4, point: -1 };
}

export const FLASH_FADE_IN_MS = 65;
const AMPLITUDE_DEAD_ZONE = 0.25;
const ALPHA_MULTIPLIER = (1 - AMPLITUDE_DEAD_ZONE) / 0.55;
const KIAI_MULTIPLIER = (1 - AMPLITUDE_DEAD_ZONE * 0.95) / 0.8;

/** Kiai alternates sides every beat; otherwise both flash on each bar line. */
export function flashSides(
  index: number,
  meter: number,
  kiai: boolean,
): { left: boolean; right: boolean } {
  if (index < 0) return { left: false, right: false };
  if (kiai) return { left: index % 2 === 0, right: index % 2 === 1 };
  const barLine = index % (meter > 0 ? meter : 4) === 0;
  return { left: barLine, right: barLine };
}

/** Flash strength from that channel's peak level (0..1), osu!'s formula. */
export function flashPeak(amplitude: number, kiai: boolean): number {
  const lifted =
    0.1 +
    (amplitude - AMPLITUDE_DEAD_ZONE) / (kiai ? KIAI_MULTIPLIER : ALPHA_MULTIPLIER);
  return Math.max(0.1, Math.min(1, lifted));
}

/** One side's alpha: linear fade-in over 65 ms, then an ease-in fade-out over a beat. */
export class SideFlash {
  private start = Number.NEGATIVE_INFINITY;
  private from = 0;
  private peak = 0;
  private length = 1;

  /**
   * @param now   Current time; the fade starts from the alpha shown now.
   * @param start When the (early) clock crossed the beat; may be in the past.
   */
  trigger(now: number, start: number, peak: number, beatLength: number): void {
    this.from = this.value(now);
    this.start = start;
    this.peak = peak;
    this.length = Math.max(1, beatLength);
  }

  value(now: number): number {
    const t = now - this.start;
    if (!(t < Number.POSITIVE_INFINITY)) return 0;
    if (t < 0) return this.from;
    if (t < FLASH_FADE_IN_MS)
      return this.from + (this.peak - this.from) * (t / FLASH_FADE_IN_MS);
    const u = (t - FLASH_FADE_IN_MS) / this.length;
    return u >= 1 ? 0 : this.peak * (1 - u * u);
  }
}

/** Critically damped spring: follows its target smoothly without overshoot. */
export class CriticalSpring {
  private velocity = 0;

  constructor(
    private current: number,
    private readonly omega: number,
  ) {}

  step(target: number, dtMs: number): number {
    const dt = Math.max(0, Math.min(MAX_STEP_MS, dtMs)) / 1000;
    const w = this.omega;
    const offset = this.current - target;
    const decay = Math.exp(-w * dt);
    const drift = (this.velocity + w * offset) * dt;
    this.current = target + (offset + drift) * decay;
    this.velocity = (this.velocity - w * drift) * decay;
    return this.current;
  }
}
