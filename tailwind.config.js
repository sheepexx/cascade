import plugin from "tailwindcss/plugin";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        md: "0.5rem",
        lg: "0.7rem",
        xl: "1rem",
        "2xl": "1.35rem",
        "3xl": "1.75rem",
      },
      colors: {
        ink: {
          900: "#0f0f14",
          800: "#16161d",
          700: "#1d1d27",
          600: "#272733",
          500: "#33333f",
        },
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
        sans: [
          "Quicksand",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "Noto Sans CJK SC",
          "Source Han Sans SC",
          "sans-serif",
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
