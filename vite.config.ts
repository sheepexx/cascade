import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function handleAvatar(req: any, res: any) {
  const url = new URL(req.url || "", "http://localhost");
  const user = url.searchParams.get("user");
  if (!user) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing user parameter" }));
    return;
  }

  try {
    const profileResp = await fetch(`https://osu.ppy.sh/users/${encodeURIComponent(user)}`, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const location = profileResp.headers.get("location");
    if (!location) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "User not found" }));
      return;
    }
    const match = location.match(/\/users\/(\d+)/);
    if (!match) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Could not resolve user ID" }));
      return;
    }
    const userId = match[1];
    const avatarResp = await fetch(`https://a.ppy.sh/${userId}`, {
      headers: { "User-Agent": UA },
    });
    if (!avatarResp.ok) {
      res.statusCode = avatarResp.status;
      res.end();
      return;
    }
    const contentType = avatarResp.headers.get("content-type") || "image/png";
    // @ts-ignore
    const buffer = Buffer.from(await avatarResp.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buffer);
  } catch {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal error" }));
  }
}

function avatarApiPlugin() {
  return {
    name: "avatar-api",
    configureServer(server: any) {
      server.middlewares.use("/api/avatar", (req: any, res: any) => {
        void handleAvatar(req, res);
      });
    },
  };
}

function cleanUrlsPlugin() {
  return {
    name: "clean-urls",
    async configureServer(server: any) {
      // @ts-expect-error node builtin types are not installed
      const { existsSync } = await import("node:fs");
      server.middlewares.use((req: any, _res: any, next: any) => {
        const [path, query] = (req.url || "").split("?");
        if (path && !path.includes(".") && existsSync(`public${path}.html`)) {
          req.url = `${path}.html${query ? `?${query}` : ""}`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    avatarApiPlugin(),
    cleanUrlsPlugin(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: false,
      manifestFilename: "site.webmanifest",
      workbox: {
        globPatterns: [
          "index.html",
          "assets/**/*.{js,css,woff,woff2}",
          "hitsounds/**/*.wav",
          "favicon.png",
          "logo.png",
          "logo-maskable.png",
          "icon-192.png",
          "icon-512.png",
        ],
        globIgnores: ["maps/**", "og*.png", "**/*.map"],
        navigateFallback: null,
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
