import { describe, expect, it } from "vitest";
import {
  BeatBounce,
  BOUNCE_COMPRESSION,
  BOUNCE_LIFT,
  BOUNCE_ROTATION,
  HOVER_SCALE,
  LoudnessTracker,
  MAX_INTENSITY,
  MIN_INTENSITY,
  bounceTransform,
} from "./beatBounce";

describe("menu icon beat bounce", () => {
  it("leans and squashes into the hover pose by the next beat", () => {
    const bounce = new BeatBounce();
    bounce.hover(0, 300);
    expect(bounce.frame(0)).toEqual({ rotate: 0, y: 0, scaleX: 1, scaleY: 1 });
    const pose = bounce.frame(300);
    expect(pose.rotate).toBeCloseTo(BOUNCE_ROTATION);
    expect(pose.y).toBeCloseTo(0);
    expect(pose.scaleX).toBeCloseTo(HOVER_SCALE);
    expect(pose.scaleY).toBeCloseTo(HOVER_SCALE * BOUNCE_COMPRESSION);
  });

  it("starts moving the moment the pointer arrives and lands on the next beat", () => {
    const bounce = new BeatBounce();
    bounce.hover(0, 600);
    expect(bounce.frame(40).y).toBeLessThan(-1);
    expect(bounce.frame(160).scaleX).toBeCloseTo(HOVER_SCALE);
    expect(bounce.frame(300).y).toBeCloseTo(-BOUNCE_LIFT);
    expect(bounce.frame(600).y).toBeCloseTo(0);
  });

  it("jumps for half a beat, lands squashed and swings to the other side", () => {
    const bounce = new BeatBounce();
    bounce.hover(0, 100);
    bounce.beat(100, 500);
    const peak = bounce.frame(350);
    expect(peak.y).toBeCloseTo(-BOUNCE_LIFT);
    expect(peak.scaleY).toBeCloseTo(HOVER_SCALE);
    expect(peak.rotate).toBeCloseTo(0);
    const landing = bounce.frame(600);
    expect(landing.y).toBeCloseTo(0);
    expect(landing.scaleY).toBeCloseTo(HOVER_SCALE * BOUNCE_COMPRESSION);
    expect(landing.rotate).toBeCloseTo(-BOUNCE_ROTATION);
    bounce.beat(600, 500);
    expect(bounce.frame(1100).rotate).toBeCloseTo(BOUNCE_ROTATION);
  });

  it("jumps lower and swings less on quiet beats", () => {
    const bounce = new BeatBounce();
    bounce.beat(0, 400, 0.25);
    expect(bounce.frame(200).y).toBeCloseTo(-BOUNCE_LIFT * 0.25);
    const landing = bounce.frame(400);
    expect(landing.rotate).toBeCloseTo(-BOUNCE_ROTATION * 0.25);
    expect(landing.scaleY).toBeCloseTo(HOVER_SCALE * (1 - (1 - BOUNCE_COMPRESSION) * 0.25));
  });

  it("rises fast and falls slow within each half beat", () => {
    const bounce = new BeatBounce();
    bounce.beat(0, 400);
    expect(bounce.frame(100).y).toBeLessThan(-BOUNCE_LIFT / 2);
    expect(bounce.frame(300).y).toBeLessThan(-BOUNCE_LIFT / 2);
  });

  it("eases back to rest when the pointer leaves", () => {
    const bounce = new BeatBounce();
    bounce.hover(0, 100);
    bounce.beat(100, 500);
    bounce.leave(250);
    expect(bounce.settled(600)).toBe(false);
    expect(bounce.frame(750)).toEqual({ rotate: 0, y: 0, scaleX: 1, scaleY: 1 });
    expect(bounce.settled(750)).toBe(true);
    expect(bounceTransform(bounce.frame(750))).toBe("translateY(0.00px) rotate(0.00deg) scale(1.000, 1.000)");
  });
});

describe("menu music loudness", () => {
  const levels = (value: number) => new Uint8Array(256).fill(value);

  it("keeps full motion when there is nothing to listen to", () => {
    const tracker = new LoudnessTracker();
    tracker.update(null, null, 0);
    expect(tracker.intensity()).toBe(1);
  });

  it("moves a lot in loud parts and barely in quiet ones", () => {
    const tracker = new LoudnessTracker();
    let now = 0;
    for (; now < 3000; now += 16) tracker.update("song", levels(200), now);
    const loud = tracker.intensity();
    for (; now < 6000; now += 16) tracker.update("song", levels(70), now);
    const quiet = tracker.intensity();
    expect(loud).toBeCloseTo(MAX_INTENSITY);
    expect(quiet).toBeLessThan(0.3);
    expect(quiet).toBeGreaterThanOrEqual(MIN_INTENSITY);
  });

  it("judges each beat by its loudest moment rather than the gap before it", () => {
    const tracker = new LoudnessTracker();
    let now = 0;
    for (; now < 4000; now += 16) tracker.update("song", levels(now % 500 < 100 ? 200 : 150), now);
    expect(tracker.intensity(now, 500)).toBeGreaterThan(1.3);
    expect(tracker.intensity(now, 16)).toBeLessThan(tracker.intensity(now, 500));
  });

  it("follows the song's own dynamics whatever the playback volume", () => {
    const run = (loud: number, quiet: number) => {
      const tracker = new LoudnessTracker();
      let now = 0;
      for (; now < 3000; now += 16) tracker.update("song", levels(loud), now);
      const high = tracker.intensity();
      for (; now < 6000; now += 16) tracker.update("song", levels(quiet), now);
      return [high, tracker.intensity()];
    };
    const [loudA, quietA] = run(200, 170);
    const [loudB, quietB] = run(150, 120);
    expect(loudA).toBeCloseTo(loudB, 1);
    expect(quietA).toBeCloseTo(quietB, 1);
    expect(quietA).toBeLessThan(loudA - 0.4);
  });

  it("judges a quiet opening against the songs heard before it", () => {
    const tracker = new LoudnessTracker();
    let now = 0;
    for (; now < 3000; now += 16) tracker.update("a", levels(200), now);
    for (; now < 5000; now += 16) tracker.update("b", levels(120), now);
    expect(tracker.intensity()).toBeLessThan(0.4);
    const fresh = new LoudnessTracker();
    for (let t = 0; t < 2000; t += 16) fresh.update("b", levels(120), t);
    expect(fresh.intensity()).toBeGreaterThan(1.3);
  });
});
