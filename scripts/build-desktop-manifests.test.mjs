import { describe, expect, it } from "vitest";
import { buildManifests, classifyAssets } from "./build-desktop-manifests.mjs";

const file = (name, size = 100, content = "") => ({ name, size, content });

const WINDOWS = [
  file("Cascade_1.2.280_x64-setup.exe", 23_000_000),
  file("Cascade_1.2.280_x64-setup.exe.sig", 90, "win-signature\n"),
  file("Cascade_1.2.280_x64_en-US.msi", 24_000_000),
  file("Cascade_1.2.280_portable.exe", 26_000_000),
];
const LINUX = [
  file("cascade_1.2.280_amd64.AppImage", 90_000_000),
  file("cascade_1.2.280_amd64.AppImage.sig", 90, "linux-signature\n"),
  file("cascade_1.2.280_amd64.deb", 20_000_000),
  file("cascade-1.2.280-1.x86_64.rpm", 20_000_000),
];
const MACOS = [
  file("Cascade_1.2.280_universal.dmg", 30_000_000),
  file("Cascade.app.tar.gz", 28_000_000),
  file("Cascade.app.tar.gz.sig", 90, "mac-signature\n"),
];

const build = (files) => buildManifests(files, "1.2.280", "https://worker.test", "2026-09-09T00:00:00.000Z");

describe("desktop manifests", () => {
  it("groups every platform's assets", () => {
    const platforms = classifyAssets([...WINDOWS, ...LINUX, ...MACOS]);
    expect(Object.keys(platforms).sort()).toEqual(["linux", "macos", "windows"]);
    expect(platforms.windows.setup.name).toBe("Cascade_1.2.280_x64-setup.exe");
    expect(platforms.linux.appimage.size).toBe(90_000_000);
    expect(platforms.macos.dmg.name).toBe("Cascade_1.2.280_universal.dmg");
  });
  it("never classifies a signature as a download", () => {
    const platforms = classifyAssets([file("Cascade_1.2.280_x64-setup.exe.sig"), ...WINDOWS]);
    expect(platforms.windows.setup.name).not.toMatch(/\.sig$/);
  });
  it("maps a universal macOS bundle onto both architectures", () => {
    const { update } = build([...WINDOWS, ...MACOS]);
    expect(update.platforms["darwin-x86_64"].signature).toBe("mac-signature");
    expect(update.platforms["darwin-aarch64"].url).toBe(update.platforms["darwin-x86_64"].url);
  });
  it("keeps the legacy files field pointing at the Windows assets", () => {
    const { latest } = build([...WINDOWS, ...LINUX, ...MACOS]);
    expect(latest.files).toEqual(latest.platforms.windows);
    expect(latest.files.setup.name).toMatch(/-setup\.exe$/);
  });
  it("omits a platform whose signature never arrived", () => {
    const { update } = build([...WINDOWS, ...LINUX.filter(f => !f.name.endsWith(".sig"))]);
    expect(update.platforms["linux-x86_64"]).toBeUndefined();
    expect(update.platforms["windows-x86_64"]).toBeDefined();
  });
  it("refuses to publish a manifest that would strand Windows users", () => {
    expect(() => build([...LINUX, ...MACOS])).toThrow(/Windows setup installer/);
    expect(() => build([...WINDOWS.filter(f => !f.name.endsWith(".sig")), ...LINUX])).toThrow(/updater signature/);
  });
  it("encodes artifact names into updater urls", () => {
    const { update } = build([...WINDOWS, file("Cascade 1.2.280.AppImage"), file("Cascade 1.2.280.AppImage.sig", 90, "s")]);
    expect(update.platforms["linux-x86_64"].url).toBe("https://worker.test/desktop/1.2.280/Cascade%201.2.280.AppImage");
  });
});

describe("updater artifact naming variants", () => {
  it("prefers the tar.gz AppImage payload when Tauri emits one", () => {
    const { update } = build([
      ...WINDOWS,
      file("cascade.AppImage", 90_000_000),
      file("cascade.AppImage.tar.gz", 89_000_000),
      file("cascade.AppImage.tar.gz.sig", 90, "tar-signature\n"),
    ]);
    expect(update.platforms["linux-x86_64"].signature).toBe("tar-signature");
    expect(update.platforms["linux-x86_64"].url).toMatch(/cascade\.AppImage\.tar\.gz$/);
  });
  it("falls back to the bare AppImage when only it is signed", () => {
    const { update } = build([...WINDOWS, ...LINUX]);
    expect(update.platforms["linux-x86_64"].signature).toBe("linux-signature");
  });
});
