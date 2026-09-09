export const CALIBRATION_FIRST_MS = 1000;
export const CALIBRATION_BEAT_MS = 500;
export const CALIBRATION_WARMUP = 4;
export const CALIBRATION_TAPS = 16;
export const CALIBRATION_DURATION_MS = CALIBRATION_FIRST_MS + (CALIBRATION_WARMUP + CALIBRATION_TAPS) * CALIBRATION_BEAT_MS;

export function calibrationTap(timeMs: number): { beat: number; errorMs: number } | null {
  const beat = Math.round((timeMs - CALIBRATION_FIRST_MS) / CALIBRATION_BEAT_MS);
  const errorMs = timeMs - (CALIBRATION_FIRST_MS + beat * CALIBRATION_BEAT_MS);
  if (beat < CALIBRATION_WARMUP || beat >= CALIBRATION_WARMUP + CALIBRATION_TAPS || Math.abs(errorMs) > 200) return null;
  return { beat, errorMs };
}
function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b), m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function calibrationResult(errors: number[]) {
  const valid = errors.filter(n => Number.isFinite(n) && Math.abs(n) <= 200);
  if (valid.length < 8) return null;
  const center = median(valid), mad = median(valid.map(n => Math.abs(n - center)));
  const kept = valid.filter(n => Math.abs(n - center) <= Math.max(12, mad * 3));
  if (kept.length < 8) return null;
  const offsetMs = -Math.round(median(kept));
  const spreadMs = Math.round(Math.sqrt(kept.reduce((sum, n) => sum + (n + offsetMs) ** 2, 0) / kept.length));
  return { offsetMs, spreadMs, kept: kept.length, discarded: errors.length - kept.length, reliable: kept.length >= 12 && spreadMs <= 35 };
}
export function createCalibrationBuffer(): AudioBuffer {
  const sampleRate = 48000;
  const buffer = new AudioBuffer({ length: CALIBRATION_DURATION_MS / 1000 * sampleRate, sampleRate, numberOfChannels: 1 });
  const data = buffer.getChannelData(0);
  for (let beat = 0; beat < CALIBRATION_WARMUP + CALIBRATION_TAPS; beat++) {
    const start = Math.round((CALIBRATION_FIRST_MS + beat * CALIBRATION_BEAT_MS) / 1000 * sampleRate);
    for (let i = 0; i < 2000; i++) data[start + i] = Math.sin(i / sampleRate * 2 * Math.PI * (beat % 4 === 0 ? 1760 : 1100)) * Math.exp(-i / 330) * 0.8;
  }
  return buffer;
}
