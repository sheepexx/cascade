import { describe, expect, it } from "vitest";
import { displayArtist, displaySong, displayTitle } from "./metadataDisplay";

const song = {
  title: "Yoiyami Hanabi",
  artist: "Kano",
  titleUnicode: "宵闇花火",
  artistUnicode: "カノ",
};

describe("metadata display", () => {
  it("shows the romanised names by default", () => {
    expect(displayTitle(song, false)).toBe("Yoiyami Hanabi");
    expect(displayArtist(song, false)).toBe("Kano");
    expect(displaySong(song, false)).toBe("Kano - Yoiyami Hanabi");
  });

  it("shows the original script when asked", () => {
    expect(displayTitle(song, true)).toBe("宵闇花火");
    expect(displayArtist(song, true)).toBe("カノ");
    expect(displaySong(song, true)).toBe("カノ - 宵闇花火");
  });

  it("falls back to the romanised name when there is no other", () => {
    const latin = { title: "Nhelv", artist: "Silentroom" };
    expect(displayTitle(latin, true)).toBe("Nhelv");
    expect(displayArtist(latin, true)).toBe("Silentroom");
    // Present but empty counts as absent, which is how the fields arrive from
    // a map that filled one in and left the other blank.
    expect(displayTitle({ ...latin, titleUnicode: "   " }, true)).toBe("Nhelv");
  });

  it("does not leave a separator dangling", () => {
    expect(displaySong({ title: "Untitled", artist: "" }, false)).toBe("Untitled");
    expect(displaySong({ title: "", artist: "Camellia" }, false)).toBe("Camellia");
    expect(displaySong(song, true, " – ")).toBe("カノ – 宵闇花火");
  });
});
