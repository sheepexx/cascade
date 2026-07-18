/**
 * Onset-based BPM and offset estimation.
 *
 * The audio is reduced to an RMS energy envelope (~86 frames/sec) and onsets
 * are taken as the positive energy flux. Tempo is found by a comb search: for
 * each candidate BPM, lay a beat grid over the onset envelope at its best
 * phase and sum the onset mass it catches, sampling with interpolation so
 * non-integer beat periods are not penalized. Doubling a tempo can never lose
 * mass, so a faster candidate only wins when its extra grid points land on
 * real onsets by a clear margin — that keeps the beat level from collapsing
 * to its half. The offset is the winning comb phase, shifted forward to the
 * first audible onset so the red line lands where the music starts.
 *
 * Everything works in *audio file time*; callers dealing with rate-changed
 * difficulties convert through their time scale.
 */

const HOP = 512;
const WIN = 1024;
const MIN_BPM = 60;
const MAX_BPM = 240;
/** Comb phase search granularity, in envelope frames (~5.8 ms at 44.1 kHz). */
const PHASE_STEP = 0.5;
/** A faster tempo must beat the reigning candidate by this factor to win. */
const FASTER_MARGIN = 1.05;
/** Detected tempi this close to an integer snap to it (real songs mostly are). */
const INTEGER_SNAP = 0.25;

export type BpmDetection = {
  bpm: number;
  /** First-beat offset in ms, aligned near the first audible onset. */
  offsetMs: number;
  /** 0..1, how much the winning tempo stood out. Below ~0.3 is a guess. */
  confidence: number;
};

export function detectBpmFromBuffer(buffer: AudioBuffer): BpmDetection | null {
  const channels = buffer.numberOfChannels;
  const first = buffer.getChannelData(0);
  let mono = first;
  if (channels > 1) {
    mono = new Float32Array(first.length);
    mono.set(first);
    for (let c = 1; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i];
    }
    for (let i = 0; i < mono.length; i++) mono[i] /= channels;
  }
  return detectBpmFromChannel(mono, buffer.sampleRate);
}

export function detectBpmFromChannel(
  data: Float32Array,
  sampleRate: number,
): BpmDetection | null {
  if (data.length < sampleRate * 4) return null; // need a few seconds

  // RMS energy envelope.
  const frames = Math.floor((data.length - WIN) / HOP) + 1;
  if (frames < 64) return null;
  const env = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const start = i * HOP;
    let sumSq = 0;
    for (let j = 0; j < WIN; j++) {
      const v = data[start + j];
      sumSq += v * v;
    }
    env[i] = Math.sqrt(sumSq / WIN);
  }

  // Onset strength: half-wave rectified energy flux.
  const onsets = new Float32Array(frames);
  let totalOnset = 0;
  for (let i = 1; i < frames; i++) {
    onsets[i] = Math.max(0, env[i] - env[i - 1]);
    totalOnset += onsets[i];
  }
  if (totalOnset <= 0) return null;

  const framesPerSec = sampleRate / HOP;

  const onsetAt = (f: number): number => {
    const lo = Math.floor(f);
    if (lo < 0 || lo >= frames) return 0;
    const a = onsets[lo];
    const b = lo + 1 < frames ? onsets[lo + 1] : 0;
    const t = f - lo;
    return a * (1 - t) + b * t;
  };

  // Onset mass caught by a beat grid at this tempo, at its best phase.
  const comb = (bpm: number): { sum: number; phaseFrames: number } => {
    const beatFrames = (60 / bpm) * framesPerSec;
    let bestSum = 0;
    let bestPhase = 0;
    for (let phase = 0; phase < beatFrames; phase += PHASE_STEP) {
      let sum = 0;
      for (let f = phase; f < frames; f += beatFrames) sum += onsetAt(f);
      if (sum > bestSum) {
        bestSum = sum;
        bestPhase = phase;
      }
    }
    return { sum: bestSum, phaseFrames: bestPhase };
  };

  // Candidates ascend, so a faster tempo (evaluated later) has to earn its
  // extra grid points; on a near-tie the slower beat level keeps the crown.
  const sums = new Float32Array(MAX_BPM - MIN_BPM + 1);
  let bestBpm = 0;
  let bestSum = 0;
  let sumTotal = 0;
  for (let b = MIN_BPM; b <= MAX_BPM; b++) {
    const s = comb(b).sum;
    sums[b - MIN_BPM] = s;
    sumTotal += s;
    if (s > bestSum * FASTER_MARGIN) {
      bestSum = s;
      bestBpm = b;
    }
  }
  if (bestSum <= 0) return null;

  // Parabolic refinement across neighboring integer candidates.
  let bpm = bestBpm;
  const i = bestBpm - MIN_BPM;
  if (i > 0 && i < sums.length - 1) {
    const s0 = sums[i - 1];
    const s1 = sums[i];
    const s2 = sums[i + 1];
    const denom = s0 - 2 * s1 + s2;
    if (Math.abs(denom) > 1e-9) {
      const shift = (0.5 * (s0 - s2)) / denom;
      if (Math.abs(shift) <= 1) bpm += shift;
    }
  }
  const rounded = Math.round(bpm);
  if (Math.abs(bpm - rounded) <= INTEGER_SNAP) bpm = rounded;
  else bpm = Math.round(bpm * 1000) / 1000;

  const { phaseFrames } = comb(bpm);
  const frameToMs = (frame: number): number =>
    ((frame * HOP + WIN / 2) / sampleRate) * 1000;
  const beatMs = 60000 / bpm;
  let offsetMs = frameToMs(phaseFrames) % beatMs;

  // Advance the offset to the beat nearest the first clear onset, so it sits
  // where the music starts instead of at second zero.
  let peak = 0;
  for (let f = 0; f < frames; f++) if (onsets[f] > peak) peak = onsets[f];
  const threshold = peak * 0.25;
  let firstOnsetMs: number | null = null;
  for (let f = 1; f < frames; f++) {
    if (onsets[f] >= threshold) {
      firstOnsetMs = frameToMs(f);
      break;
    }
  }
  if (firstOnsetMs !== null) {
    offsetMs += beatMs * Math.round((firstOnsetMs - offsetMs) / beatMs);
    while (offsetMs < 0) offsetMs += beatMs;
  }
  offsetMs = Math.round(offsetMs);

  // Contrast of the winner against the average candidate.
  const mean = sumTotal / sums.length;
  const confidence = Math.max(
    0,
    Math.min(1, mean > 0 ? (bestSum - mean) / bestSum : 0),
  );

  return { bpm, offsetMs, confidence };
}
