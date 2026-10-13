import { describe, expect, it } from "vitest";
import { gifInMessage, toGif } from "./klipy";
import { searchEmoji, type EmojiGroup } from "./emoji";

describe("gifInMessage", () => {
  it("recognizes a message that is only a KLIPY media URL", () => {
    const url = "https://static.klipy.com/ii/935d7ab9d8c6202580a668421940ec81/14/af/eUbp2uNc.webp";
    expect(gifInMessage(url)).toBe(url);
    expect(gifInMessage(`  ${url}\n`)).toBe(url);
    expect(gifInMessage("https://static2.klipy.com/ii/a/b.gif")).toBe("https://static2.klipy.com/ii/a/b.gif");
  });

  it("leaves everything else as text", () => {
    expect(gifInMessage("look https://static.klipy.com/ii/a/b.gif")).toBeNull();
    expect(gifInMessage("http://static.klipy.com/ii/a/b.gif")).toBeNull();
    expect(gifInMessage("https://static.klipy.com.evil.example/a.gif")).toBeNull();
    expect(gifInMessage("https://evil.example/static.klipy.com/a.gif")).toBeNull();
    expect(gifInMessage("https://static.klipy.com/ii/a/b.mp4")).toBeNull();
    expect(gifInMessage("https://klipy.com/gifs/hello")).toBeNull();
    expect(gifInMessage("hello")).toBeNull();
    expect(gifInMessage("")).toBeNull();
  });
});

describe("toGif", () => {
  const media = (name: string) => ({ url: `https://static.klipy.com/${name}`, width: 200, height: 100 });

  it("prefers webp, small for the grid and medium to send", () => {
    const gif = toGif({
      id: 1,
      slug: "hello-hi-662",
      title: "Hello",
      file: {
        md: { gif: media("md.gif"), webp: media("md.webp") },
        sm: { gif: media("sm.gif"), webp: media("sm.webp") },
      },
    });
    expect(gif).toMatchObject({ slug: "hello-hi-662", preview: { url: media("sm.webp").url }, full: { url: media("md.webp").url } });
  });

  it("falls back across sizes and formats, and skips items without media", () => {
    expect(toGif({ id: 2, slug: "x", file: { hd: { gif: media("hd.gif") } } })).toMatchObject({
      preview: { url: media("hd.gif").url },
      full: { url: media("hd.gif").url },
    });
    expect(toGif({ id: 3, slug: "y", file: { md: { mp4: media("md.mp4") } } })).toBeNull();
    expect(toGif({ id: 4, slug: "z" })).toBeNull();
  });
});

describe("searchEmoji", () => {
  const groups: EmojiGroup[] = [
    {
      id: 0,
      emojis: [
        { unicode: "😂", label: "face with tears of joy", search: "face with tears of joy laugh lol" },
        { unicode: "🔥", label: "fire", search: "fire flame hot lit" },
      ],
    },
  ];

  it("matches every word against names and tags", () => {
    expect(searchEmoji(groups, "FIRE").map((e) => e.unicode)).toEqual(["🔥"]);
    expect(searchEmoji(groups, "tears joy").map((e) => e.unicode)).toEqual(["😂"]);
    expect(searchEmoji(groups, "fire joy")).toEqual([]);
    expect(searchEmoji(groups, "   ")).toEqual([]);
  });
});
