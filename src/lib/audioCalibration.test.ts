import { describe, expect, it } from "vitest";
import { calibrationResult, calibrationTap } from "./audioCalibration";
import { encodeNativePcm } from "./nativeAudio";

describe("audio calibration", () => {
  it("ignores warm-up and distant taps", () => {
    expect(calibrationTap(2000)).toBeNull(); expect(calibrationTap(3250)).toBeNull();
    expect(calibrationTap(3035)).toEqual({ beat: 4, errorMs: 35 });
  });
  it("uses the correct negative compensation for late taps, excluding outliers", () => {
    const result = calibrationResult([...Array.from({ length: 14 }, (_, i) => 30 + i % 3), -180, 180])!;
    expect(result.offsetMs).toBe(-31); expect(result.discarded).toBe(2); expect(result.reliable).toBe(true);
  });
  it("refuses too few or inconsistent taps", () => {
    expect(calibrationResult([1, 2, 3])).toBeNull();
    expect(calibrationResult(Array.from({ length: 16 }, (_, i) => i % 2 ? 90 : -90))?.reliable).toBe(false);
  });
  it("encodes mono PCM as stereo with an exact binary header", () => {
    const pcm = encodeNativePcm({ length: 2, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array([0.5, -0.5]) } as unknown as AudioBuffer, 42, 0.25);
    expect(new DataView(pcm.buffer).getUint32(0, true)).toBe(42);
    expect([...new Float32Array(pcm.buffer, 16)]).toEqual([0.5, 0.5, -0.5, -0.5]);
  });
});
