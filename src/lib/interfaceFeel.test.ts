import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOLD_CONFIRM_MS,
  DEFAULT_PARALLAX_STRENGTH,
  MAX_HOLD_CONFIRM_MS,
  MAX_PARALLAX_STRENGTH,
  MIN_HOLD_CONFIRM_MS,
  clampHoldConfirmMs,
  clampParallaxStrength,
  holdConfirmDuration,
  parallaxScale,
  setHoldConfirmMs,
  setParallaxStrength,
} from "./interfaceFeel";

describe("clampHoldConfirmMs", () => {
  it("keeps a sensible time as it is", () => {
    expect(clampHoldConfirmMs(1200)).toBe(1200);
  });

  it("never lets the safeguard be turned off", () => {
    expect(clampHoldConfirmMs(0)).toBe(MIN_HOLD_CONFIRM_MS);
    expect(clampHoldConfirmMs(-500)).toBe(MIN_HOLD_CONFIRM_MS);
  });

  it("caps a hold nobody would sit through", () => {
    expect(clampHoldConfirmMs(99_000)).toBe(MAX_HOLD_CONFIRM_MS);
  });

  it("falls back to the default for a value that is not a number", () => {
    expect(clampHoldConfirmMs(Number.NaN)).toBe(DEFAULT_HOLD_CONFIRM_MS);
  });
});

describe("clampParallaxStrength", () => {
  it("allows none at all, which is the point of the setting", () => {
    expect(clampParallaxStrength(0)).toBe(0);
  });

  it("holds the range", () => {
    expect(clampParallaxStrength(-1)).toBe(0);
    expect(clampParallaxStrength(50)).toBe(MAX_PARALLAX_STRENGTH);
    expect(clampParallaxStrength(Number.NaN)).toBe(DEFAULT_PARALLAX_STRENGTH);
  });
});

describe("the values the interface reads back", () => {
  it("hands out what was pushed in, clamped", () => {
    setHoldConfirmMs(1500);
    expect(holdConfirmDuration()).toBe(1500);
    setHoldConfirmMs(-1);
    expect(holdConfirmDuration()).toBe(MIN_HOLD_CONFIRM_MS);

    setParallaxStrength(0);
    expect(parallaxScale()).toBe(0);
    setParallaxStrength(1.5);
    expect(parallaxScale()).toBe(1.5);

    setHoldConfirmMs(DEFAULT_HOLD_CONFIRM_MS);
    setParallaxStrength(DEFAULT_PARALLAX_STRENGTH);
  });
});
