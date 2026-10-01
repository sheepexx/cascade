import { defineConfig } from "vitest/config";

// Large-chart timings; not part of `npm test`. Run with `npm run perf`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.perf.ts"],
    silent: false,
  },
});
