import { describe, expect, it } from "vitest";
import { assignPlaytestKey, settlePlaytestKeys } from "./playtestKeybinds";

describe("assignPlaytestKey", () => {
  it("binds the key and moves on to the next lane", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF", "KeyJ", "KeyK"], [0, 1, 2, 3], "KeyA");
    expect(result.keys).toEqual(["KeyA", "KeyF", "KeyJ", "KeyK"]);
    expect(result.queue).toEqual([1, 2, 3]);
  });

  it("finishes after the last lane", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF"], [1], "KeyL");
    expect(result.keys).toEqual(["KeyD", "KeyL"]);
    expect(result.queue).toEqual([]);
  });

  it("takes a key from a lane outside the pass and asks that lane again", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF", "KeyJ", "KeyK"], [3], "KeyD");
    expect(result.keys).toEqual(["", "KeyF", "KeyJ", "KeyD"]);
    expect(result.queue).toEqual([0]);
  });

  it("types over keys that later lanes still hold, like osu!stable", () => {
    let state = { keys: ["KeyD", "KeyF", "KeyJ", "KeyK"], queue: [0, 1, 2, 3], typed: [] as number[] };
    for (const code of ["KeyS", "KeyD", "KeyK", "KeyL"]) {
      state = assignPlaytestKey(state.keys, state.queue, code, state.typed);
    }
    expect(state.keys).toEqual(["KeyS", "KeyD", "KeyK", "KeyL"]);
    expect(state.queue).toEqual([]);
  });

  it("keeps a later lane's key until the pass reaches it", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF", "KeyJ", "KeyK"], [0, 1, 2, 3], "KeyJ");
    expect(result.keys).toEqual(["KeyJ", "KeyF", "KeyJ", "KeyK"]);
    expect(result.queue).toEqual([1, 2, 3]);
  });

  it("moves a key that was already typed in this pass", () => {
    const result = assignPlaytestKey(["KeyS", "KeyF", "KeyJ", "KeyK"], [1, 2, 3], "KeyS", [0]);
    expect(result.keys).toEqual(["", "KeyS", "KeyJ", "KeyK"]);
    expect(result.queue).toEqual([2, 3, 0]);
  });

  it("settles clashes with untouched lanes when a pass stops early", () => {
    expect(settlePlaytestKeys(["KeyS", "KeyD", "KeyJ", "KeyD"], [0, 1])).toEqual({
      keys: ["KeyS", "KeyD", "KeyJ", ""],
      cleared: [3],
    });
  });

  it("leaves a lane alone when it is given the key it already has", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF"], [0, 1], "KeyD");
    expect(result.keys).toEqual(["KeyD", "KeyF"]);
    expect(result.queue).toEqual([1]);
  });

  it("does nothing once the queue is empty", () => {
    const keys = ["KeyD", "KeyF"];
    expect(assignPlaytestKey(keys, [], "KeyA")).toEqual({ keys, queue: [], typed: [] });
  });
});
