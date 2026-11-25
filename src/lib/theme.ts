/**
 * Theme colours: an accent and a background, picked from a preset or set by
 * hand. The background becomes the whole ink scale (canvas well to raised
 * layers) and tints the neutral text a touch toward its hue; the accent
 * becomes the accent and its soft and deep steps. Everything is written as
 * CSS custom properties on <html>, which the Tailwind scales already read.
 *
 * Shades are derived in OKLab, keeping the lightness steps of the default
 * palette, so any hue gets the same contrast as the original. Backgrounds are
 * kept dark: the interface's text is light, and a pale ground would lose it.
 */

export type ThemePresetId = "cascade" | "ocean" | "orchid";

export type ThemeSettings = {
  /** The preset last picked, or "custom" once a colour is set by hand. */
  preset: ThemePresetId | "custom";
  /** #rrggbb */
  accent: string;
  /** #rrggbb, the application ground (ink-900). */
  background: string;
};

export const THEME_PRESETS: { id: ThemePresetId; accent: string; background: string }[] = [
  { id: "cascade", accent: "#e86868", background: "#0d0d12" },
  { id: "ocean", accent: "#4ea4f5", background: "#0a0f17" },
  { id: "orchid", accent: "#b38cf5", background: "#100c16" },
];

export const DEFAULT_THEME: ThemeSettings = {
  preset: "cascade",
  accent: THEME_PRESETS[0].accent,
  background: THEME_PRESETS[0].background,
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function normalizeTheme(value: unknown): ThemeSettings {
  const raw = (value ?? {}) as Partial<ThemeSettings>;
  const accent = isHexColour(raw.accent) ? raw.accent.toLowerCase() : DEFAULT_THEME.accent;
  const background = isHexColour(raw.background)
    ? raw.background.toLowerCase()
    : DEFAULT_THEME.background;
  const preset =
    raw.preset === "custom" || THEME_PRESETS.some((p) => p.id === raw.preset)
      ? (raw.preset as ThemeSettings["preset"])
      : DEFAULT_THEME.preset;
  return { preset, accent, background };
}

type Rgb = [number, number, number];
type Lab = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
};

function rgbToOklab([r, g, b]: Rgb): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** The default palette from index.css, as the reference for every theme. */
const INK_SHADES = [950, 900, 800, 700, 600, 500, 400] as const;
const DEFAULT_INK: Record<(typeof INK_SHADES)[number], Rgb> = {
  950: [9, 9, 13],
  900: [13, 13, 18],
  800: [20, 20, 26],
  700: [27, 27, 35],
  600: [36, 36, 46],
  500: [47, 47, 59],
  400: [62, 62, 76],
};
const SLATE_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const DEFAULT_SLATE: Record<(typeof SLATE_SHADES)[number], Rgb> = {
  50: [247, 247, 250],
  100: [237, 237, 242],
  200: [220, 220, 228],
  300: [192, 191, 204],
  400: [158, 157, 173],
  500: [131, 130, 154],
  600: [94, 93, 112],
  700: [65, 64, 79],
  800: [43, 43, 54],
  900: [24, 24, 31],
  950: [12, 12, 17],
};

/** Grounds lighter than this lose the interface's light text. */
const MAX_GROUND_L = 0.3;
const MIN_GROUND_L = 0.09;

/** The background as it will actually be used: kept within the dark range. */
export function usableBackground(hex: string): string {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const clamped = Math.min(MAX_GROUND_L, Math.max(MIN_GROUND_L, L));
  return clamped === L ? hex.toLowerCase() : rgbToHex(oklabToRgb([clamped, a, b]));
}

const channels = (rgb: Rgb) => rgb.join(" ");

