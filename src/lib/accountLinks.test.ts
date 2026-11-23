import { describe, expect, it } from "vitest";
import {
  authErrorText,
  linkTokenProvider,
  PENDING_AUTH_MS,
  readAuthReturn,
  readDesktopPayload,
  rememberPendingAuth,
  takePendingAuth,
  withoutAuthReturn,
} from "./accountLinks";

function memoryStore() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("coming back from a sign-in", () => {
  it("reads a session, a link result or an error", () => {
    expect(readAuthReturn("https://cascade.sheepex.net/?auth=ok#session=a.b.c")).toEqual({ kind: "session", token: "a.b.c" });
    expect(readAuthReturn("https://cascade.sheepex.net/?auth=link#link=x.y.z")).toEqual({ kind: "link", token: "x.y.z" });
    expect(readAuthReturn("https://cascade.sheepex.net/?auth=error&reason=reauth_mismatch&provider=osu")).toEqual({
      kind: "error",
      reason: "reauth_mismatch",
      provider: "osu",
    });
    expect(readAuthReturn("https://cascade.sheepex.net/?auth=error&reason=<script>&provider=evil")).toEqual({
      kind: "error",
      reason: "exchange",
      provider: null,
    });
    expect(readAuthReturn("https://cascade.sheepex.net/user/peppy")).toBeNull();
  });

  it("leaves the address as it was before the sign-in", () => {
    expect(withoutAuthReturn("https://cascade.sheepex.net/?auth=ok#session=a.b.c")).toBe("/");
    expect(withoutAuthReturn("https://cascade.sheepex.net/user/x?auth=error&reason=state&provider=osu&tab=1")).toBe("/user/x?tab=1");
    expect(withoutAuthReturn("https://cascade.sheepex.net/user/x?provider=osu#maps")).toBe("/user/x?provider=osu#maps");
  });

  it("reads what the desktop listener hands over", () => {
    expect(readDesktopPayload("a.b.c")).toEqual({ kind: "session", token: "a.b.c" });
    expect(readDesktopPayload("link:x.y.z")).toEqual({ kind: "link", token: "x.y.z" });
    expect(readDesktopPayload("error:busy")).toEqual({ kind: "error", reason: "busy", provider: null });
    expect(readDesktopPayload("")).toBeNull();
  });
});

describe("sign-ins this browser started", () => {
  it("are remembered once, for a while", () => {
    const store = memoryStore();
    rememberPendingAuth({ at: 1_000, intent: "reauth", provider: "osu", then: { action: "link", provider: "discord" } }, store);
    expect(takePendingAuth(2_000, store)).toEqual({
      at: 1_000,
      intent: "reauth",
      provider: "osu",
      then: { action: "link", provider: "discord" },
    });
    expect(takePendingAuth(2_000, store)).toBeNull();
    rememberPendingAuth({ at: 1_000, intent: "login", provider: "discord" }, store);
    expect(takePendingAuth(1_000 + PENDING_AUTH_MS + 1, store)).toBeNull();
  });

  it("are nothing when someone else's link is opened", () => {
    expect(takePendingAuth(Date.now(), memoryStore())).toBeNull();
  });

  it("drop anything that isn't a sign-in", () => {
    const store = memoryStore();
    store.setItem("cascade:auth-pending", JSON.stringify({ at: 1, intent: "merge", provider: "osu" }));
    expect(takePendingAuth(2, store)).toBeNull();
    store.setItem("cascade:auth-pending", "{broken");
    expect(takePendingAuth(2, store)).toBe("unavailable");
  });
});

describe("link results", () => {
  it("name their provider without being trusted for anything else", () => {
    const payload = btoa(JSON.stringify({ provider: "discord", sub: "x" })).replace(/=+$/, "");
    expect(linkTokenProvider(`h.${payload}.s`)).toBe("discord");
    expect(linkTokenProvider("not a token")).toBeNull();
  });
});

describe("error text", () => {
  it("names the provider", () => {
    const t = (key: string, params?: Record<string, string>) => `${key}:${params?.provider ?? ""}`;
    expect(authErrorText(t, "unavailable", "discord")).toBe("auth.errorUnavailable:Discord");
    expect(authErrorText(t, "profile", "osu")).toBe("auth.errorExchange:osu!");
  });
});
