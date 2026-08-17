import { describe, expect, it } from "vitest";
import { consumeLocalSeekSignal, type AudioSeekRequest } from "./audioSeek";

const localA: AudioSeekRequest = { time: 1_000, transition: "smooth" };
const localB: AudioSeekRequest = { time: 1_125, transition: "smooth" };

describe("audio seek signal routing", () => {
  it("does not let an older local signal cancel a newer queued input", () => {
    expect(
      consumeLocalSeekSignal([localA, localB], {
        revision: 1,
        targetTime: localA.time,
        transition: localA.transition,
      }),
    ).toEqual([localB]);
  });

  it("consumes batched local requests through the represented signal", () => {
    expect(
      consumeLocalSeekSignal([localA, localB], {
        revision: 2,
        targetTime: localB.time,
        transition: localB.transition,
      }),
    ).toEqual([]);
  });

  it("identifies an external seek so it can cancel stale local input", () => {
    expect(
      consumeLocalSeekSignal([localA, localB], {
        revision: 3,
        targetTime: 50_000,
        transition: "scrub",
      }),
    ).toBeNull();
  });
});
