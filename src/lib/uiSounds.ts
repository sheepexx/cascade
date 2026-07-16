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

const VOLUME: Record<UiSound, number> = {
  click: 0.35,
  areYouSure: 0.55,
  invite: 0.6,
  saveToCloudDone: 0.6,
  mapExportDone: 0.6,
};

const url = (file: string) => `${import.meta.env.BASE_URL}sounds/${file}`;

let enabled = true;
let masterVolume = 1;
const templates = new Map<UiSound, HTMLAudioElement>();

export function setUiSoundsEnabled(value: boolean): void {
  enabled = value;
}

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

export function preloadUiSounds(): void {
  for (const name of Object.keys(FILES) as UiSound[]) {
    template(name)?.load();
  }
}

export function playUiSound(name: UiSound): void {
  if (!enabled) return;
  const base = template(name);
  if (!base) return;
  const level = VOLUME[name] * masterVolume;
  if (level <= 0) return;
  const node = base.cloneNode(true) as HTMLAudioElement;
  node.volume = Math.min(1, level);
  void node.play().catch(() => {
  });
}
