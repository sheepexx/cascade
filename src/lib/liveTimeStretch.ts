// Real-time time stretch for pitch-kept playback, the way osu! does it. osu!
// slows songs down with BASS_FX's tempo stream, which is SoundTouch's WSOLA:
// the song is cut into short sequences played at their own speed, each one
// started wherever it best continues the last and joined to it with a brief
// crossfade. This follows that algorithm with osu!'s own settings (see
// osu-framework's TrackBass), so slowed songs sound the way players know them.
//
// Unlike SoundTouch, which reads its input in order, this reads a decoded
// song at random, so each sequence is centred on where the playback model
// says the song is. What is heard never strays more than about one sequence
// from the position the playhead is drawn from, however long it plays.

export type StretchSong = {
  channels: Float32Array[];
  sampleRate: number;
};

export const STRETCH_STORE_PROCESSOR = "cascade-stretch-store";
export const STRETCH_VOICE_PROCESSOR = "cascade-stretch-voice";

/** osu!'s TempoSequenceMilliseconds: how long each sequence plays. */
const SEQUENCE_SECONDS = 0.03;
/** BASS_FX's default seek window, which osu! leaves alone. */
const SEEK_WINDOW_SECONDS = 0.014;
/** osu!'s TempoOverlapMilliseconds: the crossfade joining two sequences. */
const OVERLAP_SECONDS = 0.004;
/** Coarse step of the search, refined around the best match; SoundTouch's quick seek works the same way. */
const COARSE_STEP = 4;

export class LiveTimeStretch {
  private readonly channels: Float32Array[];
  private readonly length: number;
  private readonly songRate: number;
  /** Song samples per output sample when played at 1x. */
  private readonly ratio: number;
  /** Output samples each sequence contributes: its length less the crossfade. */
  private readonly stride: number;
  private readonly overlap: number;
  /** Candidates either side of the nominal start, in song samples. */
  private readonly reach: number;
  /** The previous sequence's tail per channel, faded out as the next fades in. */
  private readonly tail: Float32Array[];
  private hasTail = false;
  /** Whether a sequence has played yet. */
  private begun = false;
  /** Song sample the current sequence starts at. */
  private sequenceStart = 0;
  /** Output samples of the current sequence already played. */
  private played: number;
  /** Song sample the playback model is at for the next output sample. */
  private pos: number;
  private readonly continueFrom: number | null;

  /**
   * `continueFromSeconds` is where audio already playing has got to, when
   * the stretch takes over from it: the first sequence then joins onto that
   * instead of starting cold, so the two can crossfade without cancelling.
   */
  constructor(
    song: StretchSong,
    outputRate: number,
    startSeconds: number,
    continueFromSeconds?: number,
  ) {
    this.channels = song.channels;
    this.length = song.channels[0]?.length ?? 0;
    this.songRate = song.sampleRate;
    this.ratio = song.sampleRate / outputRate;
    this.overlap = Math.max(8, Math.round(outputRate * OVERLAP_SECONDS));
    const sequence = Math.max(
      this.overlap * 3,
      Math.round(outputRate * SEQUENCE_SECONDS),
    );
    this.stride = sequence - this.overlap;
    this.reach = Math.max(1, Math.round((song.sampleRate * SEEK_WINDOW_SECONDS) / 2));
    this.tail = song.channels.map(() => new Float32Array(this.overlap));
    // Due a new sequence on the first sample.
    this.played = this.stride;
    this.pos = Math.max(0, startSeconds) * song.sampleRate;
    this.continueFrom =
      continueFromSeconds === undefined ? null : continueFromSeconds * song.sampleRate;
  }

  /** Song seconds the next output sample plays, by the playback model. */
  get position(): number {
    return this.pos / this.songRate;
  }

  get ended(): boolean {
    return this.pos >= this.length;
  }

  /**
   * Song seconds the next output sample actually comes from. Within about a
   * sequence of `position`; the same as it at 1x.
   */
  get contentPosition(): number {
    if (!this.begun) return this.position;
    return (this.sequenceStart + this.played * this.ratio) / this.songRate;
  }

  /**
   * Moves the playback position without breaking the sound: the next
   * sequence centres on it and joins onto the last, so a small correction is
   * not heard.
   */
  setPosition(seconds: number): void {
    this.pos = seconds * this.songRate;
  }

  /**
   * Writes output samples `from` up to `to` of each channel, the song moving
   * `rate` seconds per output second while its pitch stays put.
   */
  render(outputs: Float32Array[], from: number, to: number, rate: number): void {
    const step = (Number.isFinite(rate) && rate > 0 ? rate : 0) * this.ratio;
    const channels = this.channels;
    const last = Math.min(channels.length, outputs.length) - 1;
    let i = from;
    while (i < to) {
      if (this.played >= this.stride) this.nextSequence(rate);
      const n = Math.min(to - i, this.stride - this.played);
      for (let ch = 0; ch < outputs.length; ch++) {
        const out = outputs[ch];
        if (ch > last) {
          if (last >= 0) out.set(outputs[last].subarray(i, i + n), i);
          else out.fill(0, i, i + n);
          continue;
        }
        const src = channels[ch];
        const tail = this.tail[ch];
        for (let k = 0; k < n; k++) {
          const at = this.played + k;
          let x = this.read(src, this.sequenceStart + at * this.ratio);
          if (at < this.overlap && this.hasTail) {
            const w = at / this.overlap;
            x = x * w + tail[at] * (1 - w);
          }
          out[i + k] = x;
        }
      }
      this.played += n;
      this.pos += n * step;
      i += n;
    }
  }

