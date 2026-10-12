import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { BACKEND_URL, HARNESS_URL } from "./browser/support";

const root = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Browser workflows: the editor's real collaboration and save pipeline in
 * separate browser contexts, against a backend that runs every migration and
 * row-level security rule on a real Postgres (see browser/backend.ts). The
 * tests share one backend and reset it, so they run one at a time.
 */
export default defineConfig({
  testDir: "./browser",
  outputDir: "./.results",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  globalSetup: "./browser/globalSetup.ts",
  use: {
    baseURL: HARNESS_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --config tests/integration/browser/vite.config.ts",
    cwd: root,
    url: HARNESS_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: BACKEND_URL,
      VITE_SUPABASE_ANON_KEY: "integration",
    },
  },
});
