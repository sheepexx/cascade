import { describe, expect, it } from "vitest";
import type { Translate } from "../../lib/i18n";
import type { TimingPoint } from "../../types";
import {
  drawPlayfieldBounds,
  drawSnapGrid,
  drawTimingMarkers,
  firstPointFrom,
  type PlayfieldFrame,
} from "./playfieldLayers";

/** Records the text and line widths a layer draws, ignoring everything else. */
function recordingContext() {
  const texts: string[] = [];
  const strokes: number[] = [];
  const target = {
    lineWidth: 1,
    fillText(text: string) {
      texts.push(text);
    },
    stroke() {
      strokes.push(target.lineWidth);
    },
    measureText(text: string) {
      return { width: text.length * 6 };
    },
  };
  const ctx = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key as keyof typeof obj];
      return () => {};
    },
    set(obj, key, value) {
      (obj as Record<string | symbol, unknown>)[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, strokes };
}

// One pixel per millisecond, time 0 at the bottom of a 1000px canvas.
const frame: PlayfieldFrame = {
  width: 800,
  height: 1000,
  originX: 200,
  playfieldWidth: 400,
  up: false,
  timeToY: (time) => 1000 - time,
  yToTime: (y) => 1000 - y,
};
const t: Translate = (key) => key;

function point(time: number, fields: Partial<TimingPoint>): TimingPoint {
  return {
    id: `tp-${time}`,
    time,
    uninherited: true,
    bpm: 120,
    sv: 1,
    meter: 4,
    sampleSet: 0,
    sampleIndex: 0,
    volume: 100,
    kiai: false,
    omitFirstBarline: false,
    ...fields,
  };
}

describe("firstPointFrom", () => {
  const list = [point(0, {}), point(100, {}), point(100, {}), point(300, {})];
  it("finds the first point at or after a time", () => {
    expect(firstPointFrom(list, -5)).toBe(0);
    expect(firstPointFrom(list, 100)).toBe(1);
    expect(firstPointFrom(list, 101)).toBe(3);
    expect(firstPointFrom(list, 999)).toBe(4);
    expect(firstPointFrom([], 0)).toBe(0);
  });
});

describe("drawSnapGrid", () => {
  it("strokes each visible line twice, heavier for barlines, and skips the rest", () => {
    const { ctx, strokes } = recordingContext();
    drawSnapGrid(
      ctx,
      frame,
      [
        { time: 0, idxInBeat: 0, barline: true },
        { time: 250, idxInBeat: 1, barline: false },
        { time: 5000, idxInBeat: 0, barline: false },
      ],
      4,
    );
    expect(strokes).toEqual([5, 1.5, 4, 1]);
  });
});

describe("drawPlayfieldBounds", () => {
  it("labels the song start always and the other edges only when set", () => {
    const { ctx, texts } = recordingContext();
    drawPlayfieldBounds(ctx, frame, t, {});
    expect(texts).toEqual(["editor.songStart"]);
  });

  it("leaves out a trim end that sits on the song end", () => {
    const { ctx, texts } = recordingContext();
    drawPlayfieldBounds(ctx, frame, t, { songEndMs: 900, trimStartMs: 100, trimEndMs: 900 });
    expect(texts).toEqual(["editor.songStart", "editor.songEnd", "editor.trimStart"]);
  });

  it("draws an earlier trim end", () => {
    const { ctx, texts } = recordingContext();
    drawPlayfieldBounds(ctx, frame, t, { songEndMs: 900, trimEndMs: 600 });
    expect(texts).toContain("editor.trimEnd");
  });
});

describe("drawTimingMarkers", () => {
  it("labels BPM and SV changes, the preview point and bookmarks on screen", () => {
    const { ctx, texts } = recordingContext();
    drawTimingMarkers(ctx, frame, t, {
      timingPoints: [
        point(100, { bpm: 180 }),
        point(400, { uninherited: false, sv: 0.5 }),
        point(5000, { bpm: 200 }),
      ],
      previewTime: 500,
      bookmarks: [700, 4000],
    });
    expect(texts.filter((x) => x.includes("BPM"))).toHaveLength(1);
    expect(texts.some((x) => x.includes("SV"))).toBe(true);
    expect(texts.filter((x) => x === "editor.bookmark")).toHaveLength(1);
    expect(texts).toContain("editor.previewPoint");
  });

  it("has no preview line when the map has no preview point", () => {
    const { ctx, texts } = recordingContext();
    drawTimingMarkers(ctx, frame, t, { timingPoints: [], previewTime: -1 });
    expect(texts).toEqual([]);
  });
});
