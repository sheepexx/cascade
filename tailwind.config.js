export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
