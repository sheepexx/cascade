import { isDesktopApp } from "./pwa";

const WORKER = import.meta.env.VITE_WORKER_URL;

export function desktopLoginUrl(): string {
  return `${WORKER}/auth/osu/login?client=desktop`;
}

export function sessionFromDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "cascade:") return null;
    return parsed.searchParams.get("session");
  } catch {
    return null;
  }
}

export async function openDesktopLogin(): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(desktopLoginUrl());
}

export async function watchDesktopLogin(
  onSession: (session: string) => void,
): Promise<void> {
  if (!isDesktopApp()) return;
  const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
  const handle = (urls: string[] | null) => {
    for (const url of urls ?? []) {
      const session = sessionFromDeepLink(url);
      if (session) onSession(session);
    }
  };
  handle(await getCurrent());
  await onOpenUrl(handle);
}
