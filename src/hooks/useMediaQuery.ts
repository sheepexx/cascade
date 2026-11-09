import { useCallback, useSyncExternalStore } from "react";

function media(query: string): MediaQueryList | null {
  return typeof window === "undefined" ? null : (window.matchMedia?.(query) ?? null);
}

/** Whether a CSS media query matches, kept up to date as it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = media(query);
      list?.addEventListener("change", listener);
      return () => list?.removeEventListener("change", listener);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => media(query)?.matches === true, () => false);
}
