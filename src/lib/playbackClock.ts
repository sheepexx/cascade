// Smooths a coarse playback clock into a per-frame one.
//
// Both audio backends report position in steps rather than continuously: the
// Web Audio context advances one render quantum at a time, and
// HTMLMediaElement.currentTime is coarser still, often holding the same value
// for tens of milliseconds. Read once per frame at 144Hz that means most
// frames get an identical timestamp and then one jumps, which the notefield
// renders as stutter.
//
// The clock anchors on the last reported position and extrapolates with
// performance.now() between updates, easing toward the real value whenever it
// moves so it can never drift away from the audio.

export type PlaybackClock = {
  /**
   * @param source Raw position from the backend, in seconds.
   * @param rate   Playback rate the source advances at (1 = realtime).
   * @param now    performance.now(), in ms.
   */
  read(source: number, rate: number, now: number): number;
  /** Drop the anchor; call on seek, play, pause and rate changes. */
  reset(): void;
};

/** Past this much disagreement we assume a seek rather than clock coarseness. */
const RESYNC_SECONDS = 0.5;
/** How hard each update pulls the extrapolation back toward the truth. */
const BLEND = 0.3;

export function latencyCompensatedPosition(
  sourceSeconds: number,
  outputLatencySeconds: number,
  rate: number,
  minimumSeconds = 0,
): number {
  const safeLatency =
    Number.isFinite(outputLatencySeconds) && outputLatencySeconds > 0
      ? outputLatencySeconds
      : 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return Math.max(
    minimumSeconds,
    sourceSeconds - safeLatency * safeRate,
  );
}

export function sourcePositionForAudible(
  audibleSeconds: number,
  outputLatencySeconds: number,
  rate: number,
): number {
  const safeLatency =
    Number.isFinite(outputLatencySeconds) && outputLatencySeconds > 0
      ? outputLatencySeconds
      : 0;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return audibleSeconds + safeLatency * safeRate;
}

export function createPlaybackClock(): PlaybackClock {
  let started = false;
  let lastSource = 0;
  let pos = 0;
  let perf = 0;

  return {
    reset() {
      started = false;
    },
    read(source, rate, now) {
      const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
      if (!Number.isFinite(source)) return pos;

      const elapsed = started ? Math.max(0, (now - perf) / 1000) : 0;
      const predicted = pos + elapsed * safeRate;

      // Fresh start, a backward seek, or a jump too large to be clock
      // granularity: snap rather than easing across it.
      if (
        !started ||
        source < lastSource ||
        Math.abs(source - predicted) > RESYNC_SECONDS
      ) {
        started = true;
        lastSource = source;
        pos = source;
        perf = now;
        return source;
      }

      if (source > lastSource) {
        pos = predicted + (source - predicted) * BLEND;
        lastSource = source;
        perf = now;
        return pos;
      }

      // Source has not ticked yet: keep moving on the wall clock.
      return predicted;
    },
  };
}

/** A disagreement past this is a seek or a stall, not a stale reading. */
const STEADY_RESYNC_SECONDS = 0.3;
/** Share of the remaining disagreement the steady clock absorbs per second. */
const STEADY_CATCH_UP_PER_SECOND = 2;
/** The most the steady clock runs fast or slow to catch up, as a share of the rate. */
const STEADY_MAX_SLEW = 0.15;
/**
 * Browsers refresh currentTime every frame or so while playing, so a reading
 * that has not moved for this long means playback itself stopped.
 */
const STEADY_FROZEN_MS = 500;

/**
 * A clock for HTMLMediaElement.currentTime, which browsers refresh once per
 * task. On a busy page each reading is a varying amount stale, and easing
 * toward every one of them, as createPlaybackClock does, shows that staleness
 * as jitter. This clock runs on the wall clock at the element's rate and
 * absorbs any disagreement gradually, never running more than 15% fast or
 * slow, so the playhead keeps an even pace. Only a seek or a stall snaps it.
 */
export function createSteadyClock(): PlaybackClock {
  let started = false;
  let position = 0;
  let lastRead = 0;
  let lastSource = Number.NaN;
  let lastSourceAt = 0;
  let offset = 0;

  const anchor = (source: number, now: number): number => {
    started = true;
    position = source;
    lastRead = now;
    lastSource = source;
    lastSourceAt = now;
    offset = 0;
    return source;
  };

  return {
    reset() {
      started = false;
    },
    read(source, rate, now) {
      if (!Number.isFinite(source)) return position;
      if (!started) return anchor(source, now);
      const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;

      // Advance at the rate playing now, so a rate change never rewrites the
      // time already covered. Readers can arrive out of order; only move on.
      let elapsed = 0;
      if (now > lastRead) {
        elapsed = (now - lastRead) / 1000;
        lastRead = now;
      }

      // Only a reading that has moved says anything new; until the element
      // refreshes it, the same snapshot just keeps getting older.
      if (source !== lastSource) {
        // Moving again after a stop: start from where the element is.
        if (now - lastSourceAt > STEADY_FROZEN_MS) return anchor(source, now);
        position += elapsed * safeRate;
        lastSource = source;
        lastSourceAt = now;
        const error = source - position;
        if (Math.abs(error) > STEADY_RESYNC_SECONDS) return anchor(source, now);
        offset = error;
      } else if (now - lastSourceAt > STEADY_FROZEN_MS) {
        // Playback stopped without saying so; hold rather than run away.
        return position;
      } else {
        position += elapsed * safeRate;
      }

      const limit = STEADY_MAX_SLEW * safeRate * elapsed;
      const step = Math.max(
        -limit,
        Math.min(limit, offset * Math.min(1, elapsed * STEADY_CATCH_UP_PER_SECOND)),
      );
      position += step;
      offset -= step;
      return position;
    },
  };
}
