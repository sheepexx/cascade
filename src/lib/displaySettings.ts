import { isDesktopApp } from "./pwa";

/**
 * The desktop app's graphics settings: how its window is shown, and the frame
 * limiter. The app keeps them itself (see src-tauri/src/display.rs), because
 * it needs them before this page exists, to open the window in the right mode.
 */

export type DisplayMode = "fullscreen" | "borderless" | "windowed";
export type FrameLimit = "vsync" | "30" | "60" | "120" | "144" | "240";

export type DisplaySettings = {
  mode: DisplayMode;
  /** The window's size in windowed mode, in CSS pixels. */
  width: number;
  height: number;
  frameLimit: FrameLimit;
};

export type DisplayInfo = {
  settings: DisplaySettings;
  monitorWidth: number;
  monitorHeight: number;
};

export const DISPLAY_MODES: DisplayMode[] = ["fullscreen", "borderless", "windowed"];
export const FRAME_CAPS: FrameLimit[] = ["30", "60", "120", "144", "240"];
export const WINDOW_SIZES: [number, number][] = [
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
];

const QUIT_EVENT = "cascade://quit-requested";

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(command, args);
}

export function getDisplay(): Promise<DisplayInfo> {
  return invoke<DisplayInfo>("display_get");
}

/** Saves the settings and changes the window to match straight away. */
export async function setDisplay(settings: DisplaySettings): Promise<DisplayInfo> {
  const info = await invoke<DisplayInfo>("display_set", { settings });
  applyFrameLimit(info.settings.frameLimit);
  return info;
}

/** Applies the saved frame limiter as the page starts. */
export async function initDisplay(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    applyFrameLimit((await getDisplay()).settings.frameLimit);
  } catch {
    // An older app without these commands: nothing to apply.
  }
}

/**
 * The page has what it needs to start smoothly: the desktop app shows its
 * window in the chosen mode and closes the splash.
 */
export function signalAppReady(): void {
  if (!isDesktopApp()) return;
  void invoke("app_ready").catch(() => {});
}

/** The window's close button or Alt+F4: play the outro, then quit. */
export function onQuitRequested(handler: () => void): () => void {
  if (!isDesktopApp()) return () => {};
  let stop: (() => void) | null = null;
  let stopped = false;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen(QUIT_EVENT, () => handler()))
    .then((unlisten) => {
      if (stopped) unlisten();
      else stop = unlisten;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    stop?.();
  };
}

/*
 * The frame limiter. Everything Cascade animates itself (the editor, the
 * playtest, the menu) is drawn from requestAnimationFrame, so capping that
 * caps them all. CSS transitions keep the display's own rate. There is no
 * "unlimited": with vsync off, Windows' web view stops showing its frames.
 */

// Ours start far above the browser's, so either kind can be cancelled.
const FIRST_ID = 1_000_000_000;
// A frame a little early still counts, so a cap at the display's own rate
// never drops one to timer jitter.
const EARLY_MS = 1.5;

let cap = 0;
let installed = false;
let nativeRequest: (callback: FrameRequestCallback) => number = () => 0;
let nativeCancel: (id: number) => void = () => {};
const queued = new Map<number, FrameRequestCallback>();
let nextId = FIRST_ID;
let scheduled = false;
let lastFrame = 0;

/** The cap in frames per second, or 0 for none. */
export function frameCap(limit: FrameLimit): number {
  return /^\d+$/.test(limit) ? Number(limit) : 0;
}

/** Whether a frame at `now` runs, given the last one that did. */
export function frameDue(now: number, last: number, fps: number): boolean {
  return fps <= 0 || last <= 0 || now - last >= 1000 / fps - EARLY_MS;
}

function pump(now: number) {
  scheduled = false;
  if (!queued.size) return;
  if (!frameDue(now, lastFrame, cap)) {
    scheduled = true;
    nativeRequest(pump);
    return;
  }
  if (cap > 0) {
    const interval = 1000 / cap;
    // Keep to the cap's own beat unless a long stall broke it.
    lastFrame = lastFrame > 0 && now - lastFrame < interval * 2 ? lastFrame + interval : now;
  }
  const due = [...queued.values()];
  queued.clear();
  for (const callback of due) {
    try {
      callback(now);
    } catch (error) {
      // Reported like any uncaught error, without stopping the others.
      queueMicrotask(() => {
        throw error;
      });
    }
  }
}

function install() {
  installed = true;
  nativeRequest = window.requestAnimationFrame.bind(window);
  nativeCancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = nextId++;
    queued.set(id, callback);
    if (!scheduled) {
      scheduled = true;
      nativeRequest(pump);
    }
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    if (id >= FIRST_ID) queued.delete(id);
    else nativeCancel(id);
  };
}

export function applyFrameLimit(limit: FrameLimit): void {
  cap = frameCap(limit);
  lastFrame = 0;
  // Nothing is replaced until a cap is first asked for.
  if (cap > 0 && !installed && typeof window !== "undefined") install();
}