  private read(src: Float32Array, p: number): number {
    if (this.ratio === 1 && Number.isInteger(p)) {
      return p >= 0 && p < this.length ? src[p] : 0;
    }
    return cubicSample(src, p, this.length);
  }

  private nextSequence(rate: number): void {
    const ratio = this.ratio;
    // How the sequence just played would have carried on, or the audio this
    // stretch takes over from: the next sequence fades in over it.
    let natural = Number.NaN;
    if (this.begun) natural = this.sequenceStart + this.stride * ratio;
    else if (this.continueFrom !== null) natural = this.continueFrom;
    if (Number.isFinite(natural)) this.fillTail(natural);
    this.begun = true;

    // A sequence is heard from the start of its fade-in to the end of its
    // fade-out tail, so its middle lands (stride + overlap) / 2 output samples
    // in, played at its own speed; start it so that middle is where the model
    // will be by then.
    const middle = (this.stride + this.overlap) / 2;
    const nominal = this.pos + middle * ratio * (rate - 1);
    let start: number;
    if (!Number.isFinite(natural)) start = Math.round(nominal);
    // At 1x the next sequence simply carries on, which rebuilds the song
    // exactly. Whole samples keep it off the interpolating path.
    else if (Math.abs(nominal - natural) < 1) {
      start = ratio === 1 ? Math.round(natural) : natural;
    }
    else start = this.bestStart(Math.round(nominal), natural);
    this.sequenceStart = start;
    this.played = 0;
  }

  private fillTail(from: number): void {
    for (let ch = 0; ch < this.channels.length; ch++) {
      const src = this.channels[ch];
      const tail = this.tail[ch];
      for (let j = 0; j < this.overlap; j++) tail[j] = this.read(src, from + j * this.ratio);
    }
    this.hasTail = true;
  }

  /**
   * The start within the seek window around `center` whose opening best
   * matches the tail it will fade in over. Searched coarsely, then refined
   * around the best, across the first two channels together, and favouring
   * the middle of the window slightly as SoundTouch does, which keeps the
   * timing tight.
   */
  private bestStart(center: number, natural: number): number {
    const reach = this.reach;
    let best = center;
    let bestScore = Number.NEGATIVE_INFINITY;
    const consider = (candidate: number) => {
      const offset = (candidate - center) / reach;
      const score = (this.similarity(candidate) + 0.1) * (1 - 0.25 * offset * offset);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    };
    for (let d = -reach; d <= reach; d += COARSE_STEP) consider(center + d);
    const coarse = best;
    for (let d = -COARSE_STEP + 1; d < COARSE_STEP; d++) {
      const candidate = coarse + d;
      if (d !== 0 && Math.abs(candidate - center) <= reach) consider(candidate);
    }
    // Carrying straight on matches perfectly, so take it when it is in reach.
    const carry = Math.round(natural);
    if (Math.abs(carry - center) <= reach) consider(carry);
    return best;
  }

  /** Normalised correlation of the song at `start` with the tail, 1 being a perfect match. */
  private similarity(start: number): number {
    const n = this.overlap;
    const length = this.length;
    const step = this.ratio;
    let dot = 0;
    let energy = 0;
    let reference = 0;
    const count = Math.min(2, this.channels.length);
    const exact = step === 1 && start >= 0 && start + n <= length;
    for (let ch = 0; ch < count; ch++) {
      const src = this.channels[ch];
      const tail = this.tail[ch];
      if (exact) {
        for (let i = 0; i < n; i++) {
          const x = src[start + i];
          const y = tail[i];
          dot += x * y;
          energy += x * x;
          reference += y * y;
        }
      } else {
        for (let i = 0; i < n; i++) {
          const x = this.read(src, start + i * step);
          const y = tail[i];
          dot += x * y;
          energy += x * x;
          reference += y * y;
        }
      }
    }
    const scale = Math.sqrt(energy * reference);
    return scale > 0 ? dot / scale : 0;
  }
}

/** Catmull-Rom read of `data` at fractional sample `p`, silent outside it. */
export function cubicSample(data: Float32Array, p: number, length: number): number {
  const i = Math.floor(p);
  const t = p - i;
  const y1 = i >= 0 && i < length ? data[i] : 0;
  if (t === 0) return y1;
  const y0 = i - 1 >= 0 && i - 1 < length ? data[i - 1] : 0;
  const y2 = i + 1 >= 0 && i + 1 < length ? data[i + 1] : 0;
  const y3 = i + 2 >= 0 && i + 2 < length ? data[i + 2] : 0;
  return (
    y1 +
    0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0)))
  );
}
