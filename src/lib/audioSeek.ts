export type AudioSeekTransition = "instant" | "smooth";

export type AudioSeekSignal = {
  revision: number;
  transition: AudioSeekTransition;
  /** Accepted, clamped seek target in map time. */
  targetTime: number;
};
