import { readFileSync, readdirSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  assertArchiveInputSize,
  loadSafeZip,
  type ArchiveLimits,
} from "./archiveLimits";

const generous: ArchiveLimits = {
  maxCompressedBytes: 1_000_000,
  maxEntries: 10,
  maxEntryBytes: 1_000_000,
  maxExpandedBytes: 1_000_000,
  maxCompressionRatio: 1_000,
};

async function archive(
  files: Record<string, string>,
  compression: "STORE" | "DEFLATE" = "STORE",
) {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: "uint8array", compression });
}

describe("archive limits", () => {
  it("accepts the compressed-size boundary and rejects one byte above it", () => {
    expect(assertArchiveInputSize(new Uint8Array(4), { ...generous, maxCompressedBytes: 4 }))
      .toBe(4);
    expect(() =>
      assertArchiveInputSize(new Uint8Array(5), { ...generous, maxCompressedBytes: 4 }),
    ).toThrow(/compressed size limit/i);
  });

  it("accepts the entry-count boundary and rejects the next entry", async () => {
    const bytes = await archive({ "one.txt": "1", "two.txt": "2" });
    await expect(loadSafeZip(bytes, { ...generous, maxEntries: 2 })).resolves.toBeDefined();
    await expect(loadSafeZip(bytes, { ...generous, maxEntries: 1 })).rejects.toThrow(
      /too many entries/i,
    );
  });

  it("enforces per-entry and total expanded-size boundaries", async () => {
    const one = await archive({ "one.txt": "1234" });
    await expect(
      loadSafeZip(one, { ...generous, maxEntryBytes: 4, maxExpandedBytes: 4 }),
    ).resolves.toBeDefined();
    await expect(loadSafeZip(one, { ...generous, maxEntryBytes: 3 })).rejects.toThrow(
      /entry exceeds/i,
    );

    const two = await archive({ "one.txt": "1234", "two.txt": "5678" });
    await expect(loadSafeZip(two, { ...generous, maxExpandedBytes: 7 })).rejects.toThrow(
      /total expanded/i,
    );
  });

  it("accepts empty entries, which JSZip holds without size metadata", async () => {
    const bytes = await archive({ "silent.ogg": "", "one.txt": "1" });
    await expect(loadSafeZip(bytes, generous)).resolves.toBeDefined();
  });

  it("accepts entries that legitimately compress far past 200:1", async () => {
    const bytes = await archive({ "flat.png": "0".repeat(100_000) }, "DEFLATE");
    await expect(loadSafeZip(bytes)).resolves.toBeDefined();
  });

  it("accepts the bundled preset skins at the default limits", async () => {
    const dir = new URL("../../skin/", import.meta.url);
    const presets = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".osk"));
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      const bytes = readFileSync(new URL(encodeURIComponent(preset), dir));
      await expect(loadSafeZip(bytes)).resolves.toBeDefined();
    }
  });

  it("rejects highly compressed expansion", async () => {
    const bytes = await archive({ "zeros.txt": "0".repeat(50_000) }, "DEFLATE");
    await expect(
      loadSafeZip(bytes, { ...generous, maxCompressionRatio: 10 }),
    ).rejects.toThrow(/compression ratio/i);
  });
});
