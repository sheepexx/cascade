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
 * to its half.
 *
 * The offset (beat phase) is chosen on a *low-passed* copy of the onsets when
 * the track has any low end: the musical downbeat almost always carries the
 * kick/bass, while louder hats or claps often sit on off-beat subdivisions.
 * Without the bass weighting those tracks time to a 1/4 line. The offset is
 * then shifted forward to the first audible onset so the red line lands where
 * the music starts.
 *
 * Everything works in *audio file time*; callers dealing with rate-changed
 * difficulties convert through their time scale.
 */

const HOP = 512;
const WIN = 1024;
const MIN_BPM = 60;
const MAX_BPM = 240;
/** Fine enough to avoid visible drift from common fractional tempos. */
const BPM_STEP = 0.1;
/** Comb phase search granularity, in envelope frames (~5.8 ms at 44.1 kHz). */
const PHASE_STEP = 0.5;
/** A faster tempo must beat the reigning candidate by this factor to win. */
const FASTER_MARGIN = 1.05;
/** Only remove tiny numerical noise; legitimate decimal BPMs must survive. */
const INTEGER_SNAP = 0.035;
/** Boxcar low-pass cutoff for the phase (downbeat) envelope. */
const LP_CUTOFF_HZ = 180;
/** Bass onsets drive the phase only when they carry this share of the mass. */
const BASS_MIN_RATIO = 0.05;
const OFFBEAT_DOUBLE_RATIO = 0.18;
const DOWNBEAT_METER = 4;
const DOWNBEAT_MARGIN = 1.25;

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

/** Half-wave rectified flux of the RMS energy envelope. */
function rmsFluxOnsets(data: Float32Array, frames: number): Float32Array {
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
  const onsets = new Float32Array(frames);
  for (let i = 1; i < frames; i++) {
    onsets[i] = Math.max(0, env[i] - env[i - 1]);
  }
  return onsets;
}

