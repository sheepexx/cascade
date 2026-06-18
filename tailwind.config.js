/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // osu!lazer-inspired dark palette (original, no osu! assets)
        ink: {
          900: "#0f0f14",
          800: "#16161d",
          700: "#1d1d27",
          600: "#272733",
          500: "#33333f",
        },
        accent: {
          DEFAULT: "#ff5db1",
          soft: "#ff8fcf",
          deep: "#c8307f",
        },
        lane: {
          white: "#e9e9f0",
          blue: "#5bc0ff",
        },
      },
      fontFamily: {
        // osu!lazer typeface: Torus (+ Torus-Alternate), falling back to Inter.
        // Mirrored by --font-osu in src/index.css and the canvas text helper.
        sans: [
          "Torus",
          "Torus-Alternate",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
