import { isDesktopApp } from "./pwa";
import { t } from "./i18n/core";

const WORKER = import.meta.env.VITE_WORKER_URL;

export const OAUTH_EVENT = "cascade://oauth-session";

/**
 * A Worker sign-in address (osu! by default, or any provider, link or
 * confirmation URL the Worker handed out) that comes back to the app's
 * loopback listener instead of the website.
 */
export function desktopLoginUrl(port: number, nonce: string, start?: string): string {
  if (!WORKER) {
    throw new Error(
      t("lib.noWorker"),
    );
  }
  const url = new URL(start ?? `${WORKER}/auth/osu/login`);
  // Only ever the Worker: the listener's port and nonce go nowhere else.
  if (url.origin !== new URL(WORKER).origin) throw new Error("not a Cascade sign-in address");
  url.searchParams.set("client", "desktop");
  url.searchParams.set("port", String(port));
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

export async function startDesktopLogin(start?: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const nonce = crypto.randomUUID();
  const port = await invoke<number>("start_oauth_listener", { nonce });
  const url = desktopLoginUrl(port, nonce, start);
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

/** Listens for what the browser sign-in hands back; returns how to stop. */
export async function watchDesktopLogin(
  onPayload: (payload: string) => void,
): Promise<() => void> {
  if (!isDesktopApp()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>(OAUTH_EVENT, (event) => {
    if (typeof event.payload === "string" && event.payload) {
      onPayload(event.payload);
    }
  });
}