export function detectBpmFromChannel(
  data: Float32Array,
  sampleRate: number,
): BpmDetection | null {
  if (data.length < sampleRate * 4) return null; // need a few seconds

  const frames = Math.floor((data.length - WIN) / HOP) + 1;
  if (frames < 64) return null;

  const onsets = rmsFluxOnsets(data, frames);
  let totalOnset = 0;
  for (let i = 0; i < frames; i++) totalOnset += onsets[i];
  if (totalOnset <= 0) return null;

  const framesPerSec = sampleRate / HOP;

  const sampleAt = (arr: Float32Array, f: number): number => {
    const lo = Math.floor(f);
    if (lo < 0 || lo >= frames) return 0;
    const a = arr[lo];
    const b = lo + 1 < frames ? arr[lo + 1] : 0;
    const t = f - lo;
    return a * (1 - t) + b * t;
  };

  // Onset mass caught by a beat grid at this tempo, at its best phase.
  const comb = (
    bpm: number,
    arr: Float32Array,
  ): { sum: number; score: number; phaseFrames: number } => {
    const beatFrames = (60 / bpm) * framesPerSec;
    let bestSum = 0;
    let bestScore = 0;
    let bestPhase = 0;
    for (let phase = 0; phase < beatFrames; phase += PHASE_STEP) {
      let sum = 0;
      let count = 0;
      for (let f = phase; f < frames; f += beatFrames) {
        sum += sampleAt(arr, f);
        count += 1;
      }
      // Raw mass alone lets an unnecessarily fast subdivision win simply
      // because its shorter period offers more phase choices. Normalizing by
      // sqrt(grid points) still rewards real extra onsets while penalizing
      // empty intermediate beats.
      const score = count > 0 ? sum / Math.sqrt(count) : 0;
      if (score > bestScore) {
        bestSum = sum;
        bestScore = score;
        bestPhase = phase;
      }
    }
    return { sum: bestSum, score: bestScore, phaseFrames: bestPhase };
  };

  // Search fractional BPMs across the full range. The old integer-only scan
  // could miss the real peak entirely and select a rational alias such as
  // 3/4 of the tempo. Only compare local peaks when choosing the beat level;
  // otherwise the margin would pin the result to the rising edge of a peak.
  const candidateCount = Math.round((MAX_BPM - MIN_BPM) / BPM_STEP) + 1;
  const sums = new Float32Array(candidateCount);
  let sumTotal = 0;
  for (let i = 0; i < candidateCount; i++) {
    const b = MIN_BPM + i * BPM_STEP;
    const s = comb(b, onsets).score;
    sums[i] = s;
    sumTotal += s;
  }

  const peaks: number[] = [];
  for (let i = 0; i < sums.length; i++) {
    const left = i > 0 ? sums[i - 1] : -Infinity;
    const right = i + 1 < sums.length ? sums[i + 1] : -Infinity;
    if (sums[i] >= left && sums[i] >= right && (sums[i] > left || sums[i] > right))
      peaks.push(i);
  }
  if (!peaks.length) return null;

  // Peaks ascend by BPM, so a faster beat level has to add meaningful onset
  // evidence. Near-tied subdivisions keep the slower, steadier interpretation.
  let bestIndex = peaks[0];
  let bestSum = sums[bestIndex];
  for (const i of peaks.slice(1)) {
    if (sums[i] > bestSum * FASTER_MARGIN) {
      bestIndex = i;
      bestSum = sums[i];
    }
  }
  if (bestSum <= 0) return null;

  // Sub-step parabolic refinement around the selected fractional peak.
  let bpm = MIN_BPM + bestIndex * BPM_STEP;
  if (bestIndex > 0 && bestIndex < sums.length - 1) {
    const s0 = sums[bestIndex - 1];
    const s1 = sums[bestIndex];
    const s2 = sums[bestIndex + 1];
    const denom = s0 - 2 * s1 + s2;
    if (Math.abs(denom) > 1e-9) {
      const shift = (0.5 * (s0 - s2)) / denom;
      if (Math.abs(shift) <= 1) bpm += shift * BPM_STEP;
    }
  }
  const beatLevelSupport = (
    candidateBpm: number,
    arr: Float32Array,
  ): { on: number; off: number } => {
    const beatFrames = (60 / candidateBpm) * framesPerSec;
    const { phaseFrames } = comb(candidateBpm, arr);
    let on = 0;
    let off = 0;
    let count = 0;
    for (let f = phaseFrames; f + beatFrames <= frames; f += beatFrames) {
      on += sampleAt(arr, f);
      off += sampleAt(arr, f + beatFrames / 2);
      count += 1;
    }
    if (count === 0) return { on: 0, off: 0 };
    return { on: on / count, off: off / count };
  };

  while (bpm * 2 <= MAX_BPM) {
    const { on, off } = beatLevelSupport(bpm, onsets);
    if (on <= 0 || off < on * OFFBEAT_DOUBLE_RATIO) break;
    bpm *= 2;
  }

  const rounded = Math.round(bpm);
  if (Math.abs(bpm - rounded) <= INTEGER_SNAP) bpm = rounded;
  else bpm = Math.round(bpm * 1000) / 1000;

  // Phase from the low-passed onsets when the track has low end, so the
  // offset locks to the kick/bass downbeat instead of off-beat hats.
  const box = Math.max(1, Math.round(sampleRate / LP_CUTOFF_HZ));
  const low = new Float32Array(data.length);
  let acc = 0;
  for (let s = 0; s < data.length; s++) {
    acc += data[s];
    if (s >= box) acc -= data[s - box];
    low[s] = acc / box;
  }
  const bassOnsets = rmsFluxOnsets(low, frames);
  let bassTotal = 0;
  for (let f = 0; f < frames; f++) bassTotal += bassOnsets[f];
  const phaseOnsets =
    bassTotal > totalOnset * BASS_MIN_RATIO ? bassOnsets : onsets;

  const { phaseFrames } = comb(bpm, phaseOnsets);
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
  const msToFrame = (ms: number): number =>
    ((ms / 1000) * sampleRate - WIN / 2) / HOP;
  const barMass = (startMs: number): number => {
    let sum = 0;
    for (let ms = startMs; msToFrame(ms) < frames; ms += beatMs * DOWNBEAT_METER) {
      sum += sampleAt(phaseOnsets, msToFrame(ms));
    }
    return sum;
  };
  const barMasses: number[] = [];
  for (let k = 0; k < DOWNBEAT_METER; k++) {
    barMasses.push(barMass(offsetMs + k * beatMs));
  }
  const barTotal = barMasses.reduce((a, b) => a + b, 0);
  let downbeat = 0;
  for (let k = 1; k < DOWNBEAT_METER; k++) {
    if (barMasses[k] > barMasses[downbeat]) downbeat = k;
  }
  const barAverage = barTotal / DOWNBEAT_METER;
  const onDownbeat =
    barAverage > 0 && barMasses[downbeat] > barAverage * DOWNBEAT_MARGIN;
  if (onDownbeat) offsetMs += downbeat * beatMs;

  const step = onDownbeat ? beatMs * DOWNBEAT_METER : beatMs;
  if (firstOnsetMs !== null) {
    offsetMs += step * Math.round((firstOnsetMs - offsetMs) / step);
    while (offsetMs < 0) offsetMs += step;
  }
  offsetMs = Math.round(offsetMs);

  // Contrast against the strongest distinct tempo peak. This deliberately
  // reports low confidence when half/double BPM are genuinely ambiguous,
  // instead of looking confident merely because most candidates scored badly.
  let runnerUp = 0;
  for (const i of peaks) {
    if (Math.abs(i - bestIndex) <= Math.ceil(1 / BPM_STEP)) continue;
    runnerUp = Math.max(runnerUp, sums[i]);
  }
  const mean = sumTotal / sums.length;
  const contrast = bestSum > 0 ? (bestSum - runnerUp) / bestSum : 0;
  const averageContrast = mean > 0 ? (bestSum - mean) / bestSum : 0;
  const confidence = Math.max(
    0,
    Math.min(1, contrast * 0.75 + averageContrast * 0.25),
  );

  return { bpm, offsetMs, confidence };
}
