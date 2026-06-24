import { defineConfig } from "vitest/config";

// Unit tests target the pure logic libs (timing, scoring, collision, osu I/O),
// which are plain functions with no DOM — so the fast `node` environment is
// enough. Kept separate from vite.config.ts to leave the production build path
// untouched.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
