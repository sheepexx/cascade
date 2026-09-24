import { isDesktopApp } from "./pwa";
import { t } from "./i18n/core";

const WORKER = import.meta.env.VITE_WORKER_URL;

export const OAUTH_EVENT = "cascade://oauth-session";

export function desktopLoginUrl(port: number, nonce: string): string {
  if (!WORKER) {
    throw new Error(
      t("lib.noWorker"),
    );
  }
  const query = new URLSearchParams({ client: "desktop", port: String(port), nonce });
  return `${WORKER}/auth/osu/login?${query}`;
}

export async function startDesktopLogin(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const nonce = crypto.randomUUID();
  const port = await invoke<number>("start_oauth_listener", { nonce });
  const url = desktopLoginUrl(port, nonce);
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
