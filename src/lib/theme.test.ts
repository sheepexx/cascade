import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  hexToRgb,
  normalizeTheme,
  themeVariables,
  usableBackground,
} from "./theme";

const close = (a: string, b: string) => {
  const x = a.split(" ").map(Number);
  const y = b.split(" ").map(Number);
  return x.every((v, i) => Math.abs(v - y[i]) <= 1);
};

describe("themeVariables", () => {
  it("rebuilds the stylesheet's own palette from the default theme", () => {
    const vars = themeVariables(DEFAULT_THEME);
    expect(close(vars["--ink-950"], "9 9 13")).toBe(true);
    expect(close(vars["--ink-900"], "13 13 18")).toBe(true);
    expect(close(vars["--ink-400"], "62 62 76")).toBe(true);
    expect(close(vars["--slate-400"], "158 157 173")).toBe(true);
    expect(vars["--accent-rgb"]).toBe("232 104 104");
  });

  it("keeps every preset's shades stepping lighter", () => {
    for (const preset of THEME_PRESETS) {
      const vars = themeVariables({ preset: preset.id, ...preset });
      const light = [950, 900, 800, 700, 600, 500, 400].map((shade) =>
        vars[`--ink-${shade}`].split(" ").map(Number).reduce((a, b) => a + b, 0),
      );
      for (let i = 1; i < light.length; i++) expect(light[i]).toBeGreaterThan(light[i - 1]);
    }
  });
});

describe("usableBackground", () => {
  it("leaves dark grounds alone and darkens pale ones", () => {
    expect(usableBackground("#0a0f17")).toBe("#0a0f17");
    const fixed = hexToRgb(usableBackground("#f0f0f0"));
    expect(Math.max(...fixed)).toBeLessThan(80);
  });
});

describe("normalizeTheme", () => {
  it("falls back per field", () => {
    expect(normalizeTheme(null)).toEqual(DEFAULT_THEME);
    expect(normalizeTheme({ preset: "custom", accent: "#ABCDEF", background: "nope" })).toEqual({
      preset: "custom",
      accent: "#abcdef",
      background: DEFAULT_THEME.background,
    });
  });
});
