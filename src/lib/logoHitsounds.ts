import { effectiveAudioPower } from "./audioAtmosphere";

/**
 * The main-menu logo's hover sounds, after osu!lazer's OsuLogo: a beat is
 * caught LOGO_SAMPLE_EARLY_MS ahead and its sample scheduled on the audio
 * clock for the beat itself, with a stronger sound on each bar line and a
 * little pitch variance on the rest. Uses the stock hitsounds, never a skin's.
 */
export const LOGO_SAMPLE_EARLY_MS = 60;

const BEAT_SAMPLE = "normal-hitnormal";
const DOWNBEAT_SAMPLE = "normal-hitfinish";
const DOWNBEAT_FINISH_GAIN = 0.45;
const BEAT_PITCH_VARIANCE = 0.08;

const sampleUrl = (name: string) =>
  `${import.meta.env.BASE_URL}hitsounds/${name}.wav`;

export class LogoHitsounds {
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private requested = false;

  private context(): AudioContext | null {
    if (typeof window === "undefined" || !window.AudioContext) return null;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Fetches and decodes both samples once; later calls do nothing. */
  preload(): void {
    if (this.requested) return;
    const ctx = this.context();
    if (!ctx) return;
    this.requested = true;
    for (const name of [BEAT_SAMPLE, DOWNBEAT_SAMPLE]) {
      void fetch(sampleUrl(name))
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          this.buffers.set(name, buffer);
        })
        .catch(() => {
          // A missing sample just leaves the logo quiet.
        });
    }
  }

  /**
   * @param delayMs How far ahead the audible beat is.
   * @param volume  Effects × master, 0..1, mixed like the editor's hitsounds.
   */
  play(downbeat: boolean, delayMs: number, volume: number): void {
    if (volume <= 0) return;
    const ctx = this.context();
    const beat = this.buffers.get(BEAT_SAMPLE);
    if (!ctx || !beat) return;
    // Output latency delays these as much as the music, which is already
    // read at its audible position, so start early by the same amount.
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    const when = ctx.currentTime + Math.max(0, delayMs / 1000 - latency);
    const gain = effectiveAudioPower(volume, false);
    const rate = downbeat
      ? 1
      : 1 - BEAT_PITCH_VARIANCE / 2 + Math.random() * BEAT_PITCH_VARIANCE;
    this.voice(ctx, beat, when, gain, rate);
    const finish = this.buffers.get(DOWNBEAT_SAMPLE);
    if (downbeat && finish)
      this.voice(ctx, finish, when, gain * DOWNBEAT_FINISH_GAIN, 1);
  }

  private voice(
    ctx: AudioContext,
    buffer: AudioBuffer,
    when: number,
    gain: number,
    rate: number,
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = ctx.createGain();
    level.gain.value = gain;
    source.connect(level).connect(ctx.destination);
    source.start(when);
  }
}
