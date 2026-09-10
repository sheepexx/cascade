import { isDesktopApp } from "./pwa";
import { currentPortableApp, installPortableUpdate } from "./portableUpdate";

export type DesktopUpdate = {
  version: string;
  notes: string | null;
};

export type UpdateStage = "idle" | "checking" | "ready" | "installing";

let pending: {
  version: string;
  downloadAndInstall: () => Promise<void>;
} | null = null;

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
  if (await currentPortableApp()) {
    await installPortableUpdate(pending.version);
    return;
  }
  await pending.downloadAndInstall();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export function hasPendingUpdate(): boolean {
  return pending !== null;
}
