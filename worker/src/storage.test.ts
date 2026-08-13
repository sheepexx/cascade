import { describe, expect, it, vi } from "vitest";
import { r2BucketUsage, resolveRange } from "./storage";

describe("r2BucketUsage", () => {
  it("adds object sizes across paginated bucket listings", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ size: 120 }, { size: 80 }],
        truncated: true,
        cursor: "next-page",
      })
      .mockResolvedValueOnce({
        objects: [{ size: 25 }],
        truncated: false,
      });

    await expect(
      r2BucketUsage({ list } as unknown as R2Bucket),
    ).resolves.toEqual({ bytes: 225, objects: 3 });
    expect(list).toHaveBeenNthCalledWith(1, { limit: 1000 });
    expect(list).toHaveBeenNthCalledWith(2, {
      limit: 1000,
      cursor: "next-page",
    });
  });
});

describe("resolveRange", () => {
  it("ignores an undefined suffix on offset ranges", () => {
    const range = {
      offset: 0,
      length: 1024,
      suffix: undefined,
    } as unknown as R2Range;
    expect(resolveRange(range, 160496)).toEqual({ offset: 0, length: 1024 });
  });

  it("resolves suffix and open-ended ranges", () => {
    expect(resolveRange({ suffix: 512 }, 4096)).toEqual({
      offset: 3584,
      length: 512,
    });
    expect(resolveRange({ offset: 1024 }, 4096)).toEqual({
      offset: 1024,
      length: 3072,
    });
  });
});
