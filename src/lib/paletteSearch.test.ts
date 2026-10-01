import { describe, expect, it } from "vitest";
import {
  NEW_BADGE_MS,
  loadNewSeen,
  markNewSeen,
  rankCommand,
  retireNewBadge,
  searchCommands,
  showNewBadge,
} from "./paletteSearch";

const timing = { label: "Timing", group: "Map", aliases: ["BPM", "offset"], keywords: "red line" };
const exportOsz = { label: "Export .osz", group: "Export", keywords: "package beatmap" };
const sv = { label: "SV", group: "Map", aliases: ["scroll velocity"] };

describe("rankCommand", () => {
  it("prefers the label, then aliases, then words found anywhere", () => {
    expect(rankCommand(timing, "timing")).toBe(100);
    expect(rankCommand(timing, "bpm")).toBe(90);
    expect(rankCommand(timing, "tim")).toBe(60);
    expect(rankCommand(timing, "off")).toBe(50);
    expect(rankCommand(timing, "red")).toBe(10);
    expect(rankCommand(timing, "nothing")).toBe(-1);
    expect(rankCommand(timing, "  ")).toBe(1);
  });

  it("matches the starts of words in the label", () => {
    expect(rankCommand(exportOsz, "exp osz")).toBe(20);
    expect(rankCommand(exportOsz, "beatmap")).toBe(10);
  });

  it("needs every word to appear somewhere", () => {
    expect(rankCommand(sv, "scroll velocity")).toBe(90);
    expect(rankCommand(sv, "scroll speed")).toBe(-1);
  });
});

describe("searchCommands", () => {
  it("puts the best match first and keeps listed order for ties", () => {
    const commands = [exportOsz, sv, timing];
    expect(searchCommands(commands, "bpm")).toEqual([timing]);
    expect(searchCommands(commands, "")).toEqual(commands);
    expect(searchCommands(commands, "s").map((c) => c.label)).toEqual(["SV", "Export .osz", "Timing"]);
  });
});

describe("New badges", () => {
  function store() {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  }

  it("shows until the command is used or two weeks pass", () => {
    const s = store();
    const seen = markNewSeen(["backups"], 1000, s);
    expect(showNewBadge("backups", seen, [], 1000 + NEW_BADGE_MS - 1)).toBe(true);
    expect(showNewBadge("backups", seen, [], 1000 + NEW_BADGE_MS)).toBe(false);
    expect(showNewBadge("backups", seen, ["backups"], 1000)).toBe(false);
  });

  it("retires a badge once the command has been run", () => {
    const s = store();
    markNewSeen(["backups"], 1000, s);
    const seen = retireNewBadge("backups", s);
    expect(showNewBadge("backups", seen, [], 2000)).toBe(false);
    expect(markNewSeen(["backups"], 3000, s).backups).toBe(-1);
  });

  it("keeps the first sighting", () => {
    const s = store();
    markNewSeen(["backups"], 1000, s);
    expect(markNewSeen(["backups", "share"], 5000, s)).toEqual({ backups: 1000, share: 5000 });
    expect(loadNewSeen(s)).toEqual({ backups: 1000, share: 5000 });
  });

  it("shrugs off junk in storage", () => {
    const s = store();
    s.setItem("cascade:palette-new-seen", JSON.stringify({ a: "x", b: 3 }));
    expect(loadNewSeen(s)).toEqual({ b: 3 });
    s.setItem("cascade:palette-new-seen", "[");
    expect(loadNewSeen(s)).toEqual({});
  });
});
