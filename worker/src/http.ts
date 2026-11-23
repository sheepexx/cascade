import type { WorkerEnv } from "./storage";

/** Response helpers shared by the Worker's routes. */

// The desktop build runs the same SPA inside a Tauri webview, whose origin is
// not the site. It authenticates with a bearer token rather than the session
// cookie, so echoing these back is enough to let it reach the API.
export const DESKTOP_ORIGINS = [
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
];

export function resolveAllowedOrigin(
  requestOrigin: string | null,
  env: WorkerEnv,
): string {
  if (!requestOrigin) return env.FRONTEND_URL;
  if (requestOrigin === env.FRONTEND_URL) return requestOrigin;
  if (DESKTOP_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return env.FRONTEND_URL;
}

/** A request from the site or the desktop app, or one with no Origin at all. */
export function originAllowed(req: Request, env: WorkerEnv): boolean {
  const origin = req.headers.get("Origin");
  return !origin || origin === env.FRONTEND_URL || DESKTOP_ORIGINS.includes(origin);
}

export function cors(env: WorkerEnv): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_URL,
    "Access-Control-Allow-Methods": "GET,HEAD,PUT,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, If-None-Match",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag, Accept-Ranges",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

export function json(
  body: unknown,
  status: number,
  env: WorkerEnv,
  setCookies: string[] = [],
): Response {
  const headers = new Headers(cors(env));
  headers.set("Content-Type", "application/json");
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

export function redirect(location: string, env: WorkerEnv, setCookies: string[]): Response {
  const headers = new Headers(cors(env));
  headers.set("Location", location);
  headers.set("Cache-Control", "no-store");
  // The location can carry a session in its fragment; never pass it on.
  headers.set("Referrer-Policy", "no-referrer");
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export function cookie(
  name: string,
  value: string,
  opts: { maxAge: number; sameSite?: "None" | "Lax" },
): string {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    `SameSite=${opts.sameSite ?? "None"}`,
    `Max-Age=${opts.maxAge}`,
  ].join("; ");
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/** The caller's address as Cloudflare saw it, for rate limiting. */
export function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? "unknown";
}
