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
