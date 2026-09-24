import { describe, expect, it } from "vitest";
import { makeDifficulty, makeRedPoint, type Difficulty, type ManiaNote } from "../types";
import {
  BUILT_IN_MAP_CARD_PRESETS,
  DEFAULT_MAP_CARD_CONFIG,
  MAP_CARD_STATS,
  buildMapCardData,
  cleanPresetName,
  mapCardBbcode,
  mapCardConfigsEqual,
  mapCardFilename,
  mapCardKey,
  mapCardMsdStatus,
  normalizeMapCardConfig,
  type MapCardConfig,
  type MapCardData,
} from "./mapCard";
import { mapCardAccent, planMapCard, type MapCardImages } from "./mapCardRender";
import type { MsdRating } from "./msd/minacalc";

function stream(count: number, keyCount = 4, stepMs = 125): ManiaNote[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    column: i % keyCount,
    startTime: 1000 + i * stepMs,
  }));
}

function difficulty(overrides: Partial<Difficulty> = {}): Difficulty {
  return { ...makeDifficulty("Insane", 4), notes: stream(64), ...overrides };
}

const RATING: MsdRating = {
  overall: 24.5,
  stream: 24.1,
  jumpstream: 20.3,
  handstream: 18.2,
  stamina: 22.7,
  jackspeed: 12.4,
  chordjack: 15.9,
  technical: 21.6,
};

const META = { title: "Galaxy Collapse", artist: "Kurokotei", creator: "Mapper" };

function data(overrides: Partial<MapCardData> = {}): MapCardData {
  return {
    ...buildMapCardData({
      meta: META,
      difficulty: difficulty({ notes: [...stream(60), { id: "h", column: 1, startTime: 9000, endTime: 9500 }] }),
      timingPoints: [makeRedPoint(0, 180)],
      msd: RATING,
    }),
    ...overrides,
  };
}

function fakeContext(): CanvasRenderingContext2D {
  let font = "10px sans-serif";
  return {
    get font() {
      return font;
    },
    set font(value: string) {
      font = value;
    },
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
      return { width: text.length * size * 0.55 } as TextMetrics;
    },
  } as unknown as CanvasRenderingContext2D;
}

const WITH_IMAGE = { background: {} as HTMLImageElement } satisfies MapCardImages;
const NO_IMAGE: MapCardImages = { background: null };

function config(overrides: Partial<MapCardConfig> = {}): MapCardConfig {
  return { ...DEFAULT_MAP_CARD_CONFIG, ...overrides };
}

describe("map card config", () => {
  it("falls back to the defaults for anything that is not an object", () => {
    for (const value of [null, undefined, 3, "x", []]) {
      expect(normalizeMapCardConfig(value)).toEqual(DEFAULT_MAP_CARD_CONFIG);
    }
  });

  it("clamps numbers and rejects unknown enum values", () => {
    const normalized = normalizeMapCardConfig({
      backgroundMode: "video",
      blur: 400,
      overlayOpacity: -2,
      layout: "compact",
      skillsetStyle: "radar",
      accent: "#ff00ff",
      showBranding: "yes",
    });
    expect(normalized.backgroundMode).toBe(DEFAULT_MAP_CARD_CONFIG.backgroundMode);
    expect(normalized.blur).toBe(24);
    expect(normalized.overlayOpacity).toBe(0);
    expect(normalized.layout).toBe("compact");
    expect(normalized.skillsetStyle).toBe(DEFAULT_MAP_CARD_CONFIG.skillsetStyle);
    expect(normalized.accent).toBe(DEFAULT_MAP_CARD_CONFIG.accent);
    expect(normalized.showBranding).toBe(true);
  });

  it("keeps known stat toggles and drops unknown ones", () => {
    const normalized = normalizeMapCardConfig({
      visibleStats: { bpm: false, msd: false, secret: false, notes: "no" },
    });
    expect(normalized.visibleStats.bpm).toBe(false);
    expect(normalized.visibleStats.msd).toBe(false);
    expect(normalized.visibleStats.notes).toBe(true);
    expect(Object.keys(normalized.visibleStats).sort()).toEqual([...MAP_CARD_STATS].sort());
  });

  it("ships built-in presets that are valid and all different", () => {
    for (const preset of BUILT_IN_MAP_CARD_PRESETS) {
      expect(mapCardConfigsEqual(normalizeMapCardConfig(preset.config), preset.config)).toBe(true);
    }
    for (const a of BUILT_IN_MAP_CARD_PRESETS) {
      for (const b of BUILT_IN_MAP_CARD_PRESETS) {
        if (a !== b) expect(mapCardConfigsEqual(a.config, b.config)).toBe(false);
      }
    }
  });

  it("survives a JSON round trip, the way presets are stored", () => {
    const original = BUILT_IN_MAP_CARD_PRESETS[4].config;
    const restored = normalizeMapCardConfig(JSON.parse(JSON.stringify(original)));
    expect(mapCardConfigsEqual(restored, original)).toBe(true);
  });

  it("cleans preset names", () => {
    expect(cleanPresetName("  My   tourney\tstyle  ")).toBe("My tourney style");
    expect(cleanPresetName("x".repeat(80))).toHaveLength(40);
  });
});

