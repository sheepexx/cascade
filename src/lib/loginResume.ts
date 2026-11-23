/**
 * The web login leaves the page for osu! and comes back to a fresh start
 * screen. The open project's id is noted for this tab just before leaving, so
 * the editor can reopen it on return instead of dropping the mapper at home.
 */

const KEY = "cascade:resume-after-login";
/** A login that takes longer than this was abandoned; don't jump anywhere. */
export const LOGIN_RESUME_MS = 15 * 60_000;

type SessionLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function session(): SessionLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function rememberProjectForLogin(
  projectId: string,
  now = Date.now(),
  store: SessionLike | null = session(),
): void {
  try {
    store?.setItem(KEY, JSON.stringify({ projectId, at: now }));
  } catch {
    // Without session storage the mapper reopens the map from My Maps.
  }
}

/** The project to reopen after a login, read once. */
export function takeProjectAfterLogin(
  now = Date.now(),
  store: SessionLike | null = session(),
): string | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    store?.removeItem(KEY);
    const value = JSON.parse(raw) as { projectId?: unknown; at?: unknown };
    if (typeof value.projectId !== "string" || typeof value.at !== "number") return null;
    if (now - value.at > LOGIN_RESUME_MS || now < value.at) return null;
    return value.projectId;
  } catch {
    return null;
  }
}

const CONNECT_KEY = "cascade:connect-after-login";

/**
 * The Discord bot's /link opens Cascade at ?connect=discord. The request is
 * kept for this tab through a login, so Connected accounts opens once the
 * person is signed in; it never connects anything by itself.
 */
export function takeConnectRequest(
  now = Date.now(),
  store: SessionLike | null = session(),
  location: Pick<Location, "href"> | null = typeof window === "undefined" ? null : window.location,
  replace: (path: string) => void = (path) => window.history.replaceState({}, "", path),
): boolean {
  try {
    if (location) {
      const url = new URL(location.href);
      if (url.searchParams.has("connect")) {
        url.searchParams.delete("connect");
        replace(url.pathname + url.search + url.hash);
        store?.setItem(CONNECT_KEY, String(now));
      }
    }
    const at = Number(store?.getItem(CONNECT_KEY));
    if (!Number.isFinite(at) || at <= 0) return false;
    if (now - at > LOGIN_RESUME_MS || now < at) {
      store?.removeItem(CONNECT_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearConnectRequest(store: SessionLike | null = session()): void {
  try {
    store?.removeItem(CONNECT_KEY);
  } catch {
    // Nothing kept, nothing to clear.
  }
}
