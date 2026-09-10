import { describe, expect, it } from "vitest";
import { portableArtifact } from "./portableUpdate";

const manifest = (version: string, portable: unknown) => ({
  version,
  platforms: { windows: { portable } },
});

describe("portableArtifact", () => {
  it("picks the signed portable download for the offered version", () => {
    const artifact = portableArtifact(
      manifest("1.2.293", {
        name: "Cascade_1.2.293_portable.exe",
        size: 26_000_000,
        signature: "portable-signature",
      }),
      "1.2.293",
    );
    expect(artifact).toEqual({
      name: "Cascade_1.2.293_portable.exe",
      signature: "portable-signature",
    });
  });

  it("refuses a manifest that has moved on to another version", () => {
    const asset = { name: "Cascade_1.2.294_portable.exe", signature: "s" };
    expect(portableArtifact(manifest("1.2.294", asset), "1.2.293")).toBeNull();
  });

  it("refuses an unsigned or missing portable download", () => {
    expect(
      portableArtifact(
        manifest("1.2.293", { name: "Cascade_1.2.293_portable.exe" }),
        "1.2.293",
      ),
    ).toBeNull();
    expect(portableArtifact(manifest("1.2.293", undefined), "1.2.293")).toBeNull();
    expect(portableArtifact(null, "1.2.293")).toBeNull();
    expect(portableArtifact({ files: {} }, "1.2.293")).toBeNull();
  });
});
