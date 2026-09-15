import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, makeDifficulty } from "../types";
import { cloudSafeProjectData, type CloudProjectData } from "./cloud";

describe("cloudSafeProjectData", () => {
  it("keeps video local-only without mutating the editor document", () => {
    const difficulty = {
      ...makeDifficulty("Hard", 4),
      videoFilename: "intro.mp4",
      videoOffsetMs: 250,
    };
    const data: CloudProjectData = {
      meta: { title: "Song", artist: "Artist", creator: "Mapper" },
      timingPoints: [],
      difficulties: [difficulty],
      activeId: difficulty.id,
      view: DEFAULT_VIEW,
      bgScope: "mapset",
    };

    const safe = cloudSafeProjectData(data);

    expect(safe.difficulties[0].videoFilename).toBeUndefined();
    expect(safe.difficulties[0].videoOffsetMs).toBeUndefined();
    expect(data.difficulties[0].videoFilename).toBe("intro.mp4");
  });
});
