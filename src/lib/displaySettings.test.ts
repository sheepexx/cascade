import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Frame = (now: number) => void;

/** A display that refreshes `hz` times a second, driven by hand. */
function fakeDisplay() {
  let queue: Frame[] = [];
  const window = {
    requestAnimationFrame: (callback: Frame) => {
      queue.push(callback);
      return queue.length;
    },
    cancelAnimationFrame: vi.fn(),
  };
  const run = (hz: number, ms: number) => {
    const step = 1000 / hz;
    for (let now = step; now <= ms; now += step) {
      const due = queue;
      queue = [];
      for (const callback of due) callback(now);
    }
  };
  return { window, run };
}

async function freshModule() {
  vi.resetModules();
  return import("./displaySettings");
}

/** Counts frames of an animation that asks for the next one each time. */
function countFrames(window: { requestAnimationFrame: (cb: Frame) => number }) {
  let frames = 0;
  const loop = () => {
    frames += 1;
    window.requestAnimationFrame(loop);
  };
  window.requestAnimationFrame(loop);
  return () => frames;
}

let display: ReturnType<typeof fakeDisplay>;

beforeEach(() => {
  display = fakeDisplay();
  vi.stubGlobal("window", display.window);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("frame limiter", () => {
  it("reads caps from the setting", async () => {
    const { frameCap } = await freshModule();
    expect(frameCap("vsync")).toBe(0);
    expect(frameCap("144")).toBe(144);
  });

  it("lets a frame a little early through, but not a frame far too soon", async () => {
    const { frameDue } = await freshModule();
    expect(frameDue(100, 0, 60)).toBe(true);
    expect(frameDue(110, 100, 60)).toBe(false);
    expect(frameDue(115.5, 100, 60)).toBe(true);
    expect(frameDue(101, 100, 0)).toBe(true);
  });

  it("holds a 144 Hz display to the chosen cap", async () => {
    const { applyFrameLimit } = await freshModule();
    applyFrameLimit("60");
    const frames = countFrames(display.window);

    display.run(144, 1000);

    expect(frames()).toBeGreaterThanOrEqual(58);
    expect(frames()).toBeLessThanOrEqual(62);
  });

  it("drops nothing when the cap matches the display", async () => {
    const { applyFrameLimit } = await freshModule();
    applyFrameLimit("144");
    const frames = countFrames(display.window);

    display.run(144, 1000);

    expect(frames()).toBeGreaterThanOrEqual(143);
  });

  it("runs every frame again once the cap is lifted", async () => {
    const { applyFrameLimit } = await freshModule();
    applyFrameLimit("30");
    applyFrameLimit("vsync");
    const frames = countFrames(display.window);

    display.run(144, 1000);

    expect(frames()).toBeGreaterThanOrEqual(143);
  });

  it("leaves the browser's frames alone until a cap is chosen", async () => {
    const native = display.window.requestAnimationFrame;
    const { applyFrameLimit } = await freshModule();
    applyFrameLimit("vsync");
    expect(display.window.requestAnimationFrame).toBe(native);
  });

  it("can still cancel a frame", async () => {
    const { applyFrameLimit } = await freshModule();
    applyFrameLimit("60");
    const callback = vi.fn();
    const id = display.window.requestAnimationFrame(callback);
    display.window.cancelAnimationFrame(id);

    display.run(60, 100);

    expect(callback).not.toHaveBeenCalled();
  });

  it("keeps the other frames going when one throws", async () => {
    const { applyFrameLimit } = await freshModule();
    applyFrameLimit("60");
    const thrown: unknown[] = [];
    vi.stubGlobal("queueMicrotask", (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        thrown.push(error);
      }
    });
    const after = vi.fn();
    display.window.requestAnimationFrame(() => {
      throw new Error("boom");
    });
    display.window.requestAnimationFrame(after);

    display.run(60, 20);

    expect(after).toHaveBeenCalled();
    expect(thrown).toHaveLength(1);
  });
});
