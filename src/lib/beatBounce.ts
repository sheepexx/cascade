export const BOUNCE_ROTATION = 8;
export const HOVER_SCALE = 1.2;
export const BOUNCE_COMPRESSION = 0.9;
export const BOUNCE_LIFT = 10;
export const MIN_INTENSITY = 0.12;
export const MAX_INTENSITY = 1.4;

const LEAVE_MS = 500;
const LEAVE_SCALE_MS = 200;
const HOVER_POP_MS = 160;
const MIN_CATCH_UP_MS = 140;

const LEVEL_BINS = 160;
const LEVEL_SMOOTH_MS = 150;
const ANALYSER_MIN_DB = -100;
const ANALYSER_RANGE_DB = 70;
const REFERENCE_DECAY_DB_PER_MS = 6 / 20000;
const REFERENCE_FLOOR_DB = -90;
const QUIET_RANGE_DB = 18;
const HISTORY_MS = 2000;
const SESSION_DECAY_DB_PER_MS = 6 / 300000;
const SESSION_MARGIN_DB = 6;

export type Ease = (t: number) => number;
export const easeOut: Ease = (t) => t * (2 - t);
export const easeIn: Ease = (t) => t * t;
export const easeInOutSine: Ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

type Segment = { to: number; start: number; duration: number; ease: Ease };

class Tween {
  private from: number;
  private segments: Segment[] = [];

  constructor(value: number) {
    this.from = value;
  }

  value(now: number): number {
    let v = this.from;
    for (const s of this.segments) {
      if (now <= s.start) return v;
      const t = s.duration > 0 ? Math.min(1, (now - s.start) / s.duration) : 1;
      if (t < 1) return v + (s.to - v) * s.ease(t);
      v = s.to;
    }
    return v;
  }

  set(now: number, segments: Segment[]): void {
    this.from = this.value(now);
    this.segments = segments;
  }

  done(now: number): boolean {
    const last = this.segments[this.segments.length - 1];
    return !last || now >= last.start + last.duration;
  }
}

const squash = (intensity: number) => HOVER_SCALE * (1 - (1 - BOUNCE_COMPRESSION) * intensity);

export type BounceFrame = { rotate: number; y: number; scaleX: number; scaleY: number };

export class BeatBounce {
  private rotate = new Tween(0);
  private y = new Tween(0);
  private scaleX = new Tween(1);
  private scaleY = new Tween(1);
  private rightward = false;

  hover(now: number, untilNextBeat: number, intensity = 1): void {
    const duration = Math.max(0, untilNextBeat);
    const lean = (this.rightward ? -BOUNCE_ROTATION : BOUNCE_ROTATION) * intensity;
    this.rotate.set(now, [{ to: lean, start: now, duration, ease: easeInOutSine }]);
    this.scaleX.set(now, [{ to: HOVER_SCALE, start: now, duration: Math.min(duration, HOVER_POP_MS), ease: easeOut }]);
    if (duration < MIN_CATCH_UP_MS) {
      this.y.set(now, []);
      this.scaleY.set(now, [{ to: squash(intensity), start: now, duration, ease: easeOut }]);
      return;
    }
    this.jump(now, duration, intensity);
  }

  /**
   * @param now When the beat was noticed. Usually a frame after `start`, but
   * when the clock jumps (music paused or resumed, so the beat grid switches
   * between the song and the idle pulse) the new beat can be well under way.
   * Every tween then starts from where the icon is right now and runs over
   * what is left of the beat, instead of rewinding to its first frame.
   */
  beat(start: number, beatLength: number, intensity = 1, now = start): void {
    const begin = Math.max(start, now);
    const length = Math.max(MIN_CATCH_UP_MS, start + beatLength - begin);
    const swing = (this.rightward ? BOUNCE_ROTATION : -BOUNCE_ROTATION) * intensity;
    this.rotate.set(begin, [{ to: swing, start: begin, duration: length, ease: easeInOutSine }]);
    this.scaleX.set(begin, [{ to: HOVER_SCALE, start: begin, duration: length / 2, ease: easeOut }]);
    this.jump(begin, length, intensity);
    this.rightward = !this.rightward;
  }

