export type UiSound =
  | "hover"
  | "click"
  | "open"
  | "close"
  | "toggleOn"
  | "toggleOff"
  | "slider"
  | "notice"
  | "areYouSure"
  | "invite"
  | "saveToCloudDone"
  | "mapExportDone";

type SynthSound = Exclude<
  UiSound,
  "areYouSure" | "invite" | "saveToCloudDone" | "mapExportDone"
>;

const FILES: Partial<Record<UiSound, string>> = {
  areYouSure: "are-you-sure.mp3",
  invite: "invite.mp3",
  saveToCloudDone: "save-to-cloud-done.mp3",
  mapExportDone: "map-export-done.mp3",
};

const VOLUME: Record<UiSound, number> = {
  hover: 0.13,
  click: 0.25,
  open: 0.2,
  close: 0.16,
  toggleOn: 0.18,
  toggleOff: 0.16,
  slider: 0.12,
  notice: 0.18,
  areYouSure: 0.55,
  invite: 0.6,
  saveToCloudDone: 0.6,
  mapExportDone: 0.6,
};

const url = (file: string) => `${import.meta.env.BASE_URL}sounds/${file}`;

let enabled = true;
let masterVolume = 1;
let audioContext: AudioContext | null = null;
let lastHoverAt = 0;
let lastSliderAt = 0;
const templates = new Map<UiSound, HTMLAudioElement>();

export function setUiSoundsEnabled(value: boolean): void {
  enabled = value;
}

export function setUiSoundVolume(value: number): void {
  masterVolume = Math.max(0, Math.min(1, value));
}

function template(name: UiSound): HTMLAudioElement | null {
  const file = FILES[name];
  if (!file || typeof Audio === "undefined") return null;
  let el = templates.get(name);
  if (!el) {
    el = new Audio(url(file));
    el.preload = "auto";
    templates.set(name, el);
  }
  return el;
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext;
  if (!Context) return null;
  if (!audioContext) audioContext = new Context();
  if (audioContext.state === "suspended") void audioContext.resume();
  return audioContext;
}

type Tone = {
  from: number;
  to?: number;
  delay?: number;
  duration: number;
  gain: number;
  wave?: OscillatorType;
};

function tone(ctx: AudioContext, at: number, sound: Tone, pitch: number): void {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  const start = at + (sound.delay ?? 0);
  const end = start + sound.duration;
  oscillator.type = sound.wave ?? "sine";
  oscillator.frequency.setValueAtTime(sound.from * pitch, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, (sound.to ?? sound.from) * pitch),
    end,
  );
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, sound.gain * masterVolume),
    start + Math.min(0.009, sound.duration / 3),
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(envelope).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.01);
}

/** Small synthesized sounds are original to Cascade and need no shipped samples. */
function synth(name: SynthSound, value = 0.5): void {
  const ctx = context();
  if (!ctx) return;
  const at = ctx.currentTime;
  // Tiny pitch drift keeps dense UI work from turning into one rigid sample.
  const pitch = 0.975 + Math.random() * 0.05;
  const clamped = Math.max(0, Math.min(1, value));
  const sounds: Tone[] =
    name === "hover"
      ? [{ from: 760, to: 900, duration: 0.032, gain: 0.04, wave: "sine" }]
      : name === "click"
        ? [
            { from: 430, to: 250, duration: 0.055, gain: 0.075, wave: "triangle" },
            { from: 850, to: 620, delay: 0.008, duration: 0.035, gain: 0.025 },
          ]
        : name === "open"
          ? [
              { from: 420, to: 660, duration: 0.085, gain: 0.045 },
              { from: 700, to: 1040, delay: 0.025, duration: 0.1, gain: 0.035 },
            ]
          : name === "close"
            ? [{ from: 640, to: 310, duration: 0.09, gain: 0.045 }]
            : name === "toggleOn"
              ? [
                  { from: 520, to: 720, duration: 0.055, gain: 0.045 },
                  { from: 760, to: 980, delay: 0.035, duration: 0.06, gain: 0.04 },
                ]
              : name === "toggleOff"
                ? [{ from: 620, to: 390, duration: 0.07, gain: 0.05 }]
                : name === "slider"
                  ? [
                      {
                        from: 310 + clamped * 690,
                        to: 340 + clamped * 720,
                        duration: 0.035,
                        gain: 0.045,
                        wave: "triangle",
                      },
                    ]
                  : [{ from: 700, to: 980, duration: 0.08, gain: 0.045 }];
  const scale = VOLUME[name] / 0.2;
  for (const sound of sounds)
    tone(ctx, at, { ...sound, gain: sound.gain * scale }, pitch);
}

