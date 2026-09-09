import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXIT_ANIMATION_MS,
  EXIT_REDUCED_MS,
  canExitDesktop,
  exitAnimationMs,
  prefersReducedMotion,
} from "./desktopExit";

afterEach(() => {
  vi.unstubAllGlobals();
});

function withMatchMedia(reduce: boolean) {
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
    }),
  });
}

describe("exitAnimationMs", () => {
  it("gives the full animation room to play", () => {
    expect(exitAnimationMs(false)).toBe(EXIT_ANIMATION_MS);
  });

  it("cuts the wait short when motion is reduced", () => {
    expect(exitAnimationMs(true)).toBe(EXIT_REDUCED_MS);
  });

  it("reads the motion preference when none is passed", () => {
    withMatchMedia(true);
    expect(exitAnimationMs()).toBe(EXIT_REDUCED_MS);
    vi.unstubAllGlobals();
    withMatchMedia(false);
    expect(exitAnimationMs()).toBe(EXIT_ANIMATION_MS);
  });
});

describe("prefersReducedMotion", () => {
  it("stays false when the browser cannot answer", () => {
    vi.stubGlobal("window", {});
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("canExitDesktop", () => {
  it("only offers to quit inside the desktop app", () => {
    vi.stubGlobal("window", {});
    expect(canExitDesktop()).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(canExitDesktop()).toBe(true);
  });
});
