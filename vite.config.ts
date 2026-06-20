import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose the package.json version to the app as a compile-time constant
  // (single source of truth for the on-screen version indicator).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