/** The pitched tick for the shared Slider (Controls.tsx). It is not a native
 *  range input, so the input listener below never hears it. */
export function playSliderTick(normalized: number): void {
  const now = performance.now();
  if (now - lastSliderAt < 30) return;
  lastSliderAt = now;
  playUiSound("slider", normalized);
}

export function preloadUiSounds(): void {
  for (const name of Object.keys(FILES) as UiSound[]) template(name)?.load();
}

export function playUiSound(name: UiSound, value?: number): void {
  if (!enabled || masterVolume <= 0) return;
  const base = template(name);
  if (!base) {
    synth(name as SynthSound, value);
    return;
  }
  const level = VOLUME[name] * masterVolume;
  const node = base.cloneNode(true) as HTMLAudioElement;
  node.volume = Math.min(1, level);
  node.playbackRate = 0.985 + Math.random() * 0.03;
  void node.play().catch(() => {});
}

const INTERACTIVE =
  'button:not(:disabled), [role="button"], [role="switch"], a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), summary, [tabindex="0"]:not(canvas), label:has(input[type="file"])';

function interactiveTarget(target: EventTarget | null): HTMLElement | null {
  const element =
    target instanceof Element ? target.closest<HTMLElement>(INTERACTIVE) : null;
  return element && !element.closest("[data-no-uisound]") ? element : null;
}

/** Installs the interaction-wide sound layer once at the application root. */
export function installUiSoundInteractions(root: Window = window): () => void {
  const rangeValues = new WeakMap<HTMLInputElement, number>();
  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const hit = interactiveTarget(event.target);
    if (!hit) return;
    const previous = interactiveTarget(event.relatedTarget);
    if (previous === hit) return;
    const now = performance.now();
    if (now - lastHoverAt < 28) return;
    lastHoverAt = now;
    playUiSound("hover");
  };
  const onClick = (event: MouseEvent) => {
    const hit = interactiveTarget(event.target);
    if (!hit) return;
    if (hit.getAttribute("role") === "switch") {
      playUiSound(
        hit.getAttribute("aria-checked") === "true" ? "toggleOff" : "toggleOn",
      );
    } else {
      playUiSound("click");
    }
    if (hit.hasAttribute("aria-haspopup")) {
      window.setTimeout(() => {
        if (hit.getAttribute("aria-expanded") === "true") playUiSound("open");
      }, 0);
    }
  };
  const onInput = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "range") return;
    const now = performance.now();
    if (now - lastSliderAt < 30) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value);
    const normalized = max > min ? (value - min) / (max - min) : 0.5;
    const notch = Math.round(normalized * 100);
    if (rangeValues.get(input) === notch) return;
    rangeValues.set(input, notch);
    lastSliderAt = now;
    playUiSound("slider", normalized);
  };
  root.addEventListener("pointerover", onPointerOver, true);
  root.addEventListener("click", onClick, true);
  root.addEventListener("input", onInput, true);
  return () => {
    root.removeEventListener("pointerover", onPointerOver, true);
    root.removeEventListener("click", onClick, true);
    root.removeEventListener("input", onInput, true);
  };
}
