export type AudioSeekTransition = "instant" | "smooth" | "scrub";

export type AudioSeekRequest = {
  time: number;
  transition: AudioSeekTransition;
};

export type AudioSeekSignal = {
  revision: number;
  transition: AudioSeekTransition;
  /** Accepted, clamped seek target in map time. */
  targetTime: number;
};

/**
 * Consumes a locally-flushed request represented by a React seek signal.
 * Earlier requests are also consumed because React may batch their revisions.
 * `null` means the signal came from another seek surface.
 */
export function consumeLocalSeekSignal(
  requests: readonly AudioSeekRequest[],
  signal: AudioSeekSignal,
): AudioSeekRequest[] | null {
  const index = requests.findIndex(
    (request) =>
      request.transition === signal.transition &&
      Math.abs(request.time - signal.targetTime) < 0.5,
  );
  return index < 0 ? null : requests.slice(index + 1);
}
