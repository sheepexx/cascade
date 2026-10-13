import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const swaps = new Map([
  [here("../../../src/lib/supabase.ts"), here("./fakeSupabase.ts")],
  [here("../../../src/lib/storage.ts"), here("./fakeStorage.ts")],
  [here("../../../src/lib/auth.tsx"), here("./fakeAuth.tsx")],
  [here("../../../src/lib/osuProfile.ts"), here("./fakeOsuProfile.ts")],
]);

/**
 * Points the editor's Supabase client and asset storage at the test backend.
 * Matching on the resolved file means every import of those modules gets the
 * stand-in, whatever relative path it was written with; the stand-ins'
 * own imports of the real modules are left alone.
 */
function testBackend(): Plugin {
  return {
    name: "cascade-test-backend",
    enforce: "pre",
    async resolveId(source, importer, options) {
      // The service worker belongs to the production build.
      if (source === "virtual:pwa-register") return "\0pwa-register-stub";
      if (!importer) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const swap = resolved && swaps.get(resolved.id);
      if (!swap || importer === swap) return null;
      return swap;
    },
    load(id) {
      return id === "\0pwa-register-stub" ? "export function registerSW() { return () => {}; }" : null;
    },
  };
}

export default defineConfig({
  root: here("./harness"),
  plugins: [testBackend(), react()],
  define: { __APP_VERSION__: JSON.stringify("integration") },
  // The editor's Tailwind setup lives at the repository root.
  css: { postcss: here("../../..") },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
