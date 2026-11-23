import { describe, expect, it } from "vitest";
import {
  LOGIN_RESUME_MS,
  clearConnectRequest,
  rememberProjectForLogin,
  takeConnectRequest,
  takeProjectAfterLogin,
} from "./loginResume";

function store() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("login resume", () => {
  it("hands back the project once", () => {
    const s = store();
    rememberProjectForLogin("p1", 1000, s);
    expect(takeProjectAfterLogin(2000, s)).toBe("p1");
    expect(takeProjectAfterLogin(2000, s)).toBeNull();
  });

  it("forgets a login that was abandoned", () => {
    const s = store();
    rememberProjectForLogin("p1", 1000, s);
    expect(takeProjectAfterLogin(1000 + LOGIN_RESUME_MS + 1, s)).toBeNull();
    expect(s.data.size).toBe(0);
  });

  it("ignores junk and a clock that went backwards", () => {
    const s = store();
    s.setItem("cascade:resume-after-login", "{not json");
    expect(takeProjectAfterLogin(1000, s)).toBeNull();
    rememberProjectForLogin("p1", 5000, s);
    expect(takeProjectAfterLogin(1000, s)).toBeNull();
    expect(takeProjectAfterLogin(1000, null)).toBeNull();
  });
});

describe("connect requests from the Discord bot", () => {
  it("are kept through a login and leave the address clean", () => {
    const s = store();
    const replaced: string[] = [];
    const location = { href: "https://cascade.sheepex.net/?connect=discord&x=1#top" };
    expect(takeConnectRequest(1000, s, location, (path) => replaced.push(path))).toBe(true);
    expect(replaced).toEqual(["/?x=1#top"]);
    // Back from the login page: the address no longer asks, the tab still does.
    expect(takeConnectRequest(2000, s, { href: "https://cascade.sheepex.net/" }, () => {})).toBe(true);
    clearConnectRequest(s);
    expect(takeConnectRequest(3000, s, { href: "https://cascade.sheepex.net/" }, () => {})).toBe(false);
  });

  it("expire like a login does", () => {
    const s = store();
    takeConnectRequest(1000, s, { href: "https://cascade.sheepex.net/?connect=discord" }, () => {});
    expect(takeConnectRequest(1000 + LOGIN_RESUME_MS + 1, s, null)).toBe(false);
  });
});
