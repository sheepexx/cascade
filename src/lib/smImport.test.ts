import { describe, it, expect } from "vitest";
import { parseSmFile } from "./smImport";

const SSC = `#VERSION:0.83;
#TITLE:Test Song;
#ARTIST:Tester;
#MUSIC:song.ogg;
#OFFSET:-0.050;
#SAMPLESTART:20.0;
#BPMS:0=180.000;
#BACKGROUND:bg.png;
#CREDIT:Charter;

#NOTEDATA:;
#CHARTNAME:My Chart;
#STEPSTYPE:dance-single;
#DIFFICULTY:Challenge;
#METER:15;
#NOTES:
0000
0000
0000
0000
,
1000
0100
0010
0001
;
#NOTEDATA:;
#STEPSTYPE:kb7-single;
#DIFFICULTY:Hard;
#METER:9;
#NOTES:
2000000
0000000
3000000
0000000
;
`;

const SM = `#TITLE:SM Song;
#ARTIST:Someone;
#MUSIC:a.ogg;
#OFFSET:0.000;
#BPMS:0=120.000;
#NOTES:
     dance-single:
     :
     Hard:
     10:
     0,0,0,0,0:
0000
1000
0000
0000
;
`;

describe("parseSmFile — .ssc (Etterna)", () => {
  const parsed = parseSmFile(SSC);

  it("reads song-level metadata and assets", () => {
    expect(parsed.meta.title).toBe("Test Song");
    expect(parsed.meta.artist).toBe("Tester");
    expect(parsed.audioFilename).toBe("song.ogg");
    expect(parsed.backgroundFilename).toBe("bg.png");
  });

  it("parses one difficulty per #NOTEDATA block", () => {
    expect(parsed.difficulties).toHaveLength(2);
  });

  it("uses the chart name and steptype key count", () => {
    const [d1, d2] = parsed.difficulties;
    expect(d1.name).toBe("My Chart");
    expect(d1.keyCount).toBe(4);
    expect(d2.name).toBe("Hard");
    expect(d2.keyCount).toBe(7);
  });

  it("parses measure rows into notes (no dropped .ssc header)", () => {
    const [d1] = parsed.difficulties;
    expect(d1.notes).toHaveLength(4);
    expect(d1.notes.map((n) => n.column)).toEqual([0, 1, 2, 3]);
  });

  it("turns a 2→3 pair into a single long note", () => {
    const d2 = parsed.difficulties[1];
    expect(d2.notes).toHaveLength(1);
    expect(d2.notes[0].column).toBe(0);
    expect(d2.notes[0].endTime).toBeGreaterThan(d2.notes[0].startTime);
  });
});

describe("parseSmFile — .sm still works after the refactor", () => {
  const parsed = parseSmFile(SM);

  it("reads metadata and a single chart", () => {
    expect(parsed.meta.title).toBe("SM Song");
    expect(parsed.difficulties).toHaveLength(1);
    expect(parsed.difficulties[0].keyCount).toBe(4);
  });

  it("parses the inline-header note section", () => {
    const notes = parsed.difficulties[0].notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].column).toBe(0);
  });
});
