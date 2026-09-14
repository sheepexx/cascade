import { describe, expect, it } from "vitest";
import { assignPlaytestKey } from "./playtestKeybinds";

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

  it("takes a key from the lane using it and asks that lane again", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF", "KeyJ", "KeyK"], [3], "KeyD");
    expect(result.keys).toEqual(["", "KeyF", "KeyJ", "KeyD"]);
    expect(result.queue).toEqual([0]);
  });

  it("does not queue a stolen lane that is already coming up", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF", "KeyJ", "KeyK"], [0, 1, 2, 3], "KeyJ");
    expect(result.keys).toEqual(["KeyJ", "KeyF", "", "KeyK"]);
    expect(result.queue).toEqual([1, 2, 3]);
  });

  it("leaves a lane alone when it is given the key it already has", () => {
    const result = assignPlaytestKey(["KeyD", "KeyF"], [0, 1], "KeyD");
    expect(result.keys).toEqual(["KeyD", "KeyF"]);
    expect(result.queue).toEqual([1]);
  });

  it("does nothing once the queue is empty", () => {
    const keys = ["KeyD", "KeyF"];
    expect(assignPlaytestKey(keys, [], "KeyA")).toEqual({ keys, queue: [] });
  });
});
