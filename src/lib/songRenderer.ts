// Plays a decoded song for the voice in timeStretchWorklet, either resampled
// the way AudioBufferSourceNode plays it (pitch follows speed) or through
// LiveTimeStretch (pitch kept), switching between the two at the exact block
// the rate crosses `stretchBelow`.
//
// Both ways are driven by one position, the playback model the playhead is
// drawn from, so a switch needs no handover: whichever way takes over starts
// on the very sample the other is playing and they crossfade in step. Two
// separate audio nodes could only ever guess at each other's start, and the
// few samples they disagree by made the crossfade cancel itself out.
import { LiveTimeStretch, cubicSample, type StretchSong } from "./liveTimeStretch";

/**
 * Crossfade between resampled and stretched playback. The two start on the
 * same sample, so it can be this short without a click; any longer, and on a
 * switch made partway into a speed ramp the resampled side has already
 * drifted off pitch enough to beat against the stretched one.
 */
const FADE_SECONDS = 0.005;
/**
 * Share of the speed resampled playback runs off by while it closes the gap
 * a stretch leaves it (at most a few ms). 0.2% is a few cents, well below
 * hearing, and settles 5ms in about 2.5s.
 */
const SETTLE_SHARE = 0.002;
/** Song samples below which a position from the model counts as no move. */
const MOVE_EPSILON = 1e-3;
/** Rate difference that is only rounding. */
const RATE_EPSILON = 1e-9;

export class SongRenderer {
  /** Effective rate below which the pitch is kept. */
  stretchBelow: number;
  private readonly song: StretchSong;
  private readonly length: number;
  private readonly outputRate: number;
  /** Song samples per output sample at 1x. */
  private readonly ratio: number;
  private readonly fadeLength: number;
  /** Song sample the playback model is at for the next output sample. */
  private ref: number;
  /** How far ahead of `ref` resampled playback reads, in song samples. */
  private plainOffset = 0;
  private started = false;
  private stretching = false;
  /** The stretch while it plays, or while it fades out. */
  private stretch: LiveTimeStretch | null = null;
  private fadeLeft = 0;
  private scratch: Float32Array[] = [];

  constructor(
    song: StretchSong,
    outputRate: number,
    startSeconds: number,
    stretchBelow: number,
  ) {
    this.song = song;
    this.length = song.channels[0]?.length ?? 0;
    this.outputRate = outputRate;
    this.ratio = song.sampleRate / outputRate;
    this.fadeLength = Math.max(1, Math.round(outputRate * FADE_SECONDS));
    // A whole sample, so 1x copies the song instead of interpolating it.
    this.ref = Math.round(Math.max(0, startSeconds) * song.sampleRate);
    this.stretchBelow = stretchBelow;
  }

  /** Song seconds the playback model is at. */
  get position(): number {
    return this.ref / this.song.sampleRate;
  }

  get ended(): boolean {
    return this.ref >= this.length;
  }

  get stretched(): boolean {
    return this.stretching;
  }

  /**
   * Writes output samples `from` up to `to`, the song moving at `rate`.
   * `position`, in song seconds, is where the block should start; given every
   * block, it keeps the song exactly on a playback model kept elsewhere.
   */
  render(
    outputs: Float32Array[],
    from: number,
    to: number,
    rate: number,
    position?: number,
  ): void {
    if (position !== undefined && this.started) this.moveTo(position);
    let r = Number.isFinite(rate) && rate > 0 ? rate : 0;
    // A rate worked out from the model comes back a hair off 1x, which would
    // keep the stretch on at full speed and the samples interpolated.
    if (Math.abs(r - 1) < RATE_EPSILON) r = 1;
    const step = r * this.ratio;
    const want = r < this.stretchBelow - RATE_EPSILON;
    if (!this.started) {
      this.started = true;
      if (want) this.beginStretch(false);
    } else if (want !== this.stretching && this.fadeLeft <= 0) {
      if (want) this.beginStretch(true);
      else this.endStretch();
    }
    if (from >= to) return;

    if (this.fadeLeft > 0) {
      const outgoing = this.scratchFor(outputs.length, to);
      if (this.stretching) {
        this.renderPlain(outgoing, from, to, step);
        this.stretch?.render(outputs, from, to, r);
      } else {
        this.stretch?.render(outgoing, from, to, r);
        this.renderPlain(outputs, from, to, step);
      }
      const done = this.fadeLength - this.fadeLeft;
      for (let ch = 0; ch < outputs.length; ch++) {
        const out = outputs[ch];
        const old = outgoing[ch];
        for (let i = from; i < to; i++) {
          const g = Math.min(1, (done + i - from + 1) / this.fadeLength);
          out[i] = out[i] * g + old[i] * (1 - g);
        }
      }
      this.fadeLeft -= to - from;
      if (this.fadeLeft <= 0 && !this.stretching) this.stretch = null;
    } else if (this.stretching && this.stretch) {
      this.stretch.render(outputs, from, to, r);
    } else {
      this.renderPlain(outputs, from, to, step);
    }
    this.ref += (to - from) * step;
  }

  private moveTo(seconds: number): void {
    const target = seconds * this.song.sampleRate;
    const jump = target - this.ref;
    // Rounding noise from recomputing the model each block, not a move.
    if (!(Math.abs(jump) > MOVE_EPSILON)) return;
    this.ref = target;
    // Resampled playback reads on from where it was and closes the gap at its
    // settling pace instead of clicking; the stretch re-centres its grains.
    this.plainOffset -= jump;
    this.stretch?.setPosition(seconds);
  }

  private beginStretch(fade: boolean): void {
    const rate = this.song.sampleRate;
    this.stretch = new LiveTimeStretch(
      this.song,
      this.outputRate,
      this.ref / rate,
      // Line the grains up with what is playing, so the crossfade is in step.
      fade ? (this.ref + this.plainOffset) / rate : undefined,
    );
    this.stretching = true;
    this.fadeLeft = fade ? this.fadeLength : 0;
  }

  private endStretch(): void {
    // Pick up where the stretch really is, which can be a few ms off the
    // model, then let renderPlain close that gap unheard.
    if (this.stretch) {
      this.plainOffset = this.stretch.contentPosition * this.song.sampleRate - this.ref;
    }
    this.stretching = false;
    this.fadeLeft = this.fadeLength;
  }

  private renderPlain(outputs: Float32Array[], from: number, to: number, step: number): void {
    const channels = this.song.channels;
    const last = Math.min(channels.length, outputs.length) - 1;
    const length = this.length;
    const settle = SETTLE_SHARE * step;
    // At 1x, settle onto a whole sample so the song is copied rather than
    // interpolated, which would soften its top end for as long as it played.
    const target = step === 1 ? Math.round(this.ref) - this.ref : 0;
    let offset = this.plainOffset;
    let p = this.ref + offset;
    for (let i = from; i < to; i++) {
      for (let ch = 0; ch < outputs.length; ch++) {
        outputs[ch][i] =
          ch <= last ? cubicSample(channels[ch], p, length) : last >= 0 ? outputs[last][i] : 0;
      }
      const gap = offset - target;
      if (gap === 0) {
        p += step;
      } else {
        const fix = gap > 0 ? Math.min(gap, settle) : Math.max(gap, -settle);
        offset -= fix;
        p += step - fix;
      }
    }
    this.plainOffset = offset;
  }

  private scratchFor(channels: number, frames: number): Float32Array[] {
    if (this.scratch.length !== channels || (this.scratch[0]?.length ?? 0) < frames) {
      this.scratch = Array.from({ length: channels }, () => new Float32Array(frames));
    }
    return this.scratch;
  }
}
