import { describe, it, expect } from "vitest";
import { parseOsuBeatmapLink } from "./osuLinks";

describe("parseOsuBeatmapLink", () => {
  it("treats bare numbers as set IDs", () => {
    expect(parseOsuBeatmapLink("725538")).toEqual({ setId: 725538 });
    expect(parseOsuBeatmapLink("  725538  ")).toEqual({ setId: 725538 });
  });

  it("parses beatmapset URLs with a difficulty anchor", () => {
    expect(
      parseOsuBeatmapLink("https://osu.ppy.sh/beatmapsets/725538#mania/1531897"),
    ).toEqual({ setId: 725538, beatmapId: 1531897 });
    expect(
      parseOsuBeatmapLink("https://osu.ppy.sh/beatmapsets/292301#osu/661095"),
    ).toEqual({ setId: 292301, beatmapId: 661095 });
  });

  it("parses beatmapset URLs without an anchor", () => {
    expect(parseOsuBeatmapLink("https://osu.ppy.sh/beatmapsets/725538")).toEqual(
      { setId: 725538 },
    );
    expect(parseOsuBeatmapLink("osu.ppy.sh/beatmapsets/725538/")).toEqual({
      setId: 725538,
    });
  });

  it("parses old-site /b/ and /beatmaps/ links as beatmap IDs", () => {
    expect(parseOsuBeatmapLink("https://osu.ppy.sh/b/1531897")).toEqual({
      beatmapId: 1531897,
    });
    expect(parseOsuBeatmapLink("https://osu.ppy.sh/beatmaps/1531897")).toEqual({
      beatmapId: 1531897,
    });
  });

  it("rejects junk", () => {
    expect(parseOsuBeatmapLink("")).toBeNull();
    expect(parseOsuBeatmapLink("hello")).toBeNull();
    expect(parseOsuBeatmapLink("https://osu.ppy.sh/users/1383951")).toBeNull();
  });
});