  leave(now: number): void {
    this.rotate.set(now, [{ to: 0, start: now, duration: LEAVE_MS, ease: easeOut }]);
    this.y.set(now, [{ to: 0, start: now, duration: LEAVE_MS, ease: easeOut }]);
    this.scaleX.set(now, [{ to: 1, start: now, duration: LEAVE_SCALE_MS, ease: easeOut }]);
    this.scaleY.set(now, [{ to: 1, start: now, duration: LEAVE_SCALE_MS, ease: easeOut }]);
  }

  frame(now: number): BounceFrame {
    return {
      rotate: this.rotate.value(now),
      y: this.y.value(now),
      scaleX: this.scaleX.value(now),
      scaleY: this.scaleY.value(now),
    };
  }

  settled(now: number): boolean {
    return this.rotate.done(now) && this.y.done(now) && this.scaleX.done(now) && this.scaleY.done(now);
  }

  private jump(start: number, length: number, intensity: number): void {
    const half = length / 2;
    this.y.set(start, [
      { to: -BOUNCE_LIFT * intensity, start, duration: half, ease: easeOut },
      { to: 0, start: start + half, duration: half, ease: easeIn },
    ]);
    this.scaleY.set(start, [
      { to: HOVER_SCALE, start, duration: half, ease: easeOut },
      { to: squash(intensity), start: start + half, duration: half, ease: easeIn },
    ]);
  }
}

export class LoudnessTracker {
  private key: string | null | undefined = undefined;
  private level = 0;
  private reference = 0;
  private last = 0;
  private heard = false;
  private times: number[] = [];
  private recent: number[] = [];
  private session = -Infinity;

  update(key: string | null, levels: ArrayLike<number> | null, now: number): void {
    if (key !== this.key) {
      this.key = key;
      this.level = 0;
      this.reference = 0;
      this.heard = false;
      this.last = now;
      this.times = [];
      this.recent = [];
    }
    const dt = Math.max(0, Math.min(250, now - this.last));
    this.last = now;
    if (!levels || levels.length < 2) return;
    const bins = Math.min(levels.length, LEVEL_BINS);
    let power = 0;
    for (let i = 1; i < bins; i++) power += 10 ** ((ANALYSER_MIN_DB + (levels[i] / 255) * ANALYSER_RANGE_DB) / 10);
    const db = 10 * Math.log10(power);
    const from = this.heard ? this.level : REFERENCE_FLOOR_DB;
    this.level = from + (db - from) * (1 - Math.exp(-dt / LEVEL_SMOOTH_MS));
    this.reference = Math.max(
      this.level,
      REFERENCE_FLOOR_DB,
      this.heard ? this.reference - dt * REFERENCE_DECAY_DB_PER_MS : -Infinity,
    );
    this.session = Math.max(this.reference, this.session - dt * SESSION_DECAY_DB_PER_MS);
    this.heard = true;
    this.times.push(now);
    this.recent.push(this.level);
    while (this.times.length && this.times[0] < now - HISTORY_MS) {
      this.times.shift();
      this.recent.shift();
    }
  }

  intensity(now = this.last, windowMs = 500): number {
    if (!this.heard) return 1;
    let peak = this.level;
    for (let i = this.times.length - 1; i >= 0 && this.times[i] >= now - windowMs; i--) peak = Math.max(peak, this.recent[i]);
    const reference = Math.max(this.reference, this.session - SESSION_MARGIN_DB);
    const x = Math.min(1, Math.max(0, 1 + (peak - reference) / QUIET_RANGE_DB));
    return MIN_INTENSITY + (MAX_INTENSITY - MIN_INTENSITY) * x ** 1.5;
  }
}

export function bounceTransform(frame: BounceFrame): string {
  return `translateY(${frame.y.toFixed(2)}px) rotate(${frame.rotate.toFixed(2)}deg) scale(${frame.scaleX.toFixed(3)}, ${frame.scaleY.toFixed(3)})`;
}