describe("map card data", () => {
  it("reads the metadata and reuses the map statistics", () => {
    const card = data();
    expect(card.title).toBe("Galaxy Collapse");
    expect(card.artist).toBe("Kurokotei");
    expect(card.difficultyName).toBe("Insane");
    expect(card.keyCount).toBe(4);
    expect(card.notes).toBe(61);
    expect(card.holds).toBe(1);
    expect(card.bpm).toBe(180);
    expect(card.bpmMin).toBeNull();
    expect(card.starRating).toBeGreaterThan(0);
    expect(card.msd).toEqual(RATING);
  });

  it("reports a BPM range only when the tempo changes", () => {
    const card = buildMapCardData({
      meta: META,
      difficulty: difficulty({ notes: stream(200) }),
      timingPoints: [makeRedPoint(0, 150), makeRedPoint(2000, 200)],
      msd: null,
    });
    expect(card.bpm).toBe(200);
    expect(card.bpmMin).toBe(150);
    expect(card.bpmMax).toBe(200);
  });

  it("falls back to placeholders for blank metadata", () => {
    const card = buildMapCardData({
      meta: { title: "  ", artist: "", creator: "" },
      difficulty: difficulty({ name: " " }),
      timingPoints: [],
      msd: { ...RATING, overall: 0 },
    });
    expect(card.title).toBe("Untitled");
    expect(card.difficultyName).toBe("Unnamed");
    expect(card.bpm).toBeNull();
    expect(card.msd).toBeNull();
  });
});

describe("map card MSD status", () => {
  it("separates unsupported, empty, pending, failed and ready", () => {
    expect(mapCardMsdStatus(difficulty({ keyCount: 5 }), undefined)).toBe("unsupported");
    expect(mapCardMsdStatus(difficulty({ notes: [] }), undefined)).toBe("empty");
    expect(mapCardMsdStatus(difficulty(), undefined)).toBe("loading");
    expect(mapCardMsdStatus(difficulty(), null)).toBe("failed");
    expect(mapCardMsdStatus(difficulty(), { ...RATING, overall: 0 })).toBe("empty");
    expect(mapCardMsdStatus(difficulty(), RATING)).toBe("ready");
  });
});

describe("hosted map card keys", () => {
  const worker = /^[A-Za-z0-9_.:-]{1,200}$/;

  it("prefers the submitted beatmap id so re-imports keep the same link", () => {
    expect(mapCardKey({ projectId: "local-abc", difficulty: { id: "diff_1", beatmapId: 4123 } })).toBe(
      "osu-4123",
    );
  });

  it("falls back to the project and difficulty, in the worker's alphabet", () => {
    const key = mapCardKey({
      projectId: "local-0f8e/../weird id",
      difficulty: { id: "diff_lx2_1 ✓" },
    });
    expect(key).toBe("local-0f8e..weirdid.diff_lx2_1");
    expect(key).toMatch(worker);
    expect(
      mapCardKey({ projectId: "x".repeat(300), difficulty: { id: "y".repeat(300) } }),
    ).toMatch(worker);
  });
});

