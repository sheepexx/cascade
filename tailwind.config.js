import plugin from "tailwindcss/plugin";

// Cascade's design tokens. DESIGN_SYSTEM.md explains each choice; keep the two
// in step. Components use these scales through ordinary Tailwind classes, so a
// change here moves the whole interface at once.

/** A colour scale whose shades are `--name-shade` RGB channels, so Tailwind's
 * opacity modifiers (`bg-ink-900/70`) keep working. */
function channels(name, shades) {
  return Object.fromEntries(
    shades.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]),
  );
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // A bare `transition` follows the motion tokens in index.css, so a hover
      // with no explicit duration moves like the rest of the interface instead
      // of on Tailwind's own 150ms curve.
      transitionDuration: { DEFAULT: "var(--motion-quick)" },
      transitionTimingFunction: { DEFAULT: "var(--ease-standard)" },
      // Every scale below reads a CSS variable defined in index.css, so a
      // theme (such as the dormant classic one, data-theme="classic") can swap
      // the whole look without touching a component.
      //
      // Tight, tool-like corners. Controls sit at md/lg, floating layers at
      // xl/2xl; `full` is kept for avatars, status dots and switches.
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
      },
      // Interface text: 13px is the working size, 12px secondary, 11px meta.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["var(--text-xs)", { lineHeight: "var(--leading-xs)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--leading-sm)" }],
        base: ["var(--text-base)", { lineHeight: "var(--leading-base)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--leading-lg)" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
      },
      colors: {
        // Surfaces, darkest first in use: 950 is the canvas well behind the
        // playfield, 900 the application ground, 800 chrome and panels, 700
        // raised layers (dialogs, menus), 600/500 controls and their hover.
        ink: channels("ink", [950, 900, 800, 700, 600, 500, 400]),
        // Text and neutral marks. Re-tinted toward the ink hue and lifted at
        // the low end so 400/500 stay readable as secondary text.
        slate: channels("slate", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        accent: {
          DEFAULT: "#e86868",
          soft: "#f48a8a",
          deep: "#c14d4d",
        },
        lane: {
          white: "#e9e9f0",
          blue: "#5bc0ff",
        },
      },
      fontFamily: {
        // Inter runs the interface: dense, legible at 12px and with tabular
        // figures. Quicksand is Cascade's voice (titles, names, the menu).
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
        mono: [
          "ui-monospace",
          "SF Mono",
          "Cascadia Mono",
          "Roboto Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [
    // Interface-scale-aware counterparts to `min-[900px]:`, `lg:` and `xl:`. Media
    // queries cannot see the scaled root font size, so these key off the
    // attributes set from src/lib/uiBreakpoints.ts instead. `:where()` keeps
    // specificity at zero so normal utility ordering still applies.
    plugin(({ addVariant }) => {
      addVariant("uimd", ":where(html[data-uimd]) &");
      addVariant("uilg", ":where(html[data-uilg]) &");
      addVariant("uixl", ":where(html[data-uixl]) &");
    }),
  ],
};
