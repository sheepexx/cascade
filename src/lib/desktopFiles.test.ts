import { describe, expect, it } from "vitest";
import { baseName, mimeFor } from "./desktopFiles";

describe("baseName", () => {
  it("takes the file name off a Windows launch argument", () => {
    expect(baseName("C:\\osu!\\Songs\\123 Artist - Title\\map.osu")).toBe(
      "map.osu",
    );
  });

  it("handles forward slashes and bare names", () => {
    expect(baseName("/home/sheepex/map.osz")).toBe("map.osz");
    expect(baseName("map.qua")).toBe("map.qua");
  });
});

describe("mimeFor", () => {
  it("labels every format the editor opens", () => {
    expect(mimeFor("set.osz")).toBe("application/x-osu-archive");
    expect(mimeFor("map.osu")).toBe("application/x-osu-beatmap");
    expect(mimeFor("chart.sm")).toBe("application/x-stepmania");
    expect(mimeFor("chart.ssc")).toBe("application/x-stepmania");
    expect(mimeFor("map.qua")).toBe("application/x-quaver");
    expect(mimeFor("skin.osk")).toBe("application/x-osu-skin");
  });

  it("ignores extension case", () => {
    expect(mimeFor("Set.OSZ")).toBe("application/x-osu-archive");
  });

  it("falls back for anything else", () => {
    expect(mimeFor("song.mp3")).toBe("application/octet-stream");
    expect(mimeFor("noextension")).toBe("application/octet-stream");
  });
});
