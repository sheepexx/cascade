type LaunchParams = { files?: FileSystemFileHandle[] };
type LaunchQueue = { setConsumer: (fn: (params: LaunchParams) => void) => void };

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

export function isDesktopApp(): boolean {
  return (
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as object)
  );
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

export function isUpdateReady(): boolean {
  return updateReady;
}

export function applyPendingUpdate(): void {
  void applyUpdate?.(true).catch((error) => {
    console.warn("[pwa] update could not be applied", error);
  });
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

function openExternalLinksInBrowser(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!href || !/^https?:\/\//i.test(href)) return;
      event.preventDefault();
      void import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
        openUrl(href),
      );
    },
    true,
  );
}

export function initPwa(): void {
  if (typeof window === "undefined") return;
  if (isDesktopApp()) {
    openExternalLinksInBrowser();
    return;
  }

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
  void import("virtual:pwa-register")
    .then(({ registerSW }) => {
      applyUpdate = registerSW({
        immediate: true,
        onNeedRefresh() {
          updateReady = true;
          notify();
        },
      });
    })
    .catch((error) => {
      console.warn("[pwa] service worker registration failed", error);
    });
}
