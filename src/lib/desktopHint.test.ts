import { describe, expect, it } from "vitest";
import { compareVersions, desktopHintStatus } from "./desktopHint";

describe("compareVersions", () => {
  it("orders by each number, not as text", () => {
    expect(compareVersions("1.2.9", "1.2.10")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.330", "1.2.330")).toBe(0);
  });

  it("treats missing parts as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBeLessThan(0);
  });
});

describe("desktopHintStatus", () => {
  it("always offers the download when signed out", () => {
    expect(
      desktopHintStatus({
        signedIn: false,
        desktopVersion: "1.2.330",
        latestVersion: "1.2.330",
      }),
    ).toBe("download");
  });

  it("offers the download until the account has used the desktop app", () => {
    expect(
      desktopHintStatus({
        signedIn: true,
        desktopVersion: null,
        latestVersion: "1.2.330",
      }),
    ).toBe("download");
  });

  it("asks for an update while the installed version trails the release", () => {
    expect(
      desktopHintStatus({
        signedIn: true,
        desktopVersion: "1.2.329",
        latestVersion: "1.2.330",
      }),
    ).toBe("update");
  });

  it("goes quiet once the installed version is current", () => {
    for (const desktopVersion of ["1.2.330", "1.2.331"]) {
      expect(
        desktopHintStatus({
          signedIn: true,
          desktopVersion,
          latestVersion: "1.2.330",
        }),
      ).toBe("current");
    }
  });

  it("leaves app users alone when the newest release is unknown", () => {
    expect(
      desktopHintStatus({
        signedIn: true,
        desktopVersion: "1.2.300",
        latestVersion: null,
      }),
    ).toBe("current");
  });
});
