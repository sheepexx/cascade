import { isDesktopApp } from "./pwa";

const WORKER = import.meta.env.VITE_WORKER_URL;

export const OAUTH_EVENT = "cascade://oauth-session";

export function desktopLoginUrl(port: number): string {
  if (!WORKER) {
    throw new Error(
      "This build has no VITE_WORKER_URL, so it cannot reach the account service.",
    );
  }
  return `${WORKER}/auth/osu/login?client=desktop&port=${port}`;
}

export async function startDesktopLogin(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const port = await invoke<number>("start_oauth_listener");
  const url = desktopLoginUrl(port);
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function watchDesktopLogin(
  onSession: (session: string) => void,
): Promise<void> {
  if (!isDesktopApp()) return;
  const { listen } = await import("@tauri-apps/api/event");
  await listen<string>(OAUTH_EVENT, (event) => {
    if (typeof event.payload === "string" && event.payload) {
      onSession(event.payload);
    }
  });
}
