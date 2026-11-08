import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPlacementTool,
  savePlacementTool,
  togglePlacementTool,
  toggleSelectTool,
} from "./placementTool";

describe("toggleSelectTool", () => {
  it("goes to Select and back to the placement tool used last", () => {
    expect(toggleSelectTool("note", "note")).toBe("select");
    expect(toggleSelectTool("hold", "hold")).toBe("select");
    expect(toggleSelectTool("select", "note")).toBe("note");
    expect(toggleSelectTool("select", "hold")).toBe("hold");
  });
});

describe("togglePlacementTool", () => {
  it("swaps Note and Hold", () => {
    expect(togglePlacementTool("note", "note")).toBe("hold");
    expect(togglePlacementTool("hold", "hold")).toBe("note");
  });

  it("from Select, switches to the tool that wasn't used last", () => {
    expect(togglePlacementTool("select", "hold")).toBe("note");
    expect(togglePlacementTool("select", "note")).toBe("hold");
  });
});

describe("placement tool storage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("remembers Note and falls back to Hold", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    expect(loadPlacementTool()).toBe("hold");
    savePlacementTool("note");
    expect(loadPlacementTool()).toBe("note");
    store.set("mania-editor:placement-tool", "junk");
    expect(loadPlacementTool()).toBe("hold");
  });

  it("still works when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadPlacementTool()).toBe("hold");
    expect(() => savePlacementTool("note")).not.toThrow();
  });
});
