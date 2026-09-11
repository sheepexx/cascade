import { effectiveAudioPower } from "./audioAtmosphere";

/**
 * The main-menu logo's hover sounds, after osu!lazer's OsuLogo: a beat is
 * caught LOGO_SAMPLE_EARLY_MS ahead and its sample scheduled on the audio
 * clock for the beat itself.
 *
 * "menu" plays lazer's own logo samples the way lazer does: the downbeat
 * sample on each bar line, the heartbeat on every other beat with a little
 * pitch variance. They come from ppy/osu-resources (Samples/Menu), licensed
 * CC BY-NC 4.0.
 *
 * "skin" plays the equipped skin's hitnormal, adding its hitfinish on bar
 * lines, and falls back to Cascade's stock set for anything the skin lacks.
 */
export const LOGO_SAMPLE_EARLY_MS = 60;

export type LogoSampleSource = "menu" | "skin";

const MENU_BEAT = "sounds/osu-logo-heartbeat.wav";
const MENU_DOWNBEAT = "sounds/osu-logo-downbeat.wav";
const SKIN_BEAT = "normal-hitnormal";
const SKIN_DOWNBEAT = "normal-hitfinish";
const DOWNBEAT_FINISH_GAIN = 0.45;
// lazer's OsuLogo.BeatSampleVariance.
const BEAT_PITCH_VARIANCE = 0.1;

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

type Sample = { key: string; load: () => Promise<ArrayBuffer> };

export class LogoHitsounds {
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Set<string>();
  private source: LogoSampleSource = "menu";
  private skin: Record<string, Blob> | null = null;
  // Bumped whenever the skin changes, so a decode that finishes late for the
  // previous skin is dropped rather than cached under the new one.
  private generation = 0;

  private context(): AudioContext | null {
    if (typeof window === "undefined" || !window.AudioContext) return null;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  configure(source: LogoSampleSource, skin: Record<string, Blob> | null): void {
    if (skin !== this.skin) {
      this.skin = skin;
      this.generation++;
      for (const key of [...this.buffers.keys()])
        if (key.startsWith("skin:")) this.buffers.delete(key);
      for (const key of [...this.loading])
        if (key.startsWith("skin:")) this.loading.delete(key);
    }
    this.source = source;
  }

  private samples(): { beat: Sample; downbeat: Sample } {
    if (this.source === "menu") {
      return { beat: this.file(MENU_BEAT), downbeat: this.file(MENU_DOWNBEAT) };
    }
    return { beat: this.skinSample(SKIN_BEAT), downbeat: this.skinSample(SKIN_DOWNBEAT) };
  }

  private file(path: string): Sample {
    return {
      key: `file:${path}`,
      load: () => fetch(assetUrl(path)).then((response) => response.arrayBuffer()),
    };
  }

  private skinSample(name: string): Sample {
    const blob = this.skin?.[name];
    return blob
      ? { key: `skin:${name}`, load: () => blob.arrayBuffer() }
      : this.file(`hitsounds/${name}.wav`);
  }

  private load(sample: Sample): void {
    if (this.buffers.has(sample.key) || this.loading.has(sample.key)) return;
    const ctx = this.context();
    if (!ctx) return;
    const generation = this.generation;
    this.loading.add(sample.key);
    void sample
      .load()
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        if (generation === this.generation || !sample.key.startsWith("skin:"))
          this.buffers.set(sample.key, buffer);
      })
      .catch(() => {
        // A missing sample just leaves the logo quiet.
      })
      .finally(() => this.loading.delete(sample.key));
  }

  /** Fetches and decodes the current source's samples; cached after that. */
  preload(): void {
    const { beat, downbeat } = this.samples();
    this.load(beat);
    this.load(downbeat);
  }

  /**
   * @param delayMs How far ahead the audible beat is.
   * @param volume  Effects × master, 0..1, mixed like the editor's hitsounds.
   */
  play(downbeat: boolean, delayMs: number, volume: number): void {
    if (volume <= 0) return;
    const ctx = this.context();
    if (!ctx) return;
    const samples = this.samples();
    // Output latency delays these as much as the music, which is already
    // read at its audible position, so start early by the same amount.
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    const when = ctx.currentTime + Math.max(0, delayMs / 1000 - latency);
    const gain = effectiveAudioPower(volume, false);
    const variedRate = () =>
      1 - BEAT_PITCH_VARIANCE / 2 + Math.random() * BEAT_PITCH_VARIANCE;

    if (this.source === "menu") {
      // One sample or the other, exactly as lazer does.
      const sample = downbeat ? samples.downbeat : samples.beat;
      const buffer = this.buffers.get(sample.key);
      if (!buffer) return this.preload();
      this.voice(ctx, buffer, when, gain, downbeat ? 1 : variedRate());
      return;
    }

    const beat = this.buffers.get(samples.beat.key);
    if (!beat) return this.preload();
    this.voice(ctx, beat, when, gain, downbeat ? 1 : variedRate());
    const finish = this.buffers.get(samples.downbeat.key);
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
