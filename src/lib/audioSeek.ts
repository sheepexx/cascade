export type AudioSeekTransition = "instant" | "smooth";

export type AudioSeekSignal = {
  revision: number;
  transition: AudioSeekTransition;
};
