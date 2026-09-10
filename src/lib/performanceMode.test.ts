import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPerformanceMode,
  prefersReducedMotion,
  reduceMotion,
  renderScale,
  setPerformanceMode,
  subscribePerformanceMode,
} from "./performanceMode";

afterEach(() => {
  setPerformanceMode(false);
  vi.unstubAllGlobals();
});

function withMotion(reduce: boolean, dpr = 3) {
  vi.stubGlobal("window", {
    devicePixelRatio: dpr,
    matchMedia: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
    }),
  });
}

describe("prefersReducedMotion", () => {
  it("reads the media query", () => {
    withMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    vi.unstubAllGlobals();
    withMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("stays false when the browser cannot answer", () => {
    vi.stubGlobal("window", {});
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("setPerformanceMode", () => {
  it("stamps the document so CSS can react", () => {
    const attributes = new Map<string, string>();
    vi.stubGlobal("document", {
      documentElement: {
        setAttribute: (name: string, value: string) =>
          void attributes.set(name, value),
        removeAttribute: (name: string) => void attributes.delete(name),
      },
    });
    setPerformanceMode(true);
    expect(attributes.get("data-performance")).toBe("on");
    setPerformanceMode(false);
    expect(attributes.has("data-performance")).toBe(false);
  });

  it("notifies subscribers only on a real change", () => {
    const seen = vi.fn();
    const stop = subscribePerformanceMode(seen);
    setPerformanceMode(true);
    setPerformanceMode(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(isPerformanceMode()).toBe(true);
    stop();
    setPerformanceMode(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("reduceMotion", () => {
  it("is true when either the setting or the system asks for it", () => {
    withMotion(false);
    expect(reduceMotion()).toBe(false);
    setPerformanceMode(true);
    expect(reduceMotion()).toBe(true);
    setPerformanceMode(false);
    vi.unstubAllGlobals();
    withMotion(true);
    expect(reduceMotion()).toBe(true);
  });
});

describe("renderScale", () => {
  it("follows the device pixel ratio, capped on request", () => {
    withMotion(false, 3);
    expect(renderScale()).toBe(3);
    expect(renderScale(2)).toBe(2);
  });

  it("drops to 1x in performance mode", () => {
    withMotion(false, 3);
    setPerformanceMode(true);
    expect(renderScale()).toBe(1);
  });
});
