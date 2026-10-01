import { describe, expect, it } from "vitest";
import { HANDOFF_MAX_AGE_MS, filesFromParked, isHandoffUrl } from "./fileHandoff";

describe("file handoff", () => {
  it("recognises the handoff URL only", () => {
    expect(isHandoffUrl("?open=handoff")).toBe(true);
    expect(isHandoffUrl("?open=handoff&utm_source=x")).toBe(true);
    expect(isHandoffUrl("?open=other")).toBe(false);
    expect(isHandoffUrl("")).toBe(false);
  });

  it("turns parked blobs back into named files", () => {
    const files = filesFromParked(
      { at: 1000, files: [{ name: "map.osz", type: "", blob: new Blob(["zip"]) }] },
      2000,
    );
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("map.osz");
    expect(files[0].size).toBe(3);
  });

  it("drops stale, future and malformed records", () => {
    const blob = new Blob(["x"]);
    expect(filesFromParked({ at: 0, files: [{ name: "a.osu", type: "", blob }] }, HANDOFF_MAX_AGE_MS + 1)).toEqual([]);
    expect(filesFromParked({ at: 10 * 60_000, files: [{ name: "a.osu", type: "", blob }] }, 0)).toEqual([]);
    expect(filesFromParked({ at: 1, files: [{ name: 3, blob }] }, 2)).toEqual([]);
    expect(filesFromParked(null, 0)).toEqual([]);
    expect(filesFromParked({ at: 1, files: "nope" }, 2)).toEqual([]);
  });
});
