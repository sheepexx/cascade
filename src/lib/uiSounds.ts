/**
 * UI sound effects (clicks, confirmations, invites, save/export chimes).
 *
 * Lightweight HTMLAudio playback — no Web Audio graph needed for one-shots. Each
 * sound's element is cloned per play so rapid repeats (e.g. UI clicks) overlap
 * instead of cutting each other off. Files live in `public/sounds`; resolved
 * against the Vite base URL so it works under a sub-path deploy.
 *
 * Honors the user's "UI sounds" preference via {@link setUiSoundsEnabled}, and
 * fails silently if the browser blocks playback (e.g. before the first gesture).
 */

export type UiSound =
  | "click"
  | "areYouSure"
  | "invite"
  | "saveToCloudDone"
  | "mapExportDone";

const FILES: Record<UiSound, string> = {
  click: "ui-click.mp3",
  areYouSure: "are-you-sure.mp3",
  invite: "invite.mp3",
  saveToCloudDone: "save-to-cloud-done.mp3",
  mapExportDone: "map-export-done.mp3",
};

/** Per-sound base volume (0..1); some samples are hotter than others. */
const VOLUME: Record<UiSound, number> = {
  click: 0.35,
  areYouSure: 0.55,
  invite: 0.6,
  saveToCloudDone: 0.6,
  mapExportDone: 0.6,
};

const url = (file: string) => `${import.meta.env.BASE_URL}sounds/${file}`;

let enabled = true;
/** Master volume multiplier, 0..1 (1 = 100%). */
let masterVolume = 1;
/** Preloaded template elements, created lazily on first use. */
const templates = new Map<UiSound, HTMLAudioElement>();

/** Enable/disable all UI sounds (wired to the app setting). */
export function setUiSoundsEnabled(value: boolean): void {
  enabled = value;
}

/** Set the master UI-sound volume, 0..1 (clamped). */
export function setUiSoundVolume(value: number): void {
  masterVolume = Math.max(0, Math.min(1, value));
}

function template(name: UiSound): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  let el = templates.get(name);
  if (!el) {
    el = new Audio(url(FILES[name]));
    el.preload = "auto";
    templates.set(name, el);
  }
  return el;
}

/** Ask the browser to fetch every UI sound before the first interaction. */
export function preloadUiSounds(): void {
  for (const name of Object.keys(FILES) as UiSound[]) {
    template(name)?.load();
  }
}

/** Play a UI sound once (no-op when disabled or playback is blocked). */
export function playUiSound(name: UiSound): void {
  if (!enabled) return;
  const base = template(name);
  if (!base) return;
  const level = VOLUME[name] * masterVolume;
  if (level <= 0) return;
  // Clone so overlapping plays don't interrupt one another.
  const node = base.cloneNode(true) as HTMLAudioElement;
  node.volume = Math.min(1, level);
  void node.play().catch(() => {
    /* autoplay blocked / not yet allowed — ignore */
  });
}
