import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecentCommands, orderByRecency, rememberCommand } from "./commandRecents";

type Entry = { id: string; disabled?: boolean };

const entries: Entry[] = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d", disabled: true },
];

const order = (items: Entry[]) => items.map((i) => i.id);

describe("orderByRecency", () => {
  it("leaves the list alone when nothing has been run", () => {
    expect(order(orderByRecency(entries, []))).toEqual(["a", "b", "c", "d"]);
  });

  it("lifts recent entries to the top, newest first", () => {
    expect(order(orderByRecency(entries, ["c", "a"]))).toEqual(["c", "a", "b", "d"]);
  });

  it("keeps unrecognised ids from disturbing the order", () => {
    expect(order(orderByRecency(entries, ["gone"]))).toEqual(["a", "b", "c", "d"]);
  });

  it("never promotes a disabled entry", () => {
    expect(order(orderByRecency(entries, ["d", "b"]))).toEqual(["b", "a", "c", "d"]);
  });
});

/** The suite runs on plain node, which has no localStorage of its own. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("rememberCommand", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("moves a repeat run back to the front without duplicating it", () => {
    expect(rememberCommand("b", ["a", "b"])).toEqual(["b", "a"]);
  });

  it("caps the list at eight", () => {
    const many = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(rememberCommand("new", many)).toHaveLength(8);
    expect(rememberCommand("new", many)[0]).toBe("new");
  });

  it("round-trips through storage", () => {
    rememberCommand("save");
    expect(loadRecentCommands()).toEqual(["save"]);
  });

  it("survives storage being unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadRecentCommands()).toEqual([]);
    expect(rememberCommand("x", ["y"])).toEqual(["x", "y"]);
  });
});
