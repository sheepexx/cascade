import { useEffect, useState } from "react";

function isWindowActive(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible" && document.hasFocus();
}

/**
 * Whether Cascade is the window the user is in: its tab is showing and it
 * holds focus. The desktop app's webview gets the same focus and visibility
 * events as a browser tab, so this covers both.
 */
export function useWindowActive(): boolean {
  const [active, setActive] = useState(isWindowActive);

  useEffect(() => {
    // hasFocus() can still read true inside the blur handler, so blur sets
    // the state outright rather than asking.
    const onBlur = () => setActive(false);
    const onFocus = () => setActive(document.visibilityState === "visible");
    const onVisibility = () => setActive(isWindowActive());
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    setActive(isWindowActive());
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return active;
}
