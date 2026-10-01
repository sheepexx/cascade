import { useSyncExternalStore } from "react";

/**
 * Installing Cascade as an app from the browser. Chromium browsers announce
 * that a site can be installed with `beforeinstallprompt`; the event is held
 * so the editor can offer it at a calm moment instead of the browser's own
 * banner. Whatever the mapper answers is remembered: "not now" waits a month,
 * a second "not now" ends the offers, and an offer that was ignored comes back
 * a few days later. Installing from the palette works whenever the browser
 * allows it, whatever was answered before.
 */

type InstallChoice = { outcome: "accepted" | "dismissed" };
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

export type InstallRecord = {
  dismissals: number;
  lastDismissedAt: number | null;
  snoozedUntil: number | null;
  installed: boolean;
};

const KEY = "cascade:install-offer";
export const INSTALL_DISMISS_WAIT_MS = 30 * 24 * 60 * 60_000;
export const INSTALL_SNOOZE_MS = 3 * 24 * 60 * 60_000;
export const INSTALL_MAX_DISMISSALS = 2;
const EMPTY: InstallRecord = { dismissals: 0, lastDismissedAt: null, snoozedUntil: null, installed: false };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadInstallRecord(store: StorageLike | null = storage()): InstallRecord {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<Record<keyof InstallRecord, unknown>>;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return {
      dismissals: num(v.dismissals) ?? 0,
      lastDismissedAt: num(v.lastDismissedAt),
      snoozedUntil: num(v.snoozedUntil),
      installed: v.installed === true,
    };
  } catch {
    return EMPTY;
  }
}

function save(record: InstallRecord, store: StorageLike | null): InstallRecord {
  try {
    store?.setItem(KEY, JSON.stringify(record));
  } catch {
    // Without storage the offer may come back next visit; it never nags twice a visit.
  }
  return record;
}

/** Whether the editor may offer installing on its own. */
export function mayOfferInstall(record: InstallRecord, now: number): boolean {
  if (record.installed) return false;
  if (record.dismissals >= INSTALL_MAX_DISMISSALS) return false;
  if (record.snoozedUntil !== null && now < record.snoozedUntil) return false;
  if (record.lastDismissedAt !== null && now - record.lastDismissedAt < INSTALL_DISMISS_WAIT_MS) {
    return false;
  }
  return true;
}

export function recordInstallDismissed(now = Date.now(), store = storage()): InstallRecord {
  const record = loadInstallRecord(store);
  return save({ ...record, dismissals: record.dismissals + 1, lastDismissedAt: now }, store);
}

export function recordInstallIgnored(now = Date.now(), store = storage()): InstallRecord {
  return save({ ...loadInstallRecord(store), snoozedUntil: now + INSTALL_SNOOZE_MS }, store);
}

export function recordInstalled(store = storage()): InstallRecord {
  return save({ ...loadInstallRecord(store), installed: true }, store);
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/** Starts listening; call once at startup in the web build. */
export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    recordInstalled();
    notify();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the browser would let Cascade be installed. */
export function useInstallAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null, () => false);
}

/** Shows the browser's install dialog; resolves to what the mapper chose. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  // The event can be used once; the browser fires a new one if it still applies.
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") recordInstalled();
  else recordInstallDismissed();
  return outcome;
}
