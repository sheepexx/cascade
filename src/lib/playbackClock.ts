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
