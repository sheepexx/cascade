import { describe, expect, it } from "vitest";
import { ownBlob } from "./ownedBlobs";

describe("ownBlob", () => {
  it("copies the bytes and keeps the type and file name", async () => {
    const file = new File(["song bytes"], "song.mp3", { type: "audio/mpeg" });
    const copy = await ownBlob(file);
    expect(copy).not.toBe(file);
    expect(copy).toBeInstanceOf(File);
    expect((copy as File).name).toBe("song.mp3");
    expect(copy.type).toBe("audio/mpeg");
    expect(await copy.text()).toBe("song bytes");
  });

  it("copies a plain Blob", async () => {
    const copy = await ownBlob(new Blob(["img"], { type: "image/jpeg" }));
    expect(copy).not.toBeInstanceOf(File);
    expect(copy.type).toBe("image/jpeg");
    expect(await copy.text()).toBe("img");
  });
});
