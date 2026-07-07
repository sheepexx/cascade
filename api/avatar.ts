import type { VercelRequest, VercelResponse } from "@vercel/node";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = req.query.user as string;
  if (!user) {
    return res.status(400).json({ error: "Missing user parameter" });
  }

  try {
    const profileResp = await fetch(`https://osu.ppy.sh/users/${encodeURIComponent(user)}`, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const location = profileResp.headers.get("location");
    if (!location) {
      return res.status(404).json({ error: "User not found" });
    }
    const match = location.match(/\/users\/(\d+)/);
    if (!match) {
      return res.status(404).json({ error: "Could not resolve user ID" });
    }
    const userId = match[1];
    const avatarResp = await fetch(`https://a.ppy.sh/${userId}`, {
      headers: { "User-Agent": UA },
    });
    if (!avatarResp.ok) {
      return res.status(avatarResp.status).end();
    }
    const contentType = avatarResp.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await avatarResp.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch {
    return res.status(500).json({ error: "Internal error" });
  }
}
