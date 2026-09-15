import { describe, expect, it } from "vitest";
import {
  DESKTOP_ORIGINS,
  desktopNonceFromState,
  desktopPortFromState,
  desktopState,
  loopbackRedirect,
  parseLoopbackPort,
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

describe("loopback port parsing", () => {
  it.each(["1024", "51234", "65535"])("accepts %s", (raw) => {
    expect(parseLoopbackPort(raw)).toBe(Number(raw));
  });

  it.each([
    null,
    "",
    "80",
    "443",
    "1023",
    "65536",
    "99999",
    "12a4",
    "-5000",
    "5000.5",
    " 5000",
    "5000; rm -rf",
  ])("rejects %s", (raw) => {
    expect(parseLoopbackPort(raw)).toBeNull();
  });
});

describe("desktop oauth round trip", () => {
  it("carries the port through the state", () => {
    const nonce = "12345678-1234-1234-1234-123456789abc";
    const state = desktopState(51234, nonce);
    expect(state).toMatch(/^[0-9a-f-]{36}.desktop.51234.[A-Za-z0-9_-]{16,128}$/);
    expect(desktopPortFromState(state)).toBe(51234);
    expect(desktopNonceFromState(state)).toBe(nonce);
  });

  it.each([
    "plain-uuid",
    "uuid.desktop",
    "uuid.desktop.80",
    "uuid.desktop.99999",
    "uuid.desktop.abcd",
    "uuid.desktop.51234.evil",
  ])("reads no port from %s", (state) => {
    expect(desktopPortFromState(state)).toBeNull();
  });

  it("only ever builds a loopback url", () => {
    expect(loopbackRedirect(51234, "tok en/+1", "nonce-value-123456")).toBe(
      "http://127.0.0.1:51234/callback?session=tok%20en%2F%2B1&nonce=nonce-value-123456",
    );
  });
});
