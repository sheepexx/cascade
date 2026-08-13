import { describe, expect, it } from "vitest";
import { resolveRange } from "./storage";

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
