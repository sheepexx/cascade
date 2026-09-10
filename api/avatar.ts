const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function handleAvatar(req: Request): Promise<Response> {
  const user = new URL(req.url).searchParams.get("user");
  if (!user) {
    return Response.json({ error: "Missing user parameter" }, { status: 400 });
  }

  try {
    const profileResp = await fetch(`https://osu.ppy.sh/users/${encodeURIComponent(user)}`, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const location = profileResp.headers.get("location");
    if (!location) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const match = location.match(/\/users\/(\d+)/);
    if (!match) {
      return Response.json({ error: "Could not resolve user ID" }, { status: 404 });
    }

    const avatarResp = await fetch(`https://a.ppy.sh/${match[1]}`, {
      headers: { "User-Agent": UA },
    });
    if (!avatarResp.ok) {
      return new Response(null, { status: avatarResp.status });
    }
    return new Response(avatarResp.body, {
      headers: {
        "Content-Type": avatarResp.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export default { fetch: handleAvatar };
