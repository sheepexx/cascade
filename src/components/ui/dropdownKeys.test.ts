import { describe, expect, it } from "vitest";
import { dropdownKeyTarget } from "./dropdownKeys";

const list = (...disabled: boolean[]) => disabled.map((d) => ({ disabled: d }));

describe("dropdownKeyTarget", () => {
  it("doesn't move onto WASAPI exclusive where it is disabled", () => {
    // Audio setup's output mode in a browser: shared, then exclusive (disabled).
    expect(dropdownKeyTarget(list(false, true), 0, "ArrowDown")).toBeNull();
    expect(dropdownKeyTarget(list(false, true), 0, "End")).toBe(0);
  });

  it("skips a disabled option with ArrowDown and ArrowUp", () => {
    const options = list(false, true, false);
    expect(dropdownKeyTarget(options, 0, "ArrowDown")).toBe(2);
    expect(dropdownKeyTarget(options, 2, "ArrowUp")).toBe(0);
  });

  it("stays put at either end or when only disabled options are left", () => {
    const options = list(false, true);
    expect(dropdownKeyTarget(options, 0, "ArrowDown")).toBeNull();
    expect(dropdownKeyTarget(list(true, false), 1, "ArrowUp")).toBeNull();
    expect(dropdownKeyTarget(list(false, false), 1, "ArrowDown")).toBeNull();
  });

  it("goes to the first and last enabled options with Home and End", () => {
    const options = list(true, false, false, true);
    expect(dropdownKeyTarget(options, 2, "Home")).toBe(1);
    expect(dropdownKeyTarget(options, 1, "End")).toBe(2);
  });

  it("handles an empty list and a list with every option disabled", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect(dropdownKeyTarget([], -1, key)).toBeNull();
      expect(dropdownKeyTarget(list(true, true), 0, key)).toBeNull();
    }
  });

  it("starts from the ends when nothing is selected", () => {
    const options = list(false, false, true);
    expect(dropdownKeyTarget(options, -1, "ArrowDown")).toBe(0);
    expect(dropdownKeyTarget(options, -1, "ArrowUp")).toBe(1);
  });

  it("ignores other keys", () => {
    expect(dropdownKeyTarget(list(false, false), 0, "a")).toBeNull();
  });
});
