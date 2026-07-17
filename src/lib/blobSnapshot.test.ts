import { describe, it, expect } from "vitest";
import { snapshotBlob, snapshotBlobMap } from "./blobSnapshot";

describe("snapshotBlob", () => {
  it("copies a File into a plain in-memory Blob", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.mp3", {
      type: "audio/mpeg",
    });
    const copy = await snapshotBlob(file);
    expect(copy).not.toBe(file);
    expect(copy instanceof File).toBe(false);
    expect(copy.type).toBe("audio/mpeg");
    expect(new Uint8Array(await copy.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("returns non-File blobs unchanged", async () => {
    const blob = new Blob([new Uint8Array([9])], { type: "image/png" });
    expect(await snapshotBlob(blob)).toBe(blob);
  });

  it("falls back to the original File when it cannot be read", async () => {
    const file = new File([], "gone.mp3", { type: "audio/mpeg" });
    file.arrayBuffer = () => Promise.reject(new DOMException("aborted"));
    expect(await snapshotBlob(file)).toBe(file);
  });
});

describe("snapshotBlobMap", () => {
  it("copies every File in the record", async () => {
    const file = new File([new Uint8Array([5])], "b.ogg", {
      type: "audio/ogg",
    });
    const blob = new Blob([new Uint8Array([6])]);
    const out = await snapshotBlobMap({ "b.ogg": file, "c.png": blob });
    expect(out["b.ogg"]).not.toBe(file);
    expect(out["c.png"]).toBe(blob);
    expect(new Uint8Array(await out["b.ogg"].arrayBuffer())).toEqual(
      new Uint8Array([5]),
    );
  });
});
