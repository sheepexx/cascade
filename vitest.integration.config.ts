import { defineConfig } from "vitest/config";

// Database integration tests: every migration applied to a real Postgres
// (PGlite), exercised with each role's row-level security. The browser specs
// next to them run under Playwright instead (tests/integration/playwright.config.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/db/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
