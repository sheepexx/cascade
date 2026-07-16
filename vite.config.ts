import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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

export default defineConfig({
  plugins: [react(), avatarApiPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
