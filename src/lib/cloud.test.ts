import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, makeDifficulty } from "../types";
import {
  cloudSafeProjectData,
  duplicateProjectQuery,
  type CloudProjectData,
} from "./cloud";

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

describe("duplicateProjectQuery", () => {
  function project(setId: number | undefined, beatmapIds: (number | undefined)[]): CloudProjectData {
    const difficulties = beatmapIds.map((beatmapId, i) => ({
      ...makeDifficulty(`Diff ${i}`, 4),
      beatmapId,
    }));
    return {
      meta: { title: "  Song  ", artist: "Artist", creator: "Mapper", beatmapSetId: setId },
      timingPoints: [],
      difficulties,
      activeId: difficulties[0]?.id ?? "",
      view: DEFAULT_VIEW,
      bgScope: "mapset",
    };
  }

  it("keeps submitted IDs and the trimmed title", () => {
    expect(duplicateProjectQuery(project(1234, [55, 56, 55]))).toEqual({
      title: "Song",
      setId: 1234,
      beatmapIds: [55, 56],
    });
  });

  it("never matches on unsubmitted 0 or -1 IDs", () => {
    expect(duplicateProjectQuery(project(-1, [0, -1, undefined]))).toEqual({
      title: "Song",
      setId: null,
      beatmapIds: [],
    });
    expect(duplicateProjectQuery(project(0, [])).setId).toBeNull();
  });
});
