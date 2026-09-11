import { describe, expect, it } from "vitest";
import {
  AudioPunch,
  CriticalSpring,
  FLASH_FADE_IN_MS,
  SideFlash,
  beatAt,
  beatShape,
  flashPeak,
  flashSides,
  idleBeat,
  type MenuTimingPoint,
} from "./menuPulse";

const spectrum = (bass: number, rest: number) => {
  const levels = new Uint8Array(256).fill(rest);
  for (let i = 0; i < 6; i++) levels[i] = bass;
  return levels;
};

describe("logo audio punch", () => {
  it("stays still on a steady spectrum however loud it is", () => {
    const punch = new AudioPunch();
    let value = 0;
    for (let t = 0; t < 2000; t += 16) value = punch.update("song", spectrum(220, 180), t);
    expect(value).toBeLessThan(0.01);
  });

  it("jumps on a kick and eases back down afterwards", () => {
    const punch = new AudioPunch();
    let t = 0;
    for (; t < 1000; t += 16) punch.update("song", spectrum(80, 60), t);
    let peak = 0;
    for (let i = 0; i < 4; i++, t += 16) peak = Math.max(peak, punch.update("song", spectrum(230, 90), t));
    expect(peak).toBeGreaterThan(0.6);
    let after = peak;
    for (let i = 0; i < 20; i++, t += 16) after = punch.update("song", spectrum(230, 90), t);
    expect(after).toBeLessThan(peak * 0.4);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  it("reacts to small hits as well as big ones", () => {
    const punch = new AudioPunch();
    let t = 0;
    for (; t < 1000; t += 16) punch.update("song", spectrum(120, 90), t);
    const small = punch.update("song", spectrum(135, 92), t);
    expect(small).toBeGreaterThan(0.3);
  });

  it("releases when the music stops", () => {
    const punch = new AudioPunch();
    let t = 0;
    for (; t < 500; t += 16) punch.update("song", spectrum(60, 40), t);
    const hit = punch.update("song", spectrum(240, 120), t);
    t += 16;
    let value = hit;
    for (let i = 0; i < 60; i++, t += 16) value = punch.update("song", null, t);
    expect(value).toBeLessThan(hit * 0.05);
  });

  it("starts fresh on a new track", () => {
    const punch = new AudioPunch();
    let t = 0;
    for (; t < 500; t += 16) punch.update("a", spectrum(60, 40), t);
    punch.update("a", spectrum(240, 120), t);
    expect(punch.update("b", spectrum(240, 120), t + 16)).toBeLessThan(0.1);
  });
});

describe("logo beat shape", () => {
  it("peaks on the beat, leads into it and fades within the beat", () => {
    expect(beatShape(0, 500)).toBeCloseTo(1);
    expect(beatShape(250, 500)).toBeLessThan(0.3);
    expect(beatShape(490, 500)).toBeGreaterThan(beatShape(400, 500));
    expect(beatShape(500 - 41, 500)).toBeLessThan(0.1);
  });
});

describe("menu beat clock", () => {
  const red = (time: number, bpm: number, extra: Partial<MenuTimingPoint> = {}): MenuTimingPoint => ({
    time,
    bpm,
    meter: 4,
    omitFirstBarline: false,
    ...extra,
  });

  it("counts beats from the red line, negative before it", () => {
    const points = [red(120, 120)];
    expect(beatAt(points, 120)).toMatchObject({ index: 0, phase: 0, length: 500 });
    expect(beatAt(points, 1370)).toMatchObject({ index: 2, phase: 250 });
    expect(beatAt(points, 0)).toMatchObject({ index: -1, phase: 380 });
  });

  it("follows BPM changes and time signatures", () => {
    const points = [red(0, 120), red(2000, 60, { meter: 3 })];
    expect(beatAt(points, 1999)).toMatchObject({ point: 0, index: 3, meter: 4 });
    expect(beatAt(points, 2500)).toMatchObject({ point: 1, index: 0, phase: 500, meter: 3 });
  });

  it("shifts bars when the first bar line is omitted", () => {
    expect(beatAt([red(0, 120, { omitFirstBarline: true })], 600)?.index).toBe(0);
  });

  it("has nothing to follow without a red line", () => {
    expect(beatAt([], 100)).toBeNull();
  });

  it("idles on the wall clock", () => {
    expect(idleBeat(1500, 60)).toMatchObject({ index: 1, phase: 500, length: 1000, point: -1 });
  });
});

describe("side flashes", () => {
  it("flash both sides on every bar line outside kiai", () => {
    const both = Array.from({ length: 9 }, (_, i) => flashSides(i, 4, false));
    expect(both.map((s) => s.left)).toEqual([true, false, false, false, true, false, false, false, true]);
    expect(both.map((s) => s.right)).toEqual(both.map((s) => s.left));
    expect(flashSides(3, 3, false).left).toBe(true);
  });

  it("alternate left and right on every beat in kiai", () => {
    expect(flashSides(0, 4, true)).toEqual({ left: true, right: false });
    expect(flashSides(1, 4, true)).toEqual({ left: false, right: true });
  });

  it("stay dark before the first beat", () => {
    expect(flashSides(-4, 4, false)).toEqual({ left: false, right: false });
  });

  it("brighten with the channel level, more so in kiai", () => {
    expect(flashPeak(0, false)).toBeCloseTo(0.1);
    expect(flashPeak(0.8, false)).toBeGreaterThan(flashPeak(0.4, false));
    expect(flashPeak(0.6, true)).toBeGreaterThan(flashPeak(0.6, false));
    expect(flashPeak(1, false)).toBeLessThanOrEqual(1);
  });

  it("finishes fading in exactly on a beat it caught early", () => {
    const flash = new SideFlash();
    const beat = 1000;
    const caught = beat - FLASH_FADE_IN_MS + 4;
    flash.trigger(caught, beat - FLASH_FADE_IN_MS, 0.8, 500);
    expect(flash.value(beat)).toBeCloseTo(0.8);
    expect(flash.value(beat + 250)).toBeCloseTo(0.6);
    expect(flash.value(beat + 500)).toBeCloseTo(0);
  });

  it("fades in from whatever is still showing", () => {
    const flash = new SideFlash();
    flash.trigger(0, 0, 1, 1000);
    const showing = flash.value(565);
    flash.trigger(565, 565, 0.5, 1000);
    expect(flash.value(565)).toBeCloseTo(showing);
    expect(flash.value(565 + FLASH_FADE_IN_MS)).toBeCloseTo(0.5);
  });
});

describe("logo spring", () => {
  it("settles on its target without overshooting", () => {
    const spring = new CriticalSpring(1, 40);
    let value = 1;
    let max = 1;
    for (let i = 0; i < 60; i++) {
      value = spring.step(1.06, 16);
      max = Math.max(max, value);
    }
    expect(value).toBeCloseTo(1.06, 3);
    expect(max).toBeLessThanOrEqual(1.06 + 1e-6);
  });
});
