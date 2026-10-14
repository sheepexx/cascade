import { useLayoutEffect, useSyncExternalStore } from "react";

function isPhoneViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches &&
    (window.innerWidth < 720 || (window.innerWidth < 1100 && window.innerHeight < 540));
}

function syncViewport() {
  const phone = isPhoneViewport();
  const root = document.documentElement;
  if (root.hasAttribute("data-phone") !== phone) root.toggleAttribute("data-phone", phone);
  const height = phone ? `${window.visualViewport?.height ?? window.innerHeight}px` : "";
  if (root.style.getPropertyValue("--phone-height") === height) return;
  if (height) root.style.setProperty("--phone-height", height);
  else root.style.removeProperty("--phone-height");
}

const listeners = new Set<() => void>();
let removeListeners: (() => void) | null = null;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!removeListeners) {
    const update = () => { syncViewport(); for (const notify of listeners) notify(); };
    const pointer = window.matchMedia("(pointer: coarse)");
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    pointer.addEventListener("change", update);
    window.visualViewport?.addEventListener("resize", update);
    update();
    removeListeners = () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      pointer.removeEventListener("change", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { removeListeners?.(); removeListeners = null; }
  };
}

/** One viewport subscription shared by the editor and its sheets. */
export function usePhoneViewport(): boolean {
  const phone = useSyncExternalStore(subscribe, isPhoneViewport, () => false);
  useLayoutEffect(syncViewport, [phone]);
  return phone;
}
