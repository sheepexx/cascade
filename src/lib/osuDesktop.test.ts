import { describe, expect, it } from "vitest";
import { osuMapLabel, osuMapName, type OsuSelectedMap } from "./osuDesktop";

const map = (over: Partial<OsuSelectedMap> = {}): OsuSelectedMap => ({
  folder: "1488997 Various Artists - Jack Compilation",
  file: "Various Artists - Jack Compilation (sheepex) [Insane].osu",
  artist: "Various Artists",
  title: "Jack Compilation",
  creator: "sheepex",
  difficulty: "Insane",
  mapId: 3054321,
  setId: 1488997,
  osuRoot: null,
  ...over,
});

describe("osuMapName", () => {
  it("uses the song strings osu! reports", () => {
    expect(osuMapName(map())).toEqual({
      artist: "Various Artists",
      title: "Jack Compilation",
    });
  });

  it("reads the folder when osu! reports no song yet, without its set id", () => {
    expect(osuMapName(map({ artist: "", title: "" }))).toEqual({
      artist: "Various Artists",
      title: "Jack Compilation",
    });
  });

  it("keeps whichever half osu! did report", () => {
    expect(osuMapName(map({ title: "" })).title).toBe("Jack Compilation");
    expect(osuMapName(map({ artist: "" })).artist).toBe("Various Artists");
  });

  it("takes a folder without a set id or a separator as the title", () => {
    expect(osuMapName(map({ artist: "", title: "", folder: "My WIP" }))).toEqual(
      { artist: "", title: "My WIP" },
    );
  });

  it("splits on the first separator, so titles may contain one", () => {
    expect(
      osuMapName(map({ artist: "", title: "", folder: "42 Artist - A - B" })),
    ).toEqual({ artist: "Artist", title: "A - B" });
  });

  it("leaves digits that are part of the artist alone", () => {
    expect(
      osuMapName(map({ artist: "", title: "", folder: "313 - Nine" })),
    ).toEqual({ artist: "313", title: "Nine" });
  });
});

describe("osuMapLabel", () => {
  it("names the map and its difficulty", () => {
    expect(osuMapLabel(map())).toBe(
      "Various Artists - Jack Compilation [Insane]",
    );
  });

  it("keeps the set id out of the label when it falls back to the folder", () => {
    expect(osuMapLabel(map({ artist: "", title: "" }))).toBe(
      "Various Artists - Jack Compilation [Insane]",
    );
  });

  it("drops the bracket when osu! reports no difficulty", () => {
    expect(osuMapLabel(map({ difficulty: "" }))).toBe(
      "Various Artists - Jack Compilation",
    );
  });
});
