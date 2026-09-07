type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type LaunchParams = { files?: FileSystemFileHandle[] };
type LaunchQueue = { setConsumer: (fn: (params: LaunchParams) => void) => void };

let deferredPrompt: InstallPromptEvent | null = null;
let updateReady = false;
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};

export function subscribePwa(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ===
      true ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export function isUpdateReady(): boolean {
  return updateReady;
}

export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome !== "accepted") return false;
  deferredPrompt = null;
  notify();
  return true;
}

export function applyPendingUpdate(): void {
  void applyUpdate?.(true);
}

const pendingFiles: File[] = [];
let fileConsumer: ((files: File[]) => void) | null = null;

export function setLaunchFileConsumer(fn: (files: File[]) => void): () => void {
  fileConsumer = fn;
  if (pendingFiles.length) {
    const batch = pendingFiles.splice(0, pendingFiles.length);
    fn(batch);
  }
  return () => {
    if (fileConsumer === fn) fileConsumer = null;
  };
}

export function initPwa(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });

  const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer((params) => {
    void (async () => {
      const handles = params.files ?? [];
      if (!handles.length) return;
      const files = await Promise.all(handles.map((handle) => handle.getFile()));
      if (fileConsumer) fileConsumer(files);
      else pendingFiles.push(...files);
    })();
  });

  if (import.meta.env.DEV) return;
  void import("virtual:pwa-register").then(({ registerSW }) => {
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateReady = true;
        notify();
      },
    });
  });
}