describe("map card exports", () => {
  it("names the PNG after the difficulty", () => {
    expect(mapCardFilename(META, difficulty())).toBe(
      "Kurokotei - Galaxy Collapse (Mapper) [Insane] card.png",
    );
  });

  it("wraps the hosted link for osu! descriptions", () => {
    expect(mapCardBbcode("https://cascade.sheepex.net/card/abc.png")).toBe(
      "[img]https://cascade.sheepex.net/card/abc.png[/img]",
    );
  });
});

describe("map card layout", () => {
  const ctx = fakeContext();

  it("stacks header, skillsets, stats and footer in the detailed layout", () => {
    const plan = planMapCard(ctx, data(), config(), WITH_IMAGE);
    expect(plan.mode).toBe("banner");
    expect(plan.header.h).toBe(212);
    expect(plan.skills).toEqual({ y: 226, h: 164 });
    expect(plan.stats).toEqual({ y: 404, h: 66 });
    expect(plan.footer).toEqual({ y: 470, h: 46 });
    expect(plan.height).toBe(516);
    expect(plan.items.map((item) => item.label)).toEqual([
      "BPM",
      "Length",
      "Notes",
      "Long notes",
      "NPS",
      "OD / HP",
    ]);
  });

  it("uses the plain style when a background mode has no image", () => {
    const plan = planMapCard(ctx, data(), config({ backgroundMode: "full" }), NO_IMAGE);
    expect(plan.mode).toBe("none");
    expect(plan.header.contentTop).toBe(28);
  });

  it("drops the skillsets when MSD is missing or hidden", () => {
    expect(planMapCard(ctx, data({ msd: null }), config(), WITH_IMAGE).skills).toBeNull();
    const hidden = config({ visibleStats: { ...DEFAULT_MAP_CARD_CONFIG.visibleStats, msd: false } });
    expect(planMapCard(ctx, data(), hidden, WITH_IMAGE).skills).toBeNull();
  });

  it("drops the long note stat for rice-only maps", () => {
    const plan = planMapCard(ctx, data({ holds: 0, lnRatio: 0 }), config(), WITH_IMAGE);
    expect(plan.items.map((item) => item.label)).not.toContain("Long notes");
  });

  it("ends on padding instead of the footer when branding is off", () => {
    const withFooter = planMapCard(ctx, data(), config(), NO_IMAGE);
    const without = planMapCard(ctx, data(), config({ showBranding: false }), NO_IMAGE);
    expect(without.footer).toBeNull();
    expect(without.height).toBe(withFooter.height - 46 + 28);
  });

  it("makes the compact layout shorter for every skillset style", () => {
    for (const skillsetStyle of ["bars", "tiles", "pills"] as const) {
      const detailed = planMapCard(ctx, data(), config({ skillsetStyle }), WITH_IMAGE);
      const compact = planMapCard(ctx, data(), config({ skillsetStyle, layout: "compact" }), WITH_IMAGE);
      expect(compact.height).toBeLessThan(detailed.height);
    }
  });

  it("wraps pills onto whole rows", () => {
    const plan = planMapCard(ctx, data(), config({ skillsetStyle: "pills" }), WITH_IMAGE);
    const rows = ((plan.skills?.h ?? 0) + 8) / (30 + 8);
    expect(Number.isInteger(rows)).toBe(true);
    expect(rows).toBeGreaterThanOrEqual(1);
  });

  it("keeps a readable accent when the star colour turns black", () => {
    expect(mapCardAccent(config({ accent: "difficulty" }), data({ starRating: 12 }))).toBe("#f2c14e");
    expect(mapCardAccent(config({ accent: "blue" }), data())).toBe("#5bc0ff");
  });
});
