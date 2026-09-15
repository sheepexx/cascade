import { describe, expect, it } from "vitest";
import {
  assertFolderEntry,
  assertTextImportSize,
  MAX_FOLDER_BYTES,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_FILES,
  MAX_TEXT_IMPORT_BYTES,
} from "./importLimits";

describe("import limits", () => {
  it("rejects oversized raw text maps before reading them", () => {
    expect(() =>
      assertTextImportSize({ name: "huge.sm", size: MAX_TEXT_IMPORT_BYTES + 1 }),
    ).toThrow(/text-map limit/);
  });

  it("caps folder count, bytes and recursion depth", () => {
    expect(() => assertFolderEntry(MAX_FOLDER_FILES, 0, 1, 0)).toThrow(/too many/);
    expect(() => assertFolderEntry(0, MAX_FOLDER_BYTES, 1, 0)).toThrow(/size limit/);
    expect(() => assertFolderEntry(0, 0, 1, MAX_FOLDER_DEPTH + 1)).toThrow(/deep/);
  });
});
