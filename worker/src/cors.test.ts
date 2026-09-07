import { describe, expect, it } from "vitest";
import {
  DESKTOP_ORIGINS,
  desktopSessionRedirect,
  isDesktopState,
  resolveAllowedOrigin,
} from "./index";
import type { WorkerEnv } from "./storage";

const env = { FRONTEND_URL: "https://cascade.sheepex.net" } as WorkerEnv;

describe("allowed origins", () => {
  it("falls back to the site when there is no Origin header", () => {
    expect(resolveAllowedOrigin(null, env)).toBe(env.FRONTEND_URL);
  });

  it("echoes the site itself", () => {
    expect(resolveAllowedOrigin(env.FRONTEND_URL, env)).toBe(env.FRONTEND_URL);
  });

  it.each(DESKTOP_ORIGINS)("echoes the desktop origin %s", (origin) => {
    expect(resolveAllowedOrigin(origin, env)).toBe(origin);
  });

  it.each([
    "https://evil.example",
    "http://localhost:5173",
    "https://cascade.sheepex.net.evil.example",
    "http://tauri.localhost.evil.example",
    "null",
  ])("never echoes %s", (origin) => {
    expect(resolveAllowedOrigin(origin, env)).toBe(env.FRONTEND_URL);
  });
});

describe("desktop oauth round trip", () => {
  it("marks only desktop state", () => {
    expect(isDesktopState("abc.desktop")).toBe(true);
    expect(isDesktopState("abc")).toBe(false);
    expect(isDesktopState("desktop.abc")).toBe(false);
  });

  it("hands the session to the app over the custom scheme", () => {
    expect(desktopSessionRedirect("tok en/+1")).toBe(
      "cascade://auth?session=tok%20en%2F%2B1",
    );
  });
});