/** The CSS custom properties a theme sets, as name → "r g b". */
export function themeVariables(theme: ThemeSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  const ground = rgbToOklab(hexToRgb(usableBackground(theme.background)));
  const defaultGround = rgbToOklab(DEFAULT_INK[900]);
  const defaultGroundChroma = Math.hypot(defaultGround[1], defaultGround[2]);
  const groundChroma = Math.hypot(ground[1], ground[2]);
  const neutral = groundChroma < 0.004;
  for (const shade of INK_SHADES) {
    const ref = rgbToOklab(DEFAULT_INK[shade]);
    // The default's lightness step and its chroma step from the ground,
    // turned to the ground's hue. A grey ground stays grey.
    const lift = ref[0] - defaultGround[0];
    const chroma = Math.max(0, groundChroma + Math.hypot(ref[1], ref[2]) - defaultGroundChroma);
    const lab: Lab = neutral
      ? [ground[0] + lift, 0, 0]
      : [
          ground[0] + lift,
          (ground[1] / groundChroma) * chroma,
          (ground[2] / groundChroma) * chroma,
        ];
    vars[`--ink-${shade}`] = channels(oklabToRgb(lab));
  }
  // Text keeps its lightness and only leans toward a coloured ground's hue.
  const hue = groundChroma > 0.008 ? [ground[1] / groundChroma, ground[2] / groundChroma] : null;
  for (const shade of SLATE_SHADES) {
    const ref = rgbToOklab(DEFAULT_SLATE[shade]);
    const chroma = Math.hypot(ref[1], ref[2]);
    const lab: Lab = hue ? [ref[0], hue[0] * chroma, hue[1] * chroma] : ref;
    vars[`--slate-${shade}`] = channels(oklabToRgb(lab));
  }
  const accent = rgbToOklab(hexToRgb(theme.accent));
  vars["--accent-rgb"] = channels(hexToRgb(theme.accent));
  vars["--accent-soft-rgb"] = channels(oklabToRgb([Math.min(0.95, accent[0] + 0.07), accent[1] * 0.9, accent[2] * 0.9]));
  // A step lighter for hover, so pointing at an accent button never shows
  // another colour.
  vars["--accent-hover-rgb"] = channels(oklabToRgb([Math.min(0.95, accent[0] + 0.03), accent[1], accent[2]]));
  vars["--accent-deep-rgb"] = channels(oklabToRgb([Math.max(0.2, accent[0] - 0.09), accent[1], accent[2]]));
  return vars;
}

const DEFAULT_VARS = themeVariables(DEFAULT_THEME);

let current: ThemeSettings = DEFAULT_THEME;
let currentVars: Record<string, string> = DEFAULT_VARS;
let version = 0;
const listeners = new Set<() => void>();

function isDefault(theme: ThemeSettings): boolean {
  return (
    theme.accent.toLowerCase() === DEFAULT_THEME.accent &&
    usableBackground(theme.background) === DEFAULT_THEME.background
  );
}

/**
 * Writes the theme onto <html>. The default theme removes the overrides, so
 * the stylesheet's own values (and the dormant classic theme) apply as before.
 */
export function applyTheme(theme: ThemeSettings): void {
  const vars = themeVariables(theme);
  current = theme;
  currentVars = vars;
  version += 1;
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    const reset = isDefault(theme);
    for (const name of Object.keys(DEFAULT_VARS)) {
      if (reset) root.style.removeProperty(name);
      else root.style.setProperty(name, vars[name]);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", reset ? "#0b0d12" : rgbToHex(vars["--ink-900"].split(" ").map(Number) as Rgb));
  }
  for (const listener of listeners) listener();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bumped on every change, so canvas caches know to redraw. */
export function themeVersion(): number {
  return version;
}

/** The accent for canvas drawing, as a CSS colour with optional alpha. */
export function accentColour(alpha = 1): string {
  const [r, g, b] = hexToRgb(current.accent);
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** An ink shade for canvas drawing. */
export function inkColour(shade: (typeof INK_SHADES)[number], alpha = 1): string {
  const value = isDefault(current) ? channels(DEFAULT_INK[shade]) : currentVars[`--ink-${shade}`];
  return alpha >= 1 ? `rgb(${value})` : `rgb(${value} / ${alpha})`;
}
