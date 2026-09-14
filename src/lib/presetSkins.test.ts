import { describe, expect, it } from "vitest";
import { PRESET_SKINS } from "./presetSkins";

describe("PRESET_SKINS", () => {
  it("finds the skins bundled in the repository's skin folder", () => {
    expect(PRESET_SKINS.length).toBeGreaterThan(0);
    for (const preset of PRESET_SKINS) {
      expect(preset.fileName).toMatch(/\.osk$/i);
      expect(preset.name).toBe(preset.fileName.replace(/\.osk$/i, ""));
    }
  });
});
