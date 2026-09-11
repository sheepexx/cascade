export const DESKTOP_HINT_DELAY_MS = 1400;
export const DESKTOP_HINT_VISIBLE_MS = 22000;

const DISMISS_KEY = "mania-editor:desktop-hint-dismissed";

/** What the web app's desktop hint offers, if anything. */
export type DesktopHintStatus = "download" | "update" | "current";

/** Compares dotted versions numerically; negative when `a` is older. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * Signed out there is no telling whether the app is installed, so it is always
 * offered. Signed in, it is offered until this account has opened the desktop
 * app, and becomes an update notice while that version trails the newest
 * release. Without a newest release to compare against, someone who already
 * has the app is left alone.
 */
export function desktopHintStatus({
  signedIn,
  desktopVersion,
  latestVersion,
}: {
  signedIn: boolean;
  desktopVersion: string | null;
  latestVersion: string | null;
}): DesktopHintStatus {
  if (!signedIn || !desktopVersion) return "download";
  if (!latestVersion) return "current";
  return compareVersions(desktopVersion, latestVersion) < 0
    ? "update"
    : "current";
}

/** Closing the hint quiets it for the rest of this visit; it returns on the
 *  next one until the app is installed and up to date. */
export function desktopHintDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissDesktopHint(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Private mode or storage blocked: it simply comes back on the next menu.
  }
}
