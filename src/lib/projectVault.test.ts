import { describe, expect, it } from "vitest";
import {
  CHART_FILE,
  chartOnly,
  mediaFiles,
  vaultFolderName,
} from "./projectVault";
import type { SavedProject } from "./persistence";

const blob = (text: string) => new Blob([text]);

function project(extra: Partial<SavedProject> = {}): SavedProject {
  return {
    version: 2,
    savedAt: 0,
    meta: { artist: "Artist", title: "Title" },
    timingPoints: [],
    difficulties: [],
    activeId: "a",
    view: {},
    appSettings: {},
    bgScope: {},
    ...extra,
  } as unknown as SavedProject;
}

describe("vaultFolderName", () => {
  it("names the folder after the map", () => {
    expect(vaultFolderName(project())).toBe("Artist - Title");
  });

  it("falls back when the map has no metadata yet", () => {
    const blank = project({
      meta: { artist: "  ", title: "" },
    } as Partial<SavedProject>);
    expect(vaultFolderName(blank)).toBe("Cascade map");
  });

  it("drops a missing half rather than leaving a dangling separator", () => {
    const partial = project({
      meta: { artist: "", title: "Title" },
    } as Partial<SavedProject>);
    expect(vaultFolderName(partial)).toBe("Title");
  });
});

describe("chartOnly", () => {
  it("leaves the media out, so snapshots stay small", () => {
    const chart = JSON.parse(
      chartOnly(
        project({
          audioFiles: [{ name: "song.mp3", blob: blob("audio") }],
          skin: { name: "skin.osk", blob: blob("skin") },
        }),
      ),
    );
    expect(chart.audioFiles).toBeUndefined();
    expect(chart.skin).toBeUndefined();
    expect(chart.meta.title).toBe("Title");
  });
});

describe("mediaFiles", () => {
  it("flattens every media field into one list", () => {
    const files = mediaFiles(
      project({
        audioFiles: [{ name: "song.mp3", blob: blob("a") }],
        backgroundFiles: [{ name: "bg.jpg", blob: blob("b") }],
        videoFiles: [{ name: "clip.mp4", blob: blob("c") }],
      }),
    );
    expect(files.map((file) => file.name).sort()).toEqual([
      "bg.jpg",
      "clip.mp4",
      "song.mp3",
    ]);
  });

  it("de-duplicates a file that appears in two fields", () => {
    const shared = blob("a");
    const files = mediaFiles(
      project({
        audioFiles: [{ name: "song.mp3", blob: shared }],
        audio: { name: "song.mp3", blob: shared },
      }),
    );
    expect(files).toHaveLength(1);
  });

  it("never lets a media file shadow the chart", () => {
    const files = mediaFiles(
      project({
        backgroundFiles: [{ name: CHART_FILE, blob: blob("nope") }],
      }),
    );
    expect(files).toHaveLength(0);
  });

  it("skips empty and missing fields", () => {
    expect(mediaFiles(project())).toEqual([]);
    expect(mediaFiles(project({ audio: null, skin: null }))).toEqual([]);
  });
});
