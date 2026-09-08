import { isDesktopApp } from "./pwa";

export type DesktopUpdate = {
  version: string;
  notes: string | null;
};

export type UpdateStage = "idle" | "checking" | "ready" | "installing";

let pending: { downloadAndInstall: () => Promise<void> } | null = null;

export async function checkDesktopUpdate(): Promise<DesktopUpdate | null> {
  if (!isDesktopApp()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) {
    pending = null;
    return null;
  }
  pending = update;
  return { version: update.version, notes: update.body ?? null };
}

export async function installDesktopUpdate(): Promise<void> {
  if (!pending) throw new Error("No update is ready to install.");
  await pending.downloadAndInstall();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export function hasPendingUpdate(): boolean {
  return pending !== null;
}
