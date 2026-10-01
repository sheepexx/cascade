import { describe, expect, it } from "vitest";
import { LOGIN_RESUME_MS, rememberProjectForLogin, takeProjectAfterLogin } from "./loginResume";

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
